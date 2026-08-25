import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import type { FairValueGap, OrderBlock } from '../smc/index.js';
import { DEFAULT_SMC_STRATEGY_CONFIG } from './config.js';
import {
	createSmcClosedCandlePipeline,
	processSmcClosedCandle,
	type SMCClosedCandlePipelineState
} from './candle-pipeline.js';
import { createStrategyState } from './state-machine.js';
import type { TradingSetup } from './models.js';

function candle(openTimestamp: number, timeframe: '1m' | '5m', high: number): Candle {
	const duration = timeframe === '1m' ? 60_000 : 300_000;
	return {
		symbol: 'BTCUSDT',
		timeframe,
		openTimestamp,
		closeTimestamp: openTimestamp + duration - 1,
		open: 100,
		high,
		low: 95,
		close: 100,
		volume: 10,
		closed: true
	};
}

function oneMinuteCandle(
	minute: number,
	values: Pick<Candle, 'open' | 'high' | 'low' | 'close'>
): Candle {
	const openTimestamp = minute * 60_000;
	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + 59_999,
		...values,
		volume: 10,
		closed: true
	};
}

const lifecycleConfig = { ...DEFAULT_SMC_STRATEGY_CONFIG, atrPeriod: 1 };

function stateWaitingForGapRetracement(config = lifecycleConfig): {
	state: SMCClosedCandlePipelineState;
	gap: FairValueGap;
} {
	let state = createSmcClosedCandlePipeline(config).createInitialState();
	for (const current of [
		oneMinuteCandle(0, { open: 100, high: 105, low: 99, close: 104 }),
		oneMinuteCandle(1, { open: 104, high: 112, low: 103, close: 111 }),
		oneMinuteCandle(2, { open: 108, high: 114, low: 107, close: 113 })
	]) {
		state = processSmcClosedCandle(state, current, config).state;
	}

	const gap = state.timeframes['1m'].fvg.gaps[0];
	if (!gap) throw new Error('Expected bullish FVG fixture.');

	return {
		gap,
		state: {
			...state,
			htfBias: 'BULLISH',
			strategy: {
				...createStrategyState(),
				stage: 'WAITING_FOR_RETRACEMENT',
				direction: 'LONG',
				bias: 'BULLISH',
				activeFvgId: gap.id,
				sourceEventIds: ['bias', 'sweep', 'choch', 'displacement', gap.id],
				processedEventIds: ['bias', 'sweep', 'choch', 'displacement', gap.id],
				startedAt: 0,
				lastProcessedTimestamp: gap.createdAt
			},
			sequence: {
				sweep: {
					id: 'sweep',
					liquidityId: 'sell-side',
					timestamp: 59_999,
					direction: 'SELL_SIDE',
					liquidityPrice: 97,
					extremePrice: 96,
					closePrice: 98
				},
				choch: {
					id: 'choch',
					timestamp: 119_999,
					direction: 'BULLISH',
					type: 'CHOCH',
					brokenSwingId: 'swing',
					brokenLevel: 101,
					closePrice: 102
				},
				displacement: {
					id: 'displacement',
					symbol: 'BTCUSDT',
					timeframe: '1m',
					timestamp: 119_999,
					direction: 'BULLISH',
					bodySize: 7,
					atr: 4,
					threshold: 4.8
				}
			}
		}
	};
}

function withPendingSetup(
	state: SMCClosedCandlePipelineState,
	gap: FairValueGap,
	overrides: Partial<TradingSetup> = {}
): SMCClosedCandlePipelineState {
	const setup: TradingSetup = {
		id: 'pending-setup',
		symbol: 'BTCUSDT',
		createdAt: gap.createdAt,
		updatedAt: gap.createdAt,
		direction: 'LONG',
		status: 'VALID',
		score: 85,
		classification: 'STRONG',
		entryZone: { min: gap.bottom, max: gap.top },
		entryPrice: gap.top,
		stopLoss: 95,
		takeProfit: 131,
		riskReward: 2,
		reasons: [],
		sourceEventIds: ['bias', 'sweep', 'choch', 'displacement', gap.id],
		dependencies: {
			fvgId: gap.id,
			orderBlockId: null,
			sweepId: 'sweep',
			structureBreakId: 'choch',
			displacementId: 'displacement'
		},
		pendingEntryBars: 0,
		...overrides
	};
	return { ...state, setupRegistry: [setup], activeSetupId: setup.id };
}

describe('shared closed-candle SMC pipeline', () => {
	it('processes chronological 1m and 5m candles through isolated timeframe state', () => {
		const pipeline = createSmcClosedCandlePipeline(DEFAULT_SMC_STRATEGY_CONFIG);
		let state = pipeline.createInitialState();
		state = pipeline.processClosedCandle(
			state,
			candle(0, '1m', 101),
			DEFAULT_SMC_STRATEGY_CONFIG
		).state;
		state = pipeline.processClosedCandle(
			state,
			candle(0, '5m', 102),
			DEFAULT_SMC_STRATEGY_CONFIG
		).state;

		expect(state.processedCandles).toBe(2);
		expect(state.timeframes['1m'].recentCandles).toHaveLength(1);
		expect(state.timeframes['5m'].recentCandles).toHaveLength(1);
		expect(state.timeframes['1m'].processedCandles).toBe(1);
		expect(state.timeframes['1m'].atr.processedCandles).toBe(1);
		expect(state.timeframes['5m'].atr.processedCandles).toBe(1);
	});

	it('confirms a rightBars swing only on the fifth closed candle', () => {
		const pipeline = createSmcClosedCandlePipeline(DEFAULT_SMC_STRATEGY_CONFIG);
		let state = pipeline.createInitialState();
		const highs = [101, 102, 110, 103, 102];

		for (let index = 0; index < highs.length; index += 1) {
			state = processSmcClosedCandle(
				state,
				candle(index * 60_000, '1m', highs[index]!),
				DEFAULT_SMC_STRATEGY_CONFIG
			).state;
			if (index < 4) expect(state.timeframes['1m'].marketStructure.lastHigh).toBeNull();
		}

		expect(state.timeframes['1m'].marketStructure.lastHigh).toMatchObject({
			sourceIndex: 2,
			confirmedTimestamp: 299_999
		});
	});

	it('rejects reverse-time candles before any domain state can be contaminated', () => {
		const pipeline = createSmcClosedCandlePipeline(DEFAULT_SMC_STRATEGY_CONFIG);
		const state = pipeline.processClosedCandle(
			pipeline.createInitialState(),
			candle(60_000, '1m', 102),
			DEFAULT_SMC_STRATEGY_CONFIG
		).state;

		expect(() =>
			pipeline.processClosedCandle(state, candle(0, '1m', 101), DEFAULT_SMC_STRATEGY_CONFIG)
		).toThrow(/non-decreasing close time/);
	});

	it('emits a VALID setup before touch, then triggers it on the first entry boundary touch', () => {
		const { state, gap } = stateWaitingForGapRetracement();
		const valid = processSmcClosedCandle(
			state,
			oneMinuteCandle(3, { open: 110, high: 111, low: 108, close: 109 }),
			lifecycleConfig
		);
		const setup = valid.setups[0];

		expect(valid.state.timeframes['1m'].fvg.gaps.find(({ id }) => id === gap.id)?.state).toBe(
			'UNTOUCHED'
		);
		expect(setup).toMatchObject({
			status: 'VALID',
			entryZone: { min: gap.bottom, max: gap.top },
			entryPrice: gap.top,
			pendingEntryBars: 0,
			dependencies: { fvgId: gap.id }
		});
		expect(valid.state.activeSetupId).toBe(setup?.id);
		expect(setup?.sourceEventIds).toContain(gap.id);

		const triggered = processSmcClosedCandle(
			valid.state,
			oneMinuteCandle(4, { open: 109, high: 110, low: 106, close: 108 }),
			lifecycleConfig
		);
		expect(triggered.setups[0]).toMatchObject({
			id: setup?.id,
			status: 'TRIGGERED',
			pendingEntryBars: 1,
			triggeredAt: 299_999
		});
		expect(triggered.state.activeSetupId).toBeNull();
	});

	it('does not create a setup when the active FVG is canonically FILLED', () => {
		const { state, gap } = stateWaitingForGapRetracement();
		const filled = processSmcClosedCandle(
			state,
			oneMinuteCandle(3, { open: 108, high: 110, low: 104, close: 106 }),
			lifecycleConfig
		);
		const canonicalGap = filled.state.timeframes['1m'].fvg.gaps.find(({ id }) => id === gap.id);

		expect(canonicalGap?.state).toBe('FILLED');
		expect(filled.state.strategy).toMatchObject({
			stage: 'WAITING_FOR_SWEEP',
			activeFvgId: null
		});
		expect(filled.setups).toEqual([]);

		const future = processSmcClosedCandle(
			filled.state,
			oneMinuteCandle(4, { open: 106, high: 109, low: 105, close: 108 }),
			lifecycleConfig
		);
		expect(future.state.timeframes['1m'].fvg.gaps.find(({ id }) => id === gap.id)?.state).toBe(
			'FILLED'
		);
		expect(future.setups).toEqual([]);
	});

	it('invalidates a pending setup on bias reversal before any entry touch', () => {
		const fixture = stateWaitingForGapRetracement();
		const pending = withPendingSetup(fixture.state, fixture.gap);
		const state = {
			...pending,
			timeframes: {
				...pending.timeframes,
				'5m': {
					...pending.timeframes['5m'],
					marketStructure: {
						...pending.timeframes['5m'].marketStructure,
						bias: 'BEARISH' as const
					}
				}
			}
		};
		const result = processSmcClosedCandle(state, candle(0, '5m', 110), lifecycleConfig);

		expect(result.setups[0]).toMatchObject({
			status: 'INVALIDATED',
			invalidationReason: 'HTF_BIAS_REVERSED'
		});
		expect(result.state.activeSetupId).toBeNull();
	});

	it('invalidates a pending setup when its canonical FVG becomes FILLED', () => {
		const fixture = stateWaitingForGapRetracement();
		const state = withPendingSetup(fixture.state, fixture.gap);
		const result = processSmcClosedCandle(
			state,
			oneMinuteCandle(3, { open: 108, high: 110, low: 104, close: 106 }),
			lifecycleConfig
		);

		expect(result.setups[0]).toMatchObject({
			status: 'INVALIDATED',
			invalidationReason: 'DEPENDENT_FVG_FILLED'
		});
		expect(result.state.activeSetupId).toBeNull();
	});

	it('invalidates a pending setup when its required Order Block is invalidated', () => {
		const fixture = stateWaitingForGapRetracement();
		const block: OrderBlock = {
			id: 'required-ob',
			type: 'BULLISH',
			createdAt: fixture.gap.createdAt,
			sourceCandleTimestamp: 119_999,
			high: 109,
			low: 106,
			midpoint: 107.5,
			state: 'ACTIVE',
			causalStructureBreakId: 'choch'
		};
		let state = withPendingSetup(fixture.state, fixture.gap, {
			entryZone: { min: 106, max: 107 },
			entryPrice: 107,
			dependencies: {
				fvgId: fixture.gap.id,
				orderBlockId: block.id,
				sweepId: 'sweep',
				structureBreakId: 'choch',
				displacementId: 'displacement'
			}
		});
		state = {
			...state,
			timeframes: {
				...state.timeframes,
				'1m': {
					...state.timeframes['1m'],
					orderBlocks: {
						...state.timeframes['1m'].orderBlocks,
						blocks: [...state.timeframes['1m'].orderBlocks.blocks, block]
					}
				}
			}
		};
		const result = processSmcClosedCandle(
			state,
			oneMinuteCandle(3, { open: 108, high: 109, low: 105.5, close: 105.5 }),
			lifecycleConfig
		);

		expect(result.setups[0]).toMatchObject({
			status: 'INVALIDATED',
			invalidationReason: 'DEPENDENT_ORDER_BLOCK_INVALIDATED'
		});
		expect(result.state.activeSetupId).toBeNull();
	});

	it('expires after the configured pending bars and cannot trigger later', () => {
		const config = { ...lifecycleConfig, maxPendingEntryBars: 2 };
		const fixture = stateWaitingForGapRetracement(config);
		let state = withPendingSetup(fixture.state, fixture.gap);

		for (const minute of [3, 4]) {
			const pending = processSmcClosedCandle(
				state,
				oneMinuteCandle(minute, { open: 109, high: 110, low: 108, close: 109 }),
				config
			);
			expect(pending.setups).toEqual([]);
			state = pending.state;
		}
		expect(state.setupRegistry[0]?.pendingEntryBars).toBe(2);

		const expired = processSmcClosedCandle(
			state,
			oneMinuteCandle(5, { open: 109, high: 110, low: 106, close: 108 }),
			config
		);
		expect(expired.setups[0]).toMatchObject({
			status: 'INVALIDATED',
			invalidationReason: 'PENDING_EXPIRED'
		});
		expect(expired.state.activeSetupId).toBeNull();

		const lateTouch = processSmcClosedCandle(
			expired.state,
			oneMinuteCandle(6, { open: 108, high: 109, low: 106, close: 107 }),
			config
		);
		expect(lateTouch.setups).toEqual([]);
	});
});
