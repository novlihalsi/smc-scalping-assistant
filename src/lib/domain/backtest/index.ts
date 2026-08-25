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
export {
	createValidationConfigHash,
	generateBacktestValidationReport
} from './validation-report.js';
export type {
	BacktestValidationInput,
	BacktestValidationReport,
	ValidationChronologicalSplit,
	ValidationCheck,
	ValidationCheckStatus,
	ValidationCostRun,
	ValidationCostScenario,
	ValidationMonthlyPeriod,
	ValidationOutlierConcentration,
	ValidationProvenance,
	ValidationRobustness,
	ValidationSegment,
	ValidationVerdict
} from './validation-report.js';
export { BacktestError, DEFAULT_BACKTEST_EXECUTION_CONFIG, runBacktest } from './engine.js';
export type {
	BacktestErrorCode,
	BacktestExecutionConfig,
	BacktestRunResult,
	CensoredOpenBacktestTrade,
	ClosedCandlePipeline,
	ClosedCandlePipelineResult,
	ExpiredPendingBacktestTrade,
	OpenBacktestTrade,
	PendingBacktestTrade,
	RunBacktestOptions
} from './engine.js';
export type { BacktestInput, BacktestMetrics, BacktestTrade } from './models.js';
export { runCanonicalReplayParity } from './parity-harness.js';
export type {
	CanonicalReplayEvent,
	CanonicalReplayEventType,
	CanonicalReplayObservation,
	CanonicalReplayParityComparison,
	CanonicalReplayParityResult,
	RunCanonicalReplayParityOptions
} from './parity-harness.js';
