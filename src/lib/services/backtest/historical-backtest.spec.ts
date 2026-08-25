import { describe, expect, it } from 'vitest';

import { DEFAULT_SMC_STRATEGY_CONFIG, type Candle } from '../../domain/index.js';
import type {
	HistoricalCandlesRequest,
	HistoricalMarketDataProvider
} from '../historical/index.js';
import { runHistoricalBacktest } from './historical-backtest.js';

class FixtureProvider implements HistoricalMarketDataProvider {
	readonly requests: HistoricalCandlesRequest[] = [];

	async getCandles(request: HistoricalCandlesRequest): Promise<Candle[]> {
		this.requests.push(request);
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

describe('historical backtest service', () => {
	it('fetches only canonical 1m data and reports derived 5m replay results', async () => {
		const provider = new FixtureProvider();
		const report = await runHistoricalBacktest(provider, {
			symbol: 'BTCUSDT',
			startTimestamp: 0,
			endTimestamp: 600_000,
			config: DEFAULT_SMC_STRATEGY_CONFIG,
			executionConfig: { feeBps: 4, slippageBps: 2 }
		});

		expect(provider.requests.map(({ timeframe }) => timeframe)).toEqual(['1m']);
		expect(report.data).toEqual({
			oneMinuteCandles: 5,
			fiveMinuteCandles: 1,
			processedCandles: 6,
			pendingTrades: 0,
			openTrades: 0
		});
		expect(report.analytics.metrics.totalTrades).toBe(0);
		expect(report.validation.verdict).toBe('INSUFFICIENT_SAMPLE');
		expect(report.executionConfig).toEqual({ feeBps: 4, slippageBps: 2 });
	});
});
