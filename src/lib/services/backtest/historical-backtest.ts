import {
	analyzeBacktest,
	CANONICAL_STRATEGY_TIMEFRAME,
	createCanonicalMinutePipeline,
	generateBacktestValidationReport,
	getTimeframeDurationMilliseconds,
	prepareContinuousOneMinuteCandles,
	runBacktest,
	type BacktestAnalytics,
	type CensoredOpenBacktestTrade,
	type BacktestExecutionConfig,
	type BacktestInput,
	type BacktestTrade,
	type BacktestValidationReport,
	type Candle,
	type ExpiredPendingBacktestTrade,
	type SMCStrategyConfig,
	type TradingSetup,
	type ValidationCostRun
} from '../../domain/index.js';
import type { HistoricalMarketDataProvider } from '../historical/index.js';

export const DEFAULT_BACKTEST_PRE_ROLL_BARS = 500;

export interface HistoricalBacktestRequest {
	symbol: 'BTCUSDT';
	startTimestamp: number;
	endTimestamp: number;
	config: SMCStrategyConfig;
	executionConfig: BacktestExecutionConfig;
	preRollBars?: number;
}

export interface HistoricalBacktestReport {
	input: BacktestInput;
	executionConfig: BacktestExecutionConfig;
	data: {
		oneMinuteCandles: number;
		preRollCandles: number;
		fiveMinuteCandles: number;
		processedCandles: number;
		pendingTrades: number;
		openTrades: number;
		expiredPendingTrades: number;
		censoredOpenTrades: number;
		preRollTradesExcluded: number;
	};
	trades: BacktestTrade[];
	setups: TradingSetup[];
	expiredPendingTrades: ExpiredPendingBacktestTrade[];
	censoredOpenTrades: CensoredOpenBacktestTrade[];
	analytics: BacktestAnalytics;
	validation: BacktestValidationReport;
}

export async function runHistoricalBacktest(
	provider: HistoricalMarketDataProvider,
	request: HistoricalBacktestRequest
): Promise<HistoricalBacktestReport> {
	const preRoll = resolvePreRoll(request.startTimestamp, request.preRollBars);
	const oneMinuteCandles = await provider.getCandles({
		symbol: request.symbol,
		timeframe: request.config.entryTimeframe,
		startTimestamp: preRoll.startTimestamp,
		endTimestamp: request.endTimestamp
	});
	const closedOneMinuteCandles = prepareContinuousOneMinuteCandles(
		oneMinuteCandles.filter(({ closed }) => closed),
		{ startTimestamp: preRoll.startTimestamp, endTimestamp: request.endTimestamp }
	);
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
	const rangeEndTimestamp =
		input.endDate + getTimeframeDurationMilliseconds(input.config.entryTimeframe) - 1;
	const inRangeSetups = run.setupEvents.filter(
		(setup) => setup.updatedAt >= input.startDate && setup.updatedAt <= rangeEndTimestamp
	);
	const costRuns = buildCostSensitivityRuns(
		input,
		closedOneMinuteCandles,
		request.config,
		request.executionConfig,
		analytics
	);

	return {
		input,
		executionConfig: { ...request.executionConfig },
		data: {
			oneMinuteCandles: closedOneMinuteCandles.length - run.preRollCandles,
			preRollCandles: run.preRollCandles,
			fiveMinuteCandles: run.finalState.derivedFiveMinuteCandles,
			processedCandles: run.finalState.pipeline.processedCandles,
			pendingTrades: run.pendingTrades.length,
			openTrades: run.openTrades.length,
			expiredPendingTrades: run.expiredPendingTrades.length,
			censoredOpenTrades: run.censoredOpenTrades.length,
			preRollTradesExcluded: run.preRollTradesExcluded
		},
		trades: run.trades,
		setups: inRangeSetups,
		expiredPendingTrades: run.expiredPendingTrades,
		censoredOpenTrades: run.censoredOpenTrades,
		analytics,
		validation: generateBacktestValidationReport({
			input,
			trades: run.trades,
			analytics,
			executionConfig: request.executionConfig,
			costRuns
		})
	};
}

function buildCostSensitivityRuns(
	input: BacktestInput,
	candles: readonly Candle[],
	strategyConfig: SMCStrategyConfig,
	baselineConfig: BacktestExecutionConfig,
	baselineAnalytics: BacktestAnalytics
): ValidationCostRun[] {
	const scenarios: readonly Omit<ValidationCostRun, 'analytics'>[] = [
		{
			key: 'ZERO_COST',
			label: 'Zero-cost reference',
			executionConfig: { feeBps: 0, slippageBps: 0 }
		},
		{
			key: 'BASELINE',
			label: 'Configured baseline',
			executionConfig: { ...baselineConfig }
		},
		{
			key: 'STRESS_2X',
			label: 'Cost stress',
			executionConfig: createStressExecutionConfig(baselineConfig)
		}
	];

	return scenarios.map((scenario) => ({
		...scenario,
		analytics: sameExecutionConfig(scenario.executionConfig, baselineConfig)
			? baselineAnalytics
			: analyzeBacktest(
					runBacktest({
						input,
						candles,
						pipeline: createCanonicalMinutePipeline(strategyConfig),
						executionConfig: scenario.executionConfig
					}).trades
				)
	}));
}

function createStressExecutionConfig(baseline: BacktestExecutionConfig): BacktestExecutionConfig {
	return baseline.feeBps === 0 && baseline.slippageBps === 0
		? { feeBps: 4, slippageBps: 2 }
		: { feeBps: baseline.feeBps * 2, slippageBps: baseline.slippageBps * 2 };
}

function sameExecutionConfig(
	left: BacktestExecutionConfig,
	right: BacktestExecutionConfig
): boolean {
	return left.feeBps === right.feeBps && left.slippageBps === right.slippageBps;
}

function resolvePreRoll(
	startTimestamp: number,
	configuredBars = DEFAULT_BACKTEST_PRE_ROLL_BARS
): { startTimestamp: number; bars: number } {
	const canonicalDuration = getTimeframeDurationMilliseconds(CANONICAL_STRATEGY_TIMEFRAME);
	if (
		!Number.isSafeInteger(startTimestamp) ||
		startTimestamp < 0 ||
		startTimestamp % canonicalDuration !== 0 ||
		!Number.isSafeInteger(configuredBars) ||
		configuredBars < 0
	) {
		throw new RangeError(
			'Historical pre-roll requires an aligned start timestamp and a non-negative integer bar count.'
		);
	}

	const availableBars = startTimestamp / canonicalDuration;
	const bars = Math.min(configuredBars, availableBars);
	return {
		startTimestamp: startTimestamp - bars * canonicalDuration,
		bars
	};
}
