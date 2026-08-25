export { DEFAULT_SMC_STRATEGY_CONFIG } from './config.js';
export {
	CanonicalMinutePipelineError,
	createCanonicalMinutePipeline,
	createCanonicalMinutePipelineState,
	processCanonicalMinute,
	terminalizeCanonicalMinuteAtEndOfRange
} from './canonical-minute-pipeline.js';
export type {
	CanonicalMinuteEndOfRangeTerminalization,
	CanonicalMinutePipelineErrorCode,
	CanonicalMinutePipelineState,
	CanonicalMinuteProcessingResult
} from './canonical-minute-pipeline.js';
export type { SetupDependencies, SMCStrategyConfig, TradingSetup } from './models.js';
export { createStrategyState } from './state-machine.js';
export type {
	StrategyDirection,
	StrategyStage,
	StrategyState,
	StrategyTransition
} from './state-machine.js';
