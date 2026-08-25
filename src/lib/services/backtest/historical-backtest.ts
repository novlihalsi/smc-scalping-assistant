import {
	analyzeBacktest,
	createSmcClosedCandlePipeline,
	generateBacktestValidationReport,
	runBacktest,
	type BacktestAnalytics,
	type BacktestExecutionConfig,
	type BacktestInput,
	type BacktestTrade,
	type BacktestValidationReport,
	type SMCStrategyConfig
} from '../../domain/index.js';
import type { HistoricalMarketDataProvider } from '../historical/index.js';

export interface HistoricalBacktestRequest {
	symbol: 'BTCUSDT';
	startTimestamp: number;
	endTimestamp: number;
	config: SMCStrategyConfig;
	executionConfig: BacktestExecutionConfig;
}

export interface HistoricalBacktestReport {
	input: BacktestInput;
	executionConfig: BacktestExecutionConfig;
	data: {
		oneMinuteCandles: number;
		fiveMinuteCandles: number;
		processedCandles: number;
		pendingTrades: number;
		openTrades: number;
	};
	trades: BacktestTrade[];
	analytics: BacktestAnalytics;
	validation: BacktestValidationReport;
}

export async function runHistoricalBacktest(
	provider: HistoricalMarketDataProvider,
	request: HistoricalBacktestRequest
): Promise<HistoricalBacktestReport> {
	const [oneMinuteCandles, fiveMinuteCandles] = await Promise.all([
		provider.getCandles({
			symbol: request.symbol,
			timeframe: request.config.entryTimeframe,
			startTimestamp: request.startTimestamp,
			endTimestamp: request.endTimestamp
		}),
		provider.getCandles({
			symbol: request.symbol,
			timeframe: request.config.biasTimeframe,
			startTimestamp: request.startTimestamp,
			endTimestamp: request.endTimestamp
		})
	]);
	const closedOneMinuteCandles = oneMinuteCandles.filter(({ closed }) => closed);
	const closedFiveMinuteCandles = fiveMinuteCandles.filter(({ closed }) => closed);
	const input: BacktestInput = {
		symbol: request.symbol,
		startDate: request.startTimestamp,
		endDate: request.endTimestamp,
		config: { ...request.config }
	};
	const run = runBacktest({
		input,
		candles: [...closedOneMinuteCandles, ...closedFiveMinuteCandles],
		pipeline: createSmcClosedCandlePipeline(request.config),
		executionConfig: request.executionConfig
	});
	const analytics = analyzeBacktest(run.trades);

	return {
		input,
		executionConfig: { ...request.executionConfig },
		data: {
			oneMinuteCandles: closedOneMinuteCandles.length,
			fiveMinuteCandles: closedFiveMinuteCandles.length,
			processedCandles: run.processedCandles,
			pendingTrades: run.pendingTrades.length,
			openTrades: run.openTrades.length
		},
		trades: run.trades,
		analytics,
		validation: generateBacktestValidationReport(analytics, request.executionConfig)
	};
}
