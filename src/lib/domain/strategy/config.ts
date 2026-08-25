import { CANONICAL_STRATEGY_TIMEFRAME, DERIVED_BIAS_TIMEFRAME } from '../market/index.js';
import type { SMCStrategyConfig } from './models.js';

export const DEFAULT_SMC_STRATEGY_CONFIG: SMCStrategyConfig = {
	biasTimeframe: DERIVED_BIAS_TIMEFRAME,
	entryTimeframe: CANONICAL_STRATEGY_TIMEFRAME,
	swingLeftBars: 2,
	swingRightBars: 2,
	liquidityTolerancePercent: 0.1,
	atrPeriod: 14,
	displacementATRMultiplier: 1.2,
	minimumRiskReward: 1.5,
	stopLossATRBuffer: 0.1,
	maxPendingEntryBars: 10
};
