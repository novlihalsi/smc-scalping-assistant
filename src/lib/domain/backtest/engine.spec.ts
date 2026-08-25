import { describe, expect, it } from 'vitest';

import type { Candle, Timeframe } from '../market/index.js';
import { detectConfirmedSwings } from '../smc/index.js';
import {
	createCanonicalMinutePipeline,
	DEFAULT_SMC_STRATEGY_CONFIG,
	type TradingSetup
} from '../strategy/index.js';
import {
	BacktestError,
	runBacktest,
	type ClosedCandlePipeline,
	type RunBacktestOptions
} from './engine.js';
import { analyzeBacktest } from './analytics.js';

function candle(
	openTimestamp: number,
	timeframe: Timeframe = '1m',
	overrides: Partial<Pick<Candle, 'open' | 'high' | 'low' | 'close'>> = {}
): Candle {
	const duration = timeframe === '1m' ? 60_000 : 300_000;
	return {
		symbol: 'BTCUSDT',
		timeframe,
		openTimestamp,
		closeTimestamp: openTimestamp + duration - 1,
		open: 100,
		high: 105,
		low: 95,
		close: 101,
		volume: 10,
		closed: true,
		...overrides
	};
}

function setup(timestamp: number, overrides: Partial<TradingSetup> = {}): TradingSetup {
	return {
		id: 'setup-1',
		symbol: 'BTCUSDT',
		createdAt: timestamp,
		updatedAt: timestamp,
		direction: 'LONG',
		status: 'VALID',
		eligibility: { eligible: true, failures: [] },
		score: 80,
		classification: 'STRONG',
		entryZone: { min: 99, max: 101 },
		entryPrice: 100,
		stopLoss: 90,
		takeProfit: 110,
		riskReward: 1,
		reasons: Array.from({ length: 7 }, (_, index) => ({
			key: `quality-${index}`,
			label: `Quality ${index}`,
			score: index === 0 ? 80 : 0,
			valid: index === 0,
			description: 'Deterministic quality fixture.'
		})),
		sourceEventIds: ['event-1'],
		dependencies: {
			fvgId: 'fvg-1',
			orderBlockId: null,
			sweepId: 'sweep-1',
			structureBreakId: 'choch-1',
			displacementId: 'displacement-1'
		},
		pendingEntryBars: 0,
		...overrides
	};
}

function baseOptions<State>(
	candles: readonly Candle[],
	pipeline: ClosedCandlePipeline<State>
): RunBacktestOptions<State> {
	return {
		input: {
			symbol: 'BTCUSDT',
			startDate: 0,
			endDate: 600_000,
			config: DEFAULT_SMC_STRATEGY_CONFIG
		},
		candles,
		pipeline
	};
}

describe('backtesting engine', () => {
	it('replays unsorted candles by availability time and handles equal closes deterministically', () => {
		const source = [candle(0, '5m'), candle(240_000, '1m'), candle(60_000, '1m'), candle(0, '1m')];
		const pipeline: ClosedCandlePipeline<string[]> = {
			createInitialState: () => [],
			processClosedCandle: (state, current) => ({
				state: [...state, `${current.timeframe}:${current.openTimestamp}`],
				setups: []
			})
		};

		const result = runBacktest(baseOptions(source, pipeline));

		expect(result.finalState).toEqual(['1m:0', '1m:60000', '5m:0', '1m:240000']);
		expect(result.processedCandles).toBe(4);
	});

	it('does not expose a rightBars swing until its confirmation candle closes', () => {
		interface SwingState {
			history: Candle[];
			confirmationCounts: number[];
		}
		const highs = [101, 102, 110, 103, 102];
		const source = highs.map((high, index) =>
			candle(index * 60_000, '1m', { open: 100, high, low: 99, close: 100 })
		);
		const pipeline: ClosedCandlePipeline<SwingState> = {
			createInitialState: () => ({ history: [], confirmationCounts: [] }),
			processClosedCandle: (state, current, config) => {
				const history = [...state.history, current];
				const confirmed = detectConfirmedSwings(history, {
					leftBars: config.swingLeftBars,
					rightBars: config.swingRightBars
				});
				return {
					state: {
						history,
						confirmationCounts: [...state.confirmationCounts, confirmed.length]
					},
					setups: []
				};
			}
		};

		const result = runBacktest(baseOptions(source, pipeline));

		expect(result.finalState.confirmationCounts).toEqual([0, 0, 0, 0, 1]);
		expect(result.finalState.history[2]?.closeTimestamp).toBeLessThan(
			result.finalState.history[4]!.closeTimestamp
		);
	});

	it('does not fill a setup from a concurrent candle with the same close timestamp', () => {
		const higherTimeframe = candle(0, '5m', { open: 101, high: 105, low: 95, close: 101 });
		const concurrentEntryCandle = candle(240_000, '1m', {
			open: 102,
			high: 104,
			low: 99,
			close: 101
		});
		const nextEntryCandle = candle(300_000, '1m', {
			open: 102,
			high: 104,
			low: 99,
			close: 101
		});
		const pipeline: ClosedCandlePipeline<number> = {
			createInitialState: () => 0,
			processClosedCandle: (state, current) => ({
				state: state + 1,
				setups:
					current.timeframe === '5m' ? [setup(current.closeTimestamp, { takeProfit: 110 })] : []
			})
		};

		const result = runBacktest(
			baseOptions([nextEntryCandle, concurrentEntryCandle, higherTimeframe], pipeline)
		);

		expect(result.trades).toEqual([]);
		expect(result.openTrades).toEqual([]);
		expect(result.censoredOpenTrades).toEqual([
			expect.objectContaining({
				entryTimestamp: nextEntryCandle.closeTimestamp,
				status: 'OPEN_END_OF_RANGE'
			})
		]);
	});

	it('queues a close-confirmed setup for later candles and resolves entry/TP/SL ambiguity as a loss', () => {
		const first = candle(0, '1m', { open: 100, high: 110, low: 99, close: 105 });
		const ambiguous = candle(60_000, '1m', { open: 100, high: 111, low: 89, close: 100 });
		const pipeline: ClosedCandlePipeline<number> = {
			createInitialState: () => 0,
			processClosedCandle: (state, current) => ({
				state: state + 1,
				setups: state === 0 ? [setup(current.closeTimestamp)] : []
			})
		};

		const result = runBacktest(baseOptions([ambiguous, first], pipeline));

		expect(result.trades).toHaveLength(1);
		expect(result.trades[0]).toMatchObject({
			entry: 100,
			exitPrice: 90,
			result: 'LOSS',
			rMultiple: -1,
			exitReason: 'STOP_LOSS',
			intrabarAmbiguous: true,
			entryTimestamp: ambiguous.closeTimestamp,
			exitTimestamp: ambiguous.closeTimestamp
		});
		expect(result.pendingTrades).toEqual([]);
		expect(result.openTrades).toEqual([]);
	});

	it('does not award a target touched on the entry candle and applies configured costs later', () => {
		const first = candle(0, '1m', { open: 103, high: 105, low: 102, close: 104 });
		const entryAndTarget = candle(60_000, '1m', {
			open: 109,
			high: 111,
			low: 99,
			close: 108
		});
		const laterTarget = candle(120_000, '1m', {
			open: 108,
			high: 111,
			low: 107,
			close: 110
		});
		const pipeline: ClosedCandlePipeline<number> = {
			createInitialState: () => 0,
			processClosedCandle: (state, current) => ({
				state: state + 1,
				setups: state === 0 ? [setup(current.closeTimestamp)] : []
			})
		};

		const result = runBacktest({
			...baseOptions([first, laterTarget, entryAndTarget], pipeline),
			executionConfig: { feeBps: 10, slippageBps: 10 }
		});
		const trade = result.trades[0]!;

		expect(result.trades).toHaveLength(1);
		expect(trade.entryTimestamp).toBe(entryAndTarget.closeTimestamp);
		expect(trade.exitTimestamp).toBe(laterTarget.closeTimestamp);
		expect(trade.entry).toBeCloseTo(100.1, 12);
		expect(trade.exitPrice).toBeCloseTo(109.89, 12);
		expect(trade.feesPaid).toBeCloseTo(0.20999, 12);
		expect(trade.slippagePaid).toBeCloseTo(0.21, 12);
		expect(trade.rMultiple).toBeCloseTo(0.958001, 12);
		expect(trade.intrabarAmbiguous).toBe(true);
	});

	it('reconciles invalidation before a same-candle touch and prevents a zombie fill', () => {
		const first = candle(0, '1m', { open: 103, high: 105, low: 102, close: 104 });
		const invalidation = candle(60_000, '1m', { open: 104, high: 106, low: 99, close: 103 });
		const laterTouch = candle(120_000, '1m', { open: 103, high: 104, low: 99, close: 101 });
		const pipeline: ClosedCandlePipeline<number> = {
			createInitialState: () => 0,
			processClosedCandle: (state, current) => ({
				state: state + 1,
				setups:
					state === 0
						? [setup(current.closeTimestamp)]
						: state === 1
							? [
									setup(first.closeTimestamp, {
										updatedAt: current.closeTimestamp,
										status: 'INVALIDATED'
									})
								]
							: []
			})
		};

		const result = runBacktest(baseOptions([first, invalidation, laterTouch], pipeline));

		expect(result.trades).toEqual([]);
		expect(result.pendingTrades).toEqual([]);
		expect(result.openTrades).toEqual([]);
	});

	it('rejects future-dated pipeline setups', () => {
		const first = candle(0);
		const pipeline: ClosedCandlePipeline<null> = {
			createInitialState: () => null,
			processClosedCandle: (state, current) => ({
				state,
				setups: [setup(current.closeTimestamp + 1)]
			})
		};

		expect(() => runBacktest(baseOptions([first], pipeline))).toThrowError(
			expect.objectContaining<Partial<BacktestError>>({ code: 'FUTURE_SETUP' })
		);
	});

	it('rejects ineligible pipeline output instead of treating it as a low-score setup', () => {
		const first = candle(0);
		const pipeline: ClosedCandlePipeline<null> = {
			createInitialState: () => null,
			processClosedCandle: (state, current) => ({
				state,
				setups: [
					setup(current.closeTimestamp, {
						eligibility: {
							eligible: false,
							failures: [
								{
									key: 'causalFvg',
									label: 'Causal Fair Value Gap',
									description: 'Mandatory eligibility failure.'
								}
							]
						}
					})
				]
			})
		};

		expect(() => runBacktest(baseOptions([first], pipeline))).toThrowError(
			expect.objectContaining<Partial<BacktestError>>({ code: 'INVALID_SETUP' })
		);
	});

	it('produces identical output for identical inputs', () => {
		const source = [candle(60_000), candle(0)];
		const pipeline: ClosedCandlePipeline<number> = {
			createInitialState: () => 0,
			processClosedCandle: (state) => ({ state: state + 1, setups: [] })
		};
		const options = baseOptions(source, pipeline);

		expect(runBacktest(options)).toEqual(runBacktest(options));
	});

	it('produces identical canonical state, events, and trades from reversed raw 1m delivery', () => {
		const source = Array.from({ length: 10 }, (_, minute) =>
			candle(minute * 60_000, '1m', {
				open: 100 + minute,
				high: 102 + minute,
				low: 99 + minute,
				close: 101 + minute
			})
		);
		const forward = runBacktest(
			baseOptions(source, createCanonicalMinutePipeline(DEFAULT_SMC_STRATEGY_CONFIG))
		);
		const reversed = runBacktest(
			baseOptions([...source].reverse(), createCanonicalMinutePipeline(DEFAULT_SMC_STRATEGY_CONFIG))
		);

		expect({
			state: reversed.finalState,
			setupEvents: reversed.setupEvents,
			trades: reversed.trades
		}).toEqual({
			state: forward.finalState,
			setupEvents: forward.setupEvents,
			trades: forward.trades
		});
		expect(forward.finalState.pipeline.processedCandles).toBe(12);
		expect(forward.finalState.derivedFiveMinuteCandles).toBe(2);
	});

	it('warms canonical 1m and derived 5m state with pre-roll candles', () => {
		const highs = [101, 102, 110, 103, 102, 104, 105, 106, 107, 108];
		const source = highs.map((high, minute) => candle(minute * 60_000, '1m', { high, close: 100 }));
		const options = baseOptions(source, createCanonicalMinutePipeline(DEFAULT_SMC_STRATEGY_CONFIG));

		const result = runBacktest({
			...options,
			input: { ...options.input, startDate: 300_000, endDate: 540_000 }
		});

		expect(result.preRollCandles).toBe(5);
		expect(result.finalState.pipeline.timeframes['1m'].processedCandles).toBe(10);
		expect(result.finalState.pipeline.timeframes['1m'].atr.processedCandles).toBe(10);
		expect(result.finalState.pipeline.timeframes['1m'].marketStructure.lastProcessedTimestamp).toBe(
			source[4]?.closeTimestamp
		);
		expect(result.finalState.pipeline.timeframes['1m'].liquidity.lastSweepProcessedTimestamp).toBe(
			source[9]?.closeTimestamp
		);
		expect(result.finalState.pipeline.timeframes['5m'].processedCandles).toBe(2);
		expect(result.finalState.pipeline.timeframes['5m'].atr.processedCandles).toBe(2);
		expect(result.finalState.pipeline.timeframes['5m'].recentCandles).toHaveLength(2);
	});

	it('excludes a trade entered during pre-roll even when it exits inside the requested range', () => {
		const preRollSetup = candle(0, '1m', { open: 103, high: 105, low: 102, close: 104 });
		const preRollEntry = candle(60_000, '1m', { open: 105, high: 109, low: 99, close: 105 });
		const inRangeTarget = candle(120_000, '1m', {
			open: 105,
			high: 111,
			low: 104,
			close: 110
		});
		const pipeline: ClosedCandlePipeline<number> = {
			createInitialState: () => 0,
			processClosedCandle: (state, current) => ({
				state: state + 1,
				setups: state === 0 ? [setup(current.closeTimestamp)] : []
			})
		};
		const options = baseOptions([preRollSetup, preRollEntry, inRangeTarget], pipeline);

		const result = runBacktest({
			...options,
			input: { ...options.input, startDate: 120_000, endDate: 120_000 }
		});

		expect(result.finalState).toBe(3);
		expect(result.preRollCandles).toBe(2);
		expect(result.trades).toEqual([]);
		expect(result.preRollTradesExcluded).toBe(1);
		expect(analyzeBacktest(result.trades).metrics.totalTrades).toBe(0);
	});

	it('expires a pending setup explicitly at the end of the requested range', () => {
		const finalCandle = candle(0);
		const pipeline: ClosedCandlePipeline<number> = {
			createInitialState: () => 0,
			processClosedCandle: (state, current) => ({
				state: state + 1,
				setups: [setup(current.closeTimestamp)]
			})
		};
		const options = baseOptions([finalCandle], pipeline);

		const result = runBacktest({
			...options,
			input: { ...options.input, endDate: 0 }
		});

		expect(result.pendingTrades).toEqual([]);
		expect(result.expiredPendingTrades).toEqual([
			expect.objectContaining({
				setupId: 'setup-1',
				status: 'EXPIRED_END_OF_RANGE',
				expiredAt: finalCandle.closeTimestamp
			})
		]);
	});

	it('right-censors an open trade without adding a realized win or loss', () => {
		const setupCandle = candle(0, '1m', { open: 103, high: 105, low: 102, close: 104 });
		const entryCandle = candle(60_000, '1m', { open: 103, high: 105, low: 99, close: 104 });
		const pipeline: ClosedCandlePipeline<number> = {
			createInitialState: () => 0,
			processClosedCandle: (state, current) => ({
				state: state + 1,
				setups: state === 0 ? [setup(current.closeTimestamp)] : []
			})
		};
		const options = baseOptions([setupCandle, entryCandle], pipeline);

		const result = runBacktest({
			...options,
			input: { ...options.input, endDate: 60_000 }
		});

		expect(result.trades).toEqual([]);
		expect(result.openTrades).toEqual([]);
		expect(result.censoredOpenTrades).toEqual([
			expect.objectContaining({
				setupId: 'setup-1',
				status: 'OPEN_END_OF_RANGE',
				censoredAt: entryCandle.closeTimestamp
			})
		]);
		expect(analyzeBacktest(result.trades).metrics).toMatchObject({
			totalTrades: 0,
			wins: 0,
			losses: 0
		});
	});
});
