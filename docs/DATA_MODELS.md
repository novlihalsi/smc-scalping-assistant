# Core Data Models

```ts
export type Timeframe = '1m' | '5m' | '15m' | '1h';

export interface Candle {
	symbol: string;
	timeframe: Timeframe;
	openTimestamp: number;
	closeTimestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	closed: boolean;
}

export interface SwingPoint {
	id: string;
	symbol: string;
	timeframe: Timeframe;
	sourceIndex: number;
	sourceTimestamp: number;
	confirmedTimestamp: number;
	price: number;
	type: 'HIGH' | 'LOW';
	strength: number;
}

export type StructureType = 'HH' | 'HL' | 'LH' | 'LL';
export type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface MarketStructurePoint {
	swingId: string;
	timestamp: number;
	price: number;
	structure: StructureType;
}

export interface StructureBreak {
	id: string;
	timestamp: number;
	direction: 'BULLISH' | 'BEARISH';
	type: 'BOS' | 'CHOCH';
	brokenSwingId: string;
	brokenLevel: number;
	closePrice: number;
}

export interface LiquidityLevel {
	id: string;
	type: 'BUY_SIDE' | 'SELL_SIDE';
	price: number;
	createdAt: number;
	source: 'EQUAL_HIGH' | 'EQUAL_LOW' | 'SWING_HIGH' | 'SWING_LOW';
	sourceSwingIds: string[];
	status: 'ACTIVE' | 'SWEPT' | 'INVALIDATED';
	sweptAt?: number;
}

export interface LiquiditySweep {
	id: string;
	liquidityId: string;
	timestamp: number;
	direction: 'BUY_SIDE' | 'SELL_SIDE';
	liquidityPrice: number;
	extremePrice: number;
	closePrice: number;
}

export interface FairValueGap {
	id: string;
	type: 'BULLISH' | 'BEARISH';
	createdAt: number;
	bottom: number;
	top: number;
	midpoint: number;
	state: 'UNTOUCHED' | 'PARTIALLY_FILLED' | 'FILLED';
	lastUpdatedAt: number;
}

export interface OrderBlock {
	id: string;
	type: 'BULLISH' | 'BEARISH';
	createdAt: number;
	sourceCandleTimestamp: number;
	high: number;
	low: number;
	midpoint: number;
	state: 'ACTIVE' | 'MITIGATED' | 'INVALIDATED';
	causalStructureBreakId: string;
}

export interface SetupReason {
	key: string;
	label: string;
	score: number;
	valid: boolean;
	description: string;
}

export interface EligibilityResult {
	eligible: boolean;
	failures: readonly {
		key: string;
		label: string;
		description: string;
	}[];
}

export interface QualityScoreResult {
	score: number;
	classification: 'WEAK' | 'VALID' | 'STRONG';
	reasons: readonly SetupReason[];
}

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
	eligibility: EligibilityResult;
	score: number;
	classification: QualityScoreResult['classification'];
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
	minimumRiskReward: number;
	stopLossATRBuffer: number;
	maxPendingEntryBars: number;
}

export const DEFAULT_SMC_STRATEGY_CONFIG: SMCStrategyConfig = {
	biasTimeframe: '5m',
	entryTimeframe: '1m',
	swingLeftBars: 2,
	swingRightBars: 2,
	liquidityTolerancePercent: 0.1,
	atrPeriod: 14,
	displacementATRMultiplier: 1.2,
	minimumRiskReward: 1.5,
	stopLossATRBuffer: 0.1,
	maxPendingEntryBars: 10
};
```

## Backtest

```ts
export interface BacktestInput {
	symbol: string;
	startDate: number;
	endDate: number;
	config: SMCStrategyConfig;
}

export interface BacktestTrade {
	id: string;
	setupId: string;
	direction: 'LONG' | 'SHORT';
	entry: number;
	stopLoss: number;
	takeProfit: number;
	exitPrice: number;
	result: 'WIN' | 'LOSS';
	rMultiple: number;
	entryTimestamp: number;
	exitTimestamp: number;
	setupScore: number;
	setupReasons: SetupReason[];
}

export interface BacktestMetrics {
	totalTrades: number;
	wins: number;
	losses: number;
	winRate: number;
	profitFactor: number | null;
	expectancyR: number;
	averageR: number;
	totalR: number;
	maxDrawdownR: number;
	maxConsecutiveWins: number;
	maxConsecutiveLosses: number;
	averageRiskReward: number;
	averageTradeDurationMs: number;
}
```
