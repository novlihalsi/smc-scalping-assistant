import type { SetupReason } from '../scoring/index.js';

export interface SetupDependencies {
	fvgId: string;
	orderBlockId: string | null;
	sweepId: string;
	structureBreakId: string;
	displacementId: string;
}

export interface TradingSetup {
	id: string;
	symbol: string;
	createdAt: number;
	updatedAt: number;
	direction: 'LONG' | 'SHORT';
	status: 'FORMING' | 'VALID' | 'TRIGGERED' | 'INVALIDATED' | 'TP' | 'SL';
	score: number;
	classification: 'NO_TRADE' | 'WEAK' | 'VALID' | 'STRONG';
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
	biasTimeframe: '5m';
	entryTimeframe: '1m';
	swingLeftBars: number;
	swingRightBars: number;
	liquidityTolerancePercent: number;
	atrPeriod: number;
	displacementATRMultiplier: number;
	minimumScore: number;
	minimumRiskReward: number;
	stopLossATRBuffer: number;
	maxPendingEntryBars: number;
}
