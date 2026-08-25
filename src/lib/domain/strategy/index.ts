export { DEFAULT_SMC_STRATEGY_CONFIG } from './config.js';
export {
	createSmcClosedCandlePipeline,
	createSmcClosedCandleState,
	processSmcClosedCandle
} from './candle-pipeline.js';
export type {
	SMCClosedCandlePipelineState,
	SMCClosedCandleTimeframeState,
	SMCSequenceContext
} from './candle-pipeline.js';
export type { SMCStrategyConfig, TradingSetup } from './models.js';
export { createStrategyState, processStrategySignal, StrategyStateError } from './state-machine.js';
export type {
	ChochSignal,
	DisplacementSignal,
	FvgSignal,
	HtfBiasSignal,
	InvalidationSignal,
	LiquiditySweepSignal,
	RetracementSignal,
	StrategyDirection,
	StrategyProcessingResult,
	StrategySignal,
	StrategyStage,
	StrategyState,
	StrategyTransition
} from './state-machine.js';
