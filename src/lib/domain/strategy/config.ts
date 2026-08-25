import type { SMCStrategyConfig } from './models.js';

export const DEFAULT_SMC_STRATEGY_CONFIG: SMCStrategyConfig = {
	biasTimeframe: '5m',
	entryTimeframe: '1m',
	swingLeftBars: 2,
	swingRightBars: 2,
	liquidityTolerancePercent: 0.1,
	atrPeriod: 14,
	displacementATRMultiplier: 1.2,
	minimumScore: 75,
	minimumRiskReward: 1.5,
	stopLossATRBuffer: 0.1,
	maxPendingEntryBars: 10
};
