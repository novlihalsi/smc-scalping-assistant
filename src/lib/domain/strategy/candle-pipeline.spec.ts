import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import type { FairValueGap, OrderBlock } from '../smc/index.js';
import { DEFAULT_SMC_STRATEGY_CONFIG } from './config.js';
import {
	createSmcClosedCandleState,
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
	let state = createSmcClosedCandleState(config);
	for (const current of [
		oneMinuteCandle(0, { open: 100, high: 105, low: 99, close: 104 }),
		oneMinuteCandle(1, { open: 104, high: 112, low: 103, close: 111 }),
		oneMinuteCandle(2, { open: 108, high: 114, low: 107, close: 113 })
	]) {
		state = processSmcClosedCandle(state, current, config).state;
	}

	const rawGap = state.timeframes['1m'].fvg.gaps[0];
	if (!rawGap) throw new Error('Expected bullish FVG fixture.');
	const sequenceId = 'active-sequence';
	const gap: FairValueGap = {
		...rawGap,
		causalSequenceId: sequenceId,
		causalStructureBreakId: 'choch',
		causalDisplacementId: 'displacement'
	};

	return {
		gap,
		state: {
			...state,
			timeframes: {
				...state.timeframes,
				'1m': {
					...state.timeframes['1m'],
					fvg: {
						...state.timeframes['1m'].fvg,
						gaps: state.timeframes['1m'].fvg.gaps.map((candidate) =>
							candidate.id === gap.id ? gap : candidate
						)
					}
				},
				'5m': {
					...state.timeframes['5m'],
					bos: {
						...state.timeframes['5m'].bos,
						symbol: 'BTCUSDT',
						timeframe: '5m',
						protectedLow: {
							swingId: 'protected-hl',
							price: 100,
							confirmedAt: 59_999,
							establishedAt: 119_999,
							causalBosId: 'protecting-bos'
						},
						bullishExpansionHigh: {
							price: 114,
							timestamp: 179_999,
							causalBosId: 'protecting-bos'
						},
						lastProcessedTimestamp: 179_999
					}
				}
			},
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
				id: sequenceId,
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
					threshold: 4.8,
					causalSequenceId: sequenceId,
					causalStructureBreakId: 'choch'
				},
				fvgId: gap.id
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
		eligibility: { eligible: true, failures: [] },
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
			sequenceId: 'active-sequence',
			fvgId: gap.id,
			orderBlockId: null,
			sweepId: 'sweep',
			structureBreakId: 'choch',
			displacementId: 'displacement',
			protectedSwingId: 'protected-hl',
			protectedSwingPrice: 100,
			protectedBosId: 'protecting-bos'
		},
		pendingEntryBars: 0,
		...overrides
	};
	return { ...state, setupRegistry: [setup], activeSetupId: setup.id };
}

describe('shared closed-candle SMC pipeline', () => {
	it('confirms a rightBars swing only on the fifth closed candle', () => {
		let state = createSmcClosedCandleState(DEFAULT_SMC_STRATEGY_CONFIG);
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
		const state = processSmcClosedCandle(
			createSmcClosedCandleState(DEFAULT_SMC_STRATEGY_CONFIG),
			candle(60_000, '1m', 102),
			DEFAULT_SMC_STRATEGY_CONFIG
		).state;

		expect(() =>
			processSmcClosedCandle(state, candle(0, '1m', 101), DEFAULT_SMC_STRATEGY_CONFIG)
		).toThrow(/non-decreasing close time/);
	});

	it('evaluates displacement against the ATR known before the current candle', () => {
		const config = {
			...DEFAULT_SMC_STRATEGY_CONFIG,
			atrPeriod: 1,
			displacementATRMultiplier: 2
		};
		let state = processSmcClosedCandle(
			createSmcClosedCandleState(config),
			oneMinuteCandle(0, { open: 100, high: 101, low: 99, close: 100 }),
			config
		).state;
		state = {
			...state,
			htfBias: 'BULLISH',
			strategy: {
				...createStrategyState(),
				stage: 'WAITING_FOR_DISPLACEMENT',
				direction: 'LONG',
				bias: 'BULLISH',
				sourceEventIds: ['bias', 'sweep', 'choch'],
				processedEventIds: ['bias', 'sweep', 'choch'],
				startedAt: 0,
				lastProcessedTimestamp: 59_999
			},
			sequence: {
				id: 'active-sequence',
				sweep: {
					id: 'sweep',
					liquidityId: 'sell-side',
					timestamp: 59_999,
					direction: 'SELL_SIDE',
					liquidityPrice: 99,
					extremePrice: 98,
					closePrice: 100
				},
				choch: {
					id: 'choch',
					timestamp: 59_999,
					direction: 'BULLISH',
					type: 'CHOCH',
					brokenSwingId: 'lh',
					brokenLevel: 101,
					closePrice: 102
				},
				displacement: null,
				fvgId: null
			}
		};

		const result = processSmcClosedCandle(
			state,
			oneMinuteCandle(1, { open: 100, high: 110, low: 100, close: 105 }),
			config
		);

		expect(result.state.sequence.displacement).toMatchObject({
			bodySize: 5,
			atr: 2,
			threshold: 4
		});
		expect(result.state.timeframes['1m'].atr.atr).toBe(10);
	});

	it('advances at most one dependent strategy stage per OHLC candle', () => {
		const config = {
			...DEFAULT_SMC_STRATEGY_CONFIG,
			atrPeriod: 1,
			displacementATRMultiplier: 0.1
		};
		let state = processSmcClosedCandle(
			createSmcClosedCandleState(config),
			oneMinuteCandle(0, { open: 100, high: 101, low: 99, close: 100 }),
			config
		).state;
		state = {
			...state,
			htfBias: 'BULLISH',
			strategy: {
				...createStrategyState(),
				stage: 'WAITING_FOR_SWEEP',
				direction: 'LONG',
				bias: 'BULLISH',
				sourceEventIds: ['bias'],
				processedEventIds: ['bias'],
				startedAt: 0,
				lastProcessedTimestamp: 59_999
			},
			timeframes: {
				...state.timeframes,
				'1m': {
					...state.timeframes['1m'],
					marketStructure: {
						symbol: 'BTCUSDT',
						timeframe: '1m',
						bias: 'BEARISH',
						sequence: [{ swingId: 'lh', timestamp: 59_999, price: 101, structure: 'LH' }],
						lastHigh: null,
						lastLow: null,
						latestHighStructure: 'LH',
						latestLowStructure: 'LL',
						lastProcessedTimestamp: 59_999
					},
					liquidity: {
						...state.timeframes['1m'].liquidity,
						levels: [
							{
								id: 'sell-side',
								type: 'SELL_SIDE',
								price: 99,
								createdAt: 59_999,
								source: 'SWING_LOW',
								sourceSwingIds: ['low'],
								status: 'ACTIVE'
							}
						]
					}
				}
			}
		};

		const result = processSmcClosedCandle(
			state,
			oneMinuteCandle(1, { open: 100, high: 106, low: 98, close: 105 }),
			config
		);

		expect(result.state.strategy.stage).toBe('WAITING_FOR_CHOCH');
		expect(result.state.sequence.sweep).not.toBeNull();
		expect(result.state.sequence.choch).toBeNull();
		expect(result.state.sequence.displacement).toBeNull();
	});

	it('does not let a newer FVG formed outside the active displacement window hijack the sequence', () => {
		let state = createSmcClosedCandleState(lifecycleConfig);
		for (const current of [
			oneMinuteCandle(0, { open: 100, high: 101, low: 99, close: 100 }),
			oneMinuteCandle(1, { open: 100, high: 101, low: 99, close: 100 }),
			oneMinuteCandle(2, { open: 100, high: 101, low: 99, close: 100 })
		]) {
			state = processSmcClosedCandle(state, current, lifecycleConfig).state;
		}
		state = {
			...state,
			htfBias: 'BULLISH',
			strategy: {
				...createStrategyState(),
				stage: 'WAITING_FOR_FVG',
				direction: 'LONG',
				bias: 'BULLISH',
				sourceEventIds: ['bias', 'sweep', 'choch', 'displacement'],
				processedEventIds: ['bias', 'sweep', 'choch', 'displacement'],
				startedAt: 0,
				lastProcessedTimestamp: 179_999
			},
			sequence: {
				id: 'active-sequence',
				sweep: {
					id: 'sweep',
					liquidityId: 'sell-side',
					timestamp: 59_999,
					direction: 'SELL_SIDE',
					liquidityPrice: 99,
					extremePrice: 98,
					closePrice: 100
				},
				choch: {
					id: 'choch',
					timestamp: 59_999,
					direction: 'BULLISH',
					type: 'CHOCH',
					brokenSwingId: 'lh',
					brokenLevel: 100,
					closePrice: 101
				},
				displacement: {
					id: 'displacement',
					symbol: 'BTCUSDT',
					timeframe: '1m',
					timestamp: 59_999,
					direction: 'BULLISH',
					bodySize: 3,
					atr: 2,
					threshold: 2.4,
					causalSequenceId: 'active-sequence',
					causalStructureBreakId: 'choch'
				},
				fvgId: null
			}
		};

		const result = processSmcClosedCandle(
			state,
			oneMinuteCandle(3, { open: 102, high: 104, low: 102, close: 103 }),
			lifecycleConfig
		);

		expect(result.state.strategy.stage).toBe('WAITING_FOR_FVG');
		expect(result.state.strategy.activeFvgId).toBeNull();
		expect(result.setups).toEqual([]);
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
			eligibility: { eligible: true, failures: [] },
			score: 25,
			classification: 'WEAK',
			entryZone: { min: gap.bottom, max: gap.top },
			entryPrice: gap.top,
			pendingEntryBars: 0,
			dependencies: {
				sequenceId: 'active-sequence',
				fvgId: gap.id,
				protectedSwingId: 'protected-hl',
				protectedSwingPrice: 100,
				protectedBosId: 'protecting-bos'
			}
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

	it('ignores older and newer same-direction FVGs outside the active sequence', () => {
		const fixture = stateWaitingForGapRetracement();
		const setupCandle = oneMinuteCandle(3, { open: 110, high: 111, low: 108, close: 109 });
		const baseline = processSmcClosedCandle(fixture.state, setupCandle, lifecycleConfig).setups[0];
		const unrelatedGaps: FairValueGap[] = [
			{
				...fixture.gap,
				id: 'older-unrelated-fvg',
				createdAt: 119_999,
				lastUpdatedAt: 119_999,
				sourceCandleTimestamps: [0, 59_999, 119_999],
				bottom: 80,
				top: 81,
				midpoint: 80.5,
				causalSequenceId: 'older-sequence',
				causalStructureBreakId: 'older-choch',
				causalDisplacementId: 'older-displacement'
			},
			{
				...fixture.gap,
				id: 'newer-unrelated-fvg',
				createdAt: 200_000,
				lastUpdatedAt: 200_000,
				sourceCandleTimestamps: [120_000, 160_000, 200_000],
				bottom: 82,
				top: 83,
				midpoint: 82.5,
				causalSequenceId: 'newer-sequence',
				causalStructureBreakId: 'newer-choch',
				causalDisplacementId: 'newer-displacement'
			}
		];
		const adversarialState: SMCClosedCandlePipelineState = {
			...fixture.state,
			timeframes: {
				...fixture.state.timeframes,
				'1m': {
					...fixture.state.timeframes['1m'],
					fvg: {
						...fixture.state.timeframes['1m'].fvg,
						gaps: [unrelatedGaps[0]!, fixture.gap, unrelatedGaps[1]!]
					}
				}
			}
		};
		const adversarial = processSmcClosedCandle(adversarialState, setupCandle, lifecycleConfig)
			.setups[0];

		expect(adversarial).toMatchObject({
			entryZone: baseline?.entryZone,
			entryPrice: baseline?.entryPrice,
			eligibility: baseline?.eligibility,
			score: baseline?.score,
			reasons: baseline?.reasons,
			dependencies: baseline?.dependencies
		});
	});

	it('ignores a newer unrelated OB and selects only confluence from the active sequence', () => {
		const fixture = stateWaitingForGapRetracement();
		const setupCandle = oneMinuteCandle(3, { open: 110, high: 111, low: 108, close: 109 });
		const causalBlock: OrderBlock = {
			id: 'causal-ob',
			type: 'BULLISH',
			createdAt: 190_000,
			sourceCandleTimestamp: 119_999,
			high: 106.5,
			low: 105.5,
			midpoint: 106,
			state: 'ACTIVE',
			causalStructureBreakId: 'bos-on-displacement',
			causalDisplacementId: 'displacement',
			causalSequenceId: 'active-sequence'
		};
		const unrelatedBlock: OrderBlock = {
			...causalBlock,
			id: 'newer-unrelated-ob',
			createdAt: 200_000,
			high: 107,
			low: 106.8,
			midpoint: 106.9,
			causalStructureBreakId: 'unrelated-bos',
			causalDisplacementId: 'unrelated-displacement',
			causalSequenceId: 'unrelated-sequence'
		};
		const withBlocks = (blocks: readonly OrderBlock[]): SMCClosedCandlePipelineState => ({
			...fixture.state,
			timeframes: {
				...fixture.state.timeframes,
				'1m': {
					...fixture.state.timeframes['1m'],
					orderBlocks: { ...fixture.state.timeframes['1m'].orderBlocks, blocks }
				}
			}
		});
		const baseline = processSmcClosedCandle(withBlocks([]), setupCandle, lifecycleConfig).setups[0];
		const unrelatedOnly = processSmcClosedCandle(
			withBlocks([unrelatedBlock]),
			setupCandle,
			lifecycleConfig
		).setups[0];
		const causal = processSmcClosedCandle(withBlocks([causalBlock]), setupCandle, lifecycleConfig)
			.setups[0];
		const adversarial = processSmcClosedCandle(
			withBlocks([causalBlock, unrelatedBlock]),
			setupCandle,
			lifecycleConfig
		).setups[0];

		expect(unrelatedOnly).toMatchObject({
			entryZone: baseline?.entryZone,
			entryPrice: baseline?.entryPrice,
			eligibility: baseline?.eligibility,
			score: baseline?.score,
			reasons: baseline?.reasons,
			dependencies: baseline?.dependencies
		});
		expect(causal?.dependencies.orderBlockId).toBe(causalBlock.id);
		expect(adversarial).toMatchObject({
			entryZone: causal?.entryZone,
			entryPrice: causal?.entryPrice,
			eligibility: causal?.eligibility,
			score: causal?.score,
			reasons: causal?.reasons,
			dependencies: causal?.dependencies
		});
	});

	it('emits no setup when a mandatory eligibility rule fails', () => {
		const { state } = stateWaitingForGapRetracement();
		const result = processSmcClosedCandle(
			{ ...state, htfBias: 'BEARISH' },
			oneMinuteCandle(3, { open: 110, high: 111, low: 108, close: 109 }),
			lifecycleConfig
		);

		expect(result.setups).toEqual([]);
		expect(result.state.setupRegistry).toEqual([]);
	});

	it('does not create a setup without protected structure established by a causal BOS', () => {
		const { state } = stateWaitingForGapRetracement();
		const result = processSmcClosedCandle(
			{
				...state,
				timeframes: {
					...state.timeframes,
					'5m': {
						...state.timeframes['5m'],
						bos: {
							...state.timeframes['5m'].bos,
							protectedLow: null,
							bullishExpansionHigh: null
						}
					}
				}
			},
			oneMinuteCandle(3, { open: 110, high: 111, low: 108, close: 109 }),
			lifecycleConfig
		);

		expect(result.setups).toEqual([]);
		expect(result.state.setupRegistry).toEqual([]);
	});

	it('does not create a LONG setup on a candle that closes below its protected low', () => {
		const { state } = stateWaitingForGapRetracement();
		const result = processSmcClosedCandle(
			{
				...state,
				timeframes: {
					...state.timeframes,
					'5m': {
						...state.timeframes['5m'],
						bos: {
							...state.timeframes['5m'].bos,
							protectedLow: {
								...state.timeframes['5m'].bos.protectedLow!,
								price: 109
							}
						}
					}
				}
			},
			oneMinuteCandle(3, { open: 110, high: 111, low: 108, close: 108.5 }),
			lifecycleConfig
		);

		expect(result.setups).toEqual([]);
		expect(result.state.setupRegistry).toEqual([]);
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

	it('terminalizes a pending setup when the derived close breaches its protected low', () => {
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
						bias: 'BULLISH' as const
					}
				}
			}
		};
		const result = processSmcClosedCandle(
			state,
			{
				...candle(0, '5m', 102),
				open: 101,
				low: 98,
				close: 99
			},
			lifecycleConfig
		);

		expect(result.setups[0]).toMatchObject({
			status: 'INVALIDATED',
			invalidationReason: 'PROTECTED_LOW_BREACHED'
		});
		expect(result.state.activeSetupId).toBeNull();
		expect(result.state.strategy.stage).toBe('WAITING_FOR_SWEEP');
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

	it('invalidates LONG and SHORT pending setups on a close beyond their protected swing', () => {
		const fixture = stateWaitingForGapRetracement();
		const longState = withPendingSetup(fixture.state, fixture.gap);
		const longResult = processSmcClosedCandle(
			longState,
			oneMinuteCandle(3, { open: 101, high: 102, low: 98, close: 99 }),
			lifecycleConfig
		);
		expect(longResult.setups[0]).toMatchObject({
			status: 'INVALIDATED',
			invalidationReason: 'PROTECTED_LOW_BREACHED'
		});

		const shortState = withPendingSetup(fixture.state, fixture.gap, {
			direction: 'SHORT',
			stopLoss: 125,
			takeProfit: 90,
			dependencies: {
				sequenceId: 'active-sequence',
				fvgId: fixture.gap.id,
				orderBlockId: null,
				sweepId: 'sweep',
				structureBreakId: 'choch',
				displacementId: 'displacement',
				protectedSwingId: 'protected-lh',
				protectedSwingPrice: 120,
				protectedBosId: 'bearish-protecting-bos'
			}
		});
		const shortResult = processSmcClosedCandle(
			{ ...shortState, htfBias: 'BEARISH' },
			oneMinuteCandle(3, { open: 119, high: 122, low: 118, close: 121 }),
			lifecycleConfig
		);
		expect(shortResult.setups[0]).toMatchObject({
			status: 'INVALIDATED',
			invalidationReason: 'PROTECTED_HIGH_BREACHED'
		});
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
			causalStructureBreakId: 'choch',
			causalDisplacementId: 'displacement',
			causalSequenceId: 'active-sequence'
		};
		let state = withPendingSetup(fixture.state, fixture.gap, {
			entryZone: { min: 106, max: 107 },
			entryPrice: 107,
			dependencies: {
				sequenceId: 'active-sequence',
				fvgId: fixture.gap.id,
				orderBlockId: block.id,
				sweepId: 'sweep',
				structureBreakId: 'choch',
				displacementId: 'displacement',
				protectedSwingId: 'protected-hl',
				protectedSwingPrice: 100,
				protectedBosId: 'protecting-bos'
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
