import {
	analyzeBacktest,
	createCanonicalMinutePipeline,
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
	const oneMinuteCandles = await provider.getCandles({
		symbol: request.symbol,
		timeframe: request.config.entryTimeframe,
		startTimestamp: request.startTimestamp,
		endTimestamp: request.endTimestamp
	});
	const closedOneMinuteCandles = oneMinuteCandles.filter(({ closed }) => closed);
	const input: BacktestInput = {
		symbol: request.symbol,
		startDate: request.startTimestamp,
		endDate: request.endTimestamp,
		config: { ...request.config }
	};
	const run = runBacktest({
		input,
		candles: closedOneMinuteCandles,
		pipeline: createCanonicalMinutePipeline(request.config),
		executionConfig: request.executionConfig
	});
	const analytics = analyzeBacktest(run.trades);

	return {
		input,
		executionConfig: { ...request.executionConfig },
		data: {
			oneMinuteCandles: closedOneMinuteCandles.length,
			fiveMinuteCandles: run.finalState.derivedFiveMinuteCandles,
			processedCandles: run.finalState.pipeline.processedCandles,
			pendingTrades: run.pendingTrades.length,
			openTrades: run.openTrades.length
		},
		trades: run.trades,
		analytics,
		validation: generateBacktestValidationReport(analytics, request.executionConfig)
	};
}
