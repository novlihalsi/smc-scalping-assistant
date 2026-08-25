import { describe, expect, it } from 'vitest';

import { CandleContinuityError, type Candle } from '../market/index.js';
import type { FairValueGap } from '../smc/index.js';
import {
	createCanonicalMinutePipelineState,
	DEFAULT_SMC_STRATEGY_CONFIG,
	type CanonicalMinutePipelineState,
	type SMCStrategyConfig,
	type TradingSetup
} from '../strategy/index.js';
import {
	createSmcClosedCandleState,
	processSmcClosedCandle,
	type SMCClosedCandlePipelineState
} from '../strategy/candle-pipeline.js';
import { createStrategyState } from '../strategy/state-machine.js';
import { runCanonicalReplayParity } from './parity-harness.js';

type FixtureDirection = TradingSetup['direction'];

const parityConfig = { ...DEFAULT_SMC_STRATEGY_CONFIG, atrPeriod: 1 };

function minuteCandle(
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

function setupSequence(direction: FixtureDirection): readonly Candle[] {
	return direction === 'LONG'
		? [
				minuteCandle(8, { open: 100, high: 105, low: 99, close: 104 }),
				minuteCandle(9, { open: 104, high: 112, low: 103, close: 111 }),
				minuteCandle(10, { open: 108, high: 114, low: 107, close: 113 })
			]
		: [
				minuteCandle(8, { open: 110, high: 111, low: 105, close: 106 }),
				minuteCandle(9, { open: 106, high: 107, low: 98, close: 99 }),
				minuteCandle(10, { open: 101, high: 102, low: 96, close: 97 })
			];
}

function createSetupCheckpoint(
	direction: FixtureDirection,
	config: SMCStrategyConfig = parityConfig
): { state: CanonicalMinutePipelineState; gap: FairValueGap } {
	const source = setupSequence(direction);
	let pipeline = createSmcClosedCandleState(config);
	for (const candle of source) {
		pipeline = processSmcClosedCandle(pipeline, candle, config).state;
	}
	const gapType = direction === 'LONG' ? 'BULLISH' : 'BEARISH';
	const rawGap = pipeline.timeframes['1m'].fvg.gaps.find(
		(candidate) => candidate.type === gapType && candidate.createdAt === source[2]!.closeTimestamp
	);
	if (!rawGap) throw new Error(`Expected ${gapType} FVG fixture.`);

	const bias: 'BULLISH' | 'BEARISH' = direction === 'LONG' ? 'BULLISH' : 'BEARISH';
	const sweepDirection = direction === 'LONG' ? 'SELL_SIDE' : 'BUY_SIDE';
	const sequenceDirection: 'BULLISH' | 'BEARISH' = direction === 'LONG' ? 'BULLISH' : 'BEARISH';
	const sweep = {
		id: `${direction}-sweep`,
		liquidityId: `${direction}-liquidity`,
		timestamp: source[0]!.closeTimestamp,
		direction: sweepDirection,
		liquidityPrice: direction === 'LONG' ? 97 : 113,
		extremePrice: direction === 'LONG' ? 96 : 114,
		closePrice: direction === 'LONG' ? 98 : 112
	} as const;
	const choch = {
		id: `${direction}-choch`,
		timestamp: source[1]!.closeTimestamp,
		direction: sequenceDirection,
		type: 'CHOCH' as const,
		brokenSwingId: `${direction}-structure`,
		brokenLevel: direction === 'LONG' ? 108 : 100,
		closePrice: source[1]!.close
	};
	const displacement = {
		id: `${direction}-displacement`,
		symbol: 'BTCUSDT',
		timeframe: '1m' as const,
		timestamp: source[1]!.closeTimestamp,
		direction: sequenceDirection,
		bodySize: 7,
		atr: 4,
		threshold: 4.8,
		causalSequenceId: `${direction}-sequence`,
		causalStructureBreakId: choch.id
	};
	const sequenceId = `${direction}-sequence`;
	const gap: FairValueGap = {
		...rawGap,
		causalSequenceId: sequenceId,
		causalStructureBreakId: choch.id,
		causalDisplacementId: displacement.id
	};
	const sourceEventIds = ['bias', sweep.id, choch.id, displacement.id, gap.id];
	const strategy = {
		...createStrategyState(),
		stage: 'WAITING_FOR_RETRACEMENT' as const,
		direction,
		bias,
		activeFvgId: gap.id,
		sourceEventIds,
		processedEventIds: sourceEventIds,
		startedAt: source[0]!.closeTimestamp,
		lastProcessedTimestamp: gap.createdAt
	};
	const seededPipeline: SMCClosedCandlePipelineState = {
		...pipeline,
		htfBias: bias,
		strategy,
		sequence: { id: sequenceId, sweep, choch, displacement, fvgId: gap.id },
		timeframes: {
			...pipeline.timeframes,
			'1m': {
				...pipeline.timeframes['1m'],
				fvg: {
					...pipeline.timeframes['1m'].fvg,
					gaps: pipeline.timeframes['1m'].fvg.gaps.map((candidate) =>
						candidate.id === gap.id ? gap : candidate
					)
				}
			},
			'5m': {
				...pipeline.timeframes['5m'],
				bos: {
					...pipeline.timeframes['5m'].bos,
					symbol: 'BTCUSDT',
					timeframe: '5m',
					protectedHigh:
						direction === 'SHORT'
							? {
									swingId: 'protected-lh',
									price: 120,
									confirmedAt: 419_999,
									establishedAt: 479_999,
									causalBosId: 'protecting-bos'
								}
							: null,
					protectedLow:
						direction === 'LONG'
							? {
									swingId: 'protected-hl',
									price: 90,
									confirmedAt: 419_999,
									establishedAt: 479_999,
									causalBosId: 'protecting-bos'
								}
							: null,
					bullishExpansionHigh:
						direction === 'LONG'
							? { price: 130, timestamp: 599_999, causalBosId: 'protecting-bos' }
							: null,
					bearishExpansionLow:
						direction === 'SHORT'
							? { price: 90, timestamp: 599_999, causalBosId: 'protecting-bos' }
							: null,
					lastProcessedTimestamp: 599_999
				}
			}
		}
	};
	const state = createCanonicalMinutePipelineState(config);

	return {
		gap,
		state: {
			...state,
			pipeline: seededPipeline,
			pendingFiveMinuteSource: [{ ...source[2]! }],
			processedOneMinuteCandles: source.length,
			lastProcessedMinuteTimestamp: source[2]!.closeTimestamp
		}
	};
}

function continuation(direction: FixtureDirection): readonly Candle[] {
	return direction === 'LONG'
		? [
				minuteCandle(11, { open: 113, high: 114, low: 108, close: 110 }),
				minuteCandle(12, { open: 109, high: 110, low: 106, close: 108 }),
				minuteCandle(13, { open: 110, high: 132, low: 108, close: 131 }),
				minuteCandle(14, { open: 131, high: 133, low: 130, close: 132 })
			]
		: [
				minuteCandle(11, { open: 99, high: 101, low: 96, close: 98 }),
				minuteCandle(12, { open: 99, high: 103, low: 98, close: 101 }),
				minuteCandle(13, { open: 98, high: 101, low: 75, close: 77 }),
				minuteCandle(14, { open: 77, high: 78, low: 76, close: 77 })
			];
}

function parityOptions(
	state: CanonicalMinutePipelineState,
	candles: readonly Candle[],
	config: SMCStrategyConfig = parityConfig
) {
	return {
		input: {
			symbol: 'BTCUSDT',
			startDate: candles[0]!.openTimestamp,
			endDate: candles.at(-1)!.openTimestamp,
			config
		},
		candles,
		initialState: state
	};
}

describe('historical and realtime-style canonical replay parity', () => {
	it.each(['LONG', 'SHORT'] as const)(
		'produces an identical successful %s setup lifecycle and trade',
		(direction) => {
			const fixture = createSetupCheckpoint(direction);
			const result = runCanonicalReplayParity(
				parityOptions(fixture.state, continuation(direction))
			);

			expect(result.comparison).toEqual({
				normalizedEvents: true,
				setupLifecycle: true,
				finalState: true,
				trades: true,
				endOfRangeStates: true,
				matches: true
			});
			expect(result.historical.setupLifecycle.map(({ status }) => status)).toEqual([
				'VALID',
				'TRIGGERED'
			]);
			expect(result.historical.trades).toEqual([
				expect.objectContaining({ direction, result: 'WIN', exitReason: 'TAKE_PROFIT' })
			]);
			expect(result.historical.normalizedEvents.slice(-2).map(({ type }) => type)).toEqual([
				'DERIVED_BIAS_CANDLE',
				'CANONICAL_MINUTE_CANDLE'
			]);
		}
	);

	it('invalidates a pending setup when its canonical FVG fills before entry', () => {
		const fixture = createSetupCheckpoint('LONG');
		const candles = [
			minuteCandle(11, { open: 113, high: 114, low: 108, close: 110 }),
			minuteCandle(12, { open: 109, high: 110, low: 104, close: 106 })
		];
		const result = runCanonicalReplayParity(parityOptions(fixture.state, candles));

		expect(result.comparison.matches).toBe(true);
		expect(result.historical.setupLifecycle).toEqual([
			expect.objectContaining({ status: 'VALID' }),
			expect.objectContaining({
				status: 'INVALIDATED',
				invalidationReason: 'DEPENDENT_FVG_FILLED'
			})
		]);
		expect(result.historical.trades).toEqual([]);
		expect(result.historical.censoredOpenTrades).toEqual([]);
	});

	it('invalidates a pending setup when the derived higher-timeframe bias reverses', () => {
		const fixture = createSetupCheckpoint('LONG');
		const state = {
			...fixture.state,
			pipeline: {
				...fixture.state.pipeline,
				timeframes: {
					...fixture.state.pipeline.timeframes,
					'5m': {
						...fixture.state.pipeline.timeframes['5m'],
						marketStructure: {
							...fixture.state.pipeline.timeframes['5m'].marketStructure,
							bias: 'BEARISH' as const
						}
					}
				}
			}
		};
		const candles = [
			minuteCandle(11, { open: 113, high: 114, low: 108, close: 110 }),
			minuteCandle(12, { open: 111, high: 113, low: 108, close: 112 }),
			minuteCandle(13, { open: 112, high: 114, low: 108, close: 113 }),
			minuteCandle(14, { open: 113, high: 115, low: 108, close: 114 })
		];
		const result = runCanonicalReplayParity(parityOptions(state, candles));

		expect(result.comparison.matches).toBe(true);
		expect(result.historical.setupLifecycle.at(-1)).toMatchObject({
			status: 'INVALIDATED',
			invalidationReason: 'HTF_BIAS_REVERSED'
		});
		expect(result.historical.trades).toEqual([]);
		expect(result.historical.expiredPendingTrades).toEqual([]);
	});

	it('expires a pending setup before a later entry-zone touch', () => {
		const config = { ...parityConfig, maxPendingEntryBars: 1 };
		const fixture = createSetupCheckpoint('LONG', config);
		const candles = [
			minuteCandle(11, { open: 113, high: 114, low: 108, close: 110 }),
			minuteCandle(12, { open: 111, high: 113, low: 108, close: 112 }),
			minuteCandle(13, { open: 110, high: 112, low: 106, close: 108 })
		];
		const result = runCanonicalReplayParity(parityOptions(fixture.state, candles, config));

		expect(result.comparison.matches).toBe(true);
		expect(result.historical.setupLifecycle.at(-1)).toMatchObject({
			status: 'INVALIDATED',
			invalidationReason: 'PENDING_EXPIRED'
		});
		expect(result.historical.trades).toEqual([]);
		expect(result.historical.censoredOpenTrades).toEqual([]);
	});

	it('fails fast on a missing canonical minute without mutating the replay checkpoint', () => {
		const fixture = createSetupCheckpoint('LONG');
		const beforeGap = structuredClone(fixture.state);
		const candles = [
			minuteCandle(11, { open: 113, high: 114, low: 108, close: 110 }),
			minuteCandle(13, { open: 110, high: 112, low: 106, close: 108 })
		];

		expect(() => runCanonicalReplayParity(parityOptions(fixture.state, candles))).toThrowError(
			expect.objectContaining<Partial<CandleContinuityError>>({ code: 'DATA_GAP' })
		);
		expect(fixture.state).toEqual(beforeGap);
	});
});
