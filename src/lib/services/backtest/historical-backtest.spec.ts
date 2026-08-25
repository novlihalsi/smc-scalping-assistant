import { describe, expect, it } from 'vitest';

import { DEFAULT_SMC_STRATEGY_CONFIG, type Candle } from '../../domain/index.js';
import type {
	HistoricalCandlesRequest,
	HistoricalMarketDataProvider
} from '../historical/index.js';
import { runHistoricalBacktest } from './historical-backtest.js';

class FixtureProvider implements HistoricalMarketDataProvider {
	readonly requests: HistoricalCandlesRequest[] = [];

	constructor(private readonly candles?: readonly Candle[]) {}

	async getCandles(request: HistoricalCandlesRequest): Promise<Candle[]> {
		this.requests.push(request);
		if (this.candles) return this.candles.map((candle) => ({ ...candle }));
		return Array.from({ length: 6 }, (_, minute) => ({
			symbol: request.symbol,
			timeframe: request.timeframe,
			openTimestamp: minute * 60_000,
			closeTimestamp: minute * 60_000 + 59_999,
			open: 100,
			high: 105,
			low: 95,
			close: 101,
			volume: 10,
			closed: minute < 5
		}));
	}
}

class RangeFixtureProvider implements HistoricalMarketDataProvider {
	readonly requests: HistoricalCandlesRequest[] = [];

	async getCandles(request: HistoricalCandlesRequest): Promise<Candle[]> {
		this.requests.push(request);
		const firstMinute = request.startTimestamp / 60_000;
		const lastMinute = request.endTimestamp / 60_000;
		return Array.from({ length: lastMinute - firstMinute + 1 }, (_, index) =>
			minuteCandle(firstMinute + index)
		);
	}
}

function minuteCandle(minute: number): Candle {
	const openTimestamp = minute * 60_000;
	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + 59_999,
		open: 100,
		high: 105,
		low: 95,
		close: 101,
		volume: 10,
		closed: true
	};
}

describe('historical backtest service', () => {
	it('fetches only canonical 1m data and reports derived 5m replay results', async () => {
		const provider = new FixtureProvider();
		const report = await runHistoricalBacktest(provider, {
			symbol: 'BTCUSDT',
			startTimestamp: 0,
			endTimestamp: 240_000,
			config: DEFAULT_SMC_STRATEGY_CONFIG,
			executionConfig: { feeBps: 4, slippageBps: 2 }
		});

		expect(provider.requests.map(({ timeframe }) => timeframe)).toEqual(['1m']);
		expect(report.data).toEqual({
			oneMinuteCandles: 5,
			preRollCandles: 0,
			fiveMinuteCandles: 1,
			processedCandles: 6,
			pendingTrades: 0,
			openTrades: 0,
			expiredPendingTrades: 0,
			censoredOpenTrades: 0,
			preRollTradesExcluded: 0
		});
		expect(report.expiredPendingTrades).toEqual([]);
		expect(report.censoredOpenTrades).toEqual([]);
		expect(report.analytics.metrics.totalTrades).toBe(0);
		expect(report.validation.verdict).toBe('INSUFFICIENT_SAMPLE');
		expect(report.validation.chronologicalSplit.segments[1]).toMatchObject({
			key: 'OUT_OF_SAMPLE',
			metrics: { totalTrades: 0 }
		});
		expect(report.validation.costSensitivity).toEqual([
			expect.objectContaining({ key: 'ZERO_COST', feeBps: 0, slippageBps: 0 }),
			expect.objectContaining({ key: 'BASELINE', feeBps: 4, slippageBps: 2 }),
			expect.objectContaining({ key: 'STRESS_2X', feeBps: 8, slippageBps: 4 })
		]);
		expect(report.validation.provenance).toMatchObject({
			symbol: 'BTCUSDT',
			configHash: expect.stringMatching(/^fnv1a32:/)
		});
		expect(report.executionConfig).toEqual({ feeBps: 4, slippageBps: 2 });
	});

	it.each([
		{
			name: 'missing minute',
			candles: [minuteCandle(0), minuteCandle(2)],
			code: 'DATA_GAP',
			endTimestamp: 120_000
		},
		{
			name: 'duplicate minute',
			candles: [minuteCandle(0), minuteCandle(0)],
			code: 'DUPLICATE_CANDLE',
			endTimestamp: 0
		}
	])('fails historical replay on a $name', async ({ candles, code, endTimestamp }) => {
		const provider = new FixtureProvider(candles);

		await expect(
			runHistoricalBacktest(provider, {
				symbol: 'BTCUSDT',
				startTimestamp: 0,
				endTimestamp,
				config: DEFAULT_SMC_STRATEGY_CONFIG,
				executionConfig: { feeBps: 0, slippageBps: 0 }
			})
		).rejects.toMatchObject({ name: 'CandleContinuityError', code });
	});

	it.each([
		{
			name: 'documented fallback when both baseline fields are zero',
			baseline: { feeBps: 0, slippageBps: 0 },
			expected: { feeBps: 4, slippageBps: 2 }
		},
		{
			name: 'zero slippage doubled exactly without fallback substitution',
			baseline: { feeBps: 4, slippageBps: 0 },
			expected: { feeBps: 8, slippageBps: 0 }
		},
		{
			name: 'zero fee doubled exactly without fallback substitution',
			baseline: { feeBps: 0, slippageBps: 2 },
			expected: { feeBps: 0, slippageBps: 4 }
		},
		{
			name: 'fractional configured costs doubled exactly',
			baseline: { feeBps: 1.25, slippageBps: 0.75 },
			expected: { feeBps: 2.5, slippageBps: 1.5 }
		}
	])('uses $name for 2x cost stress', async ({ baseline, expected }) => {
		const report = await runHistoricalBacktest(new FixtureProvider(), {
			symbol: 'BTCUSDT',
			startTimestamp: 0,
			endTimestamp: 240_000,
			config: DEFAULT_SMC_STRATEGY_CONFIG,
			executionConfig: baseline
		});

		expect(report.validation.costSensitivity.find(({ key }) => key === 'STRESS_2X')).toMatchObject(
			expected
		);
	});

	it('loads a configurable pre-roll range while preserving the requested report window', async () => {
		const provider = new RangeFixtureProvider();

		const report = await runHistoricalBacktest(provider, {
			symbol: 'BTCUSDT',
			startTimestamp: 600_000,
			endTimestamp: 720_000,
			preRollBars: 2,
			config: DEFAULT_SMC_STRATEGY_CONFIG,
			executionConfig: { feeBps: 0, slippageBps: 0 }
		});

		expect(provider.requests).toEqual([
			expect.objectContaining({ startTimestamp: 480_000, endTimestamp: 720_000 })
		]);
		expect(report.input).toMatchObject({ startDate: 600_000, endDate: 720_000 });
		expect(report.data).toMatchObject({
			oneMinuteCandles: 3,
			preRollCandles: 2,
			processedCandles: 5,
			preRollTradesExcluded: 0
		});
	});

	it('rejects an invalid pre-roll configuration before loading market data', async () => {
		const provider = new RangeFixtureProvider();

		await expect(
			runHistoricalBacktest(provider, {
				symbol: 'BTCUSDT',
				startTimestamp: 600_000,
				endTimestamp: 720_000,
				preRollBars: -1,
				config: DEFAULT_SMC_STRATEGY_CONFIG,
				executionConfig: { feeBps: 0, slippageBps: 0 }
			})
		).rejects.toThrow(RangeError);
		expect(provider.requests).toEqual([]);
	});
});
