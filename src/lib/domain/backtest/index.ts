export {
	analyzeBacktest,
	BacktestAnalyticsError,
	buildBreakdowns,
	buildEquityCurve,
	calculateBacktestMetrics
} from './analytics.js';
export type {
	BacktestAnalytics,
	BacktestBreakdownBucket,
	BacktestBreakdowns,
	EquityCurvePoint
} from './analytics.js';
export { generateBacktestValidationReport } from './validation-report.js';
export type {
	BacktestValidationReport,
	ValidationCheck,
	ValidationCheckStatus,
	ValidationVerdict
} from './validation-report.js';
export { BacktestError, DEFAULT_BACKTEST_EXECUTION_CONFIG, runBacktest } from './engine.js';
export type {
	BacktestErrorCode,
	BacktestExecutionConfig,
	BacktestRunResult,
	ClosedCandlePipeline,
	ClosedCandlePipelineResult,
	OpenBacktestTrade,
	PendingBacktestTrade,
	RunBacktestOptions
} from './engine.js';
export type { BacktestInput, BacktestMetrics, BacktestTrade } from './models.js';
