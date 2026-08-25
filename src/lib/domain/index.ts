export type { BacktestInput, BacktestMetrics, BacktestTrade } from './backtest/index.js';
export {
	aggregateOneMinuteCandlesToFiveMinutes,
	assertValidCandle,
	CandleAggregationError,
	CandleValidationError,
	getCandleIdentity,
	getTimeframeDurationMilliseconds,
	mergeCandleBatches,
	sortCandlesChronologically,
	validateCandle
} from './market/index.js';
export type {
	Candle,
	CandleValidationIssue,
	CandleValidationIssueCode,
	CandleValidationResult,
	FiveMinuteAggregationResult,
	IncompleteFiveMinuteBucket,
	Timeframe
} from './market/index.js';
export type { SetupReason } from './scoring/index.js';
export { detectConfirmedSwings } from './smc/index.js';
export type {
	FairValueGap,
	LiquidityLevel,
	LiquiditySweep,
	MarketBias,
	MarketStructurePoint,
	OrderBlock,
	StructureBreak,
	StructureType,
	SwingDetectionConfig,
	SwingPoint
} from './smc/index.js';
export { DEFAULT_SMC_STRATEGY_CONFIG } from './strategy/index.js';
export type { SMCStrategyConfig, TradingSetup } from './strategy/index.js';
