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
		const duration = request.timeframe === '1m' ? 60_000 : 300_000;
		return [
			{
				symbol: request.symbol,
				timeframe: request.timeframe,
				openTimestamp: 0,
				closeTimestamp: duration - 1,
				open: 100,
				high: 105,
				low: 95,
				close: 101,
				volume: 10,
				closed: true
			},
			{
				symbol: request.symbol,
				timeframe: request.timeframe,
				openTimestamp: duration,
				closeTimestamp: duration * 2 - 1,
				open: 101,
				high: 106,
				low: 96,
				close: 102,
				volume: 10,
				closed: false
			}
		];
	}
}

describe('historical backtest service', () => {
	it('fetches both configured timeframes and reports only closed-candle replay results', async () => {
		const provider = new FixtureProvider();
		const report = await runHistoricalBacktest(provider, {
			symbol: 'BTCUSDT',
			startTimestamp: 0,
			endTimestamp: 600_000,
			config: DEFAULT_SMC_STRATEGY_CONFIG,
			executionConfig: { feeBps: 4, slippageBps: 2 }
		});

		expect(provider.requests.map(({ timeframe }) => timeframe).sort()).toEqual(['1m', '5m']);
		expect(report.data).toEqual({
			oneMinuteCandles: 1,
			fiveMinuteCandles: 1,
			processedCandles: 2,
			pendingTrades: 0,
			openTrades: 0
		});
		expect(report.analytics.metrics.totalTrades).toBe(0);
		expect(report.validation.verdict).toBe('INSUFFICIENT_SAMPLE');
		expect(report.executionConfig).toEqual({ feeBps: 4, slippageBps: 2 });
	});
});
