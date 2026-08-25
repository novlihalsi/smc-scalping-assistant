import type { EligibilityResult, SetupClassification, SetupReason } from '../scoring/index.js';
import type { CANONICAL_STRATEGY_TIMEFRAME, DERIVED_BIAS_TIMEFRAME } from '../market/constants.js';

export interface SetupDependencies {
	fvgId: string;
	orderBlockId: string | null;
	sweepId: string;
	structureBreakId: string;
	displacementId: string;
	protectedSwingId: string;
	protectedSwingPrice: number;
	protectedBosId: string;
}

export interface TradingSetup {
	id: string;
	symbol: string;
	createdAt: number;
	updatedAt: number;
	direction: 'LONG' | 'SHORT';
	status: 'FORMING' | 'VALID' | 'TRIGGERED' | 'INVALIDATED' | 'TP' | 'SL';
	eligibility: EligibilityResult;
	score: number;
	classification: SetupClassification;
	entryZone: { min: number; max: number };
	entryPrice: number;
	stopLoss: number;
	takeProfit: number;
	riskReward: number;
	reasons: SetupReason[];
	sourceEventIds: string[];
	dependencies: SetupDependencies;
	pendingEntryBars: number;
	triggeredAt?: number;
	invalidationReason?: string;
}

export interface SMCStrategyConfig {
	biasTimeframe: typeof DERIVED_BIAS_TIMEFRAME;
	entryTimeframe: typeof CANONICAL_STRATEGY_TIMEFRAME;
	swingLeftBars: number;
	swingRightBars: number;
	liquidityTolerancePercent: number;
	atrPeriod: number;
	displacementATRMultiplier: number;
	minimumRiskReward: number;
	stopLossATRBuffer: number;
	maxPendingEntryBars: number;
}
