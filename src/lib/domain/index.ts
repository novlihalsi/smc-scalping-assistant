export type { BacktestInput, BacktestMetrics, BacktestTrade } from './backtest/index.js';
export type { Candle, Timeframe } from './market/index.js';
export type { SetupReason } from './scoring/index.js';
export type {
	FairValueGap,
	LiquidityLevel,
	LiquiditySweep,
	MarketBias,
	MarketStructurePoint,
	OrderBlock,
	StructureBreak,
	StructureType,
	SwingPoint
} from './smc/index.js';
export { DEFAULT_SMC_STRATEGY_CONFIG } from './strategy/index.js';
export type { SMCStrategyConfig, TradingSetup } from './strategy/index.js';
