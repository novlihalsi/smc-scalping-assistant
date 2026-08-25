import { describe, expect, expectTypeOf, it } from 'vitest';

import {
	DEFAULT_SMC_STRATEGY_CONFIG,
	type BacktestInput,
	type BacktestMetrics,
	type BacktestTrade,
	type Candle,
	type FairValueGap,
	type LiquidityLevel,
	type LiquiditySweep,
	type MarketBias,
	type MarketStructurePoint,
	type OrderBlock,
	type SetupReason,
	type SMCStrategyConfig,
	type StructureBreak,
	type StructureType,
	type SwingPoint,
	type Timeframe,
	type TradingSetup
} from './index.js';

const timestamp = Date.UTC(2026, 0, 1);

const setupReason: SetupReason = {
	key: 'htf-bias',
	label: 'HTF bias',
	score: 20,
	valid: true,
	description: 'The confirmed higher-timeframe bias matches the setup direction.'
};

const candle: Candle = {
	symbol: 'BTCUSDT',
	timeframe: '1m',
	openTimestamp: timestamp,
	closeTimestamp: timestamp + 60_000,
	open: 100,
	high: 102,
	low: 99,
	close: 101,
	volume: 10,
	closed: true
};

const swingPoint: SwingPoint = {
	id: 'swing-1',
	symbol: candle.symbol,
	timeframe: candle.timeframe,
	sourceIndex: 2,
	sourceTimestamp: candle.openTimestamp,
	confirmedTimestamp: candle.closeTimestamp + 120_000,
	price: candle.high,
	type: 'HIGH',
	strength: 2
};

const marketStructurePoint: MarketStructurePoint = {
	swingId: swingPoint.id,
	timestamp: swingPoint.confirmedTimestamp,
	price: swingPoint.price,
	structure: 'HH'
};

const structureBreak: StructureBreak = {
	id: 'break-1',
	timestamp: timestamp + 240_000,
	direction: 'BULLISH',
	type: 'BOS',
	brokenSwingId: swingPoint.id,
	brokenLevel: swingPoint.price,
	closePrice: 103
};

const liquidityLevel: LiquidityLevel = {
	id: 'liquidity-1',
	type: 'BUY_SIDE',
	price: swingPoint.price,
	createdAt: swingPoint.confirmedTimestamp,
	source: 'SWING_HIGH',
	sourceSwingIds: [swingPoint.id],
	status: 'ACTIVE'
};

const liquiditySweep: LiquiditySweep = {
	id: 'sweep-1',
	liquidityId: liquidityLevel.id,
	timestamp: timestamp + 300_000,
	direction: 'BUY_SIDE',
	liquidityPrice: liquidityLevel.price,
	extremePrice: 103,
	closePrice: 101
};

const fairValueGap: FairValueGap = {
	id: 'fvg-1',
	type: 'BULLISH',
	createdAt: timestamp + 360_000,
	bottom: 101,
	top: 102,
	midpoint: 101.5,
	state: 'UNTOUCHED',
	lastUpdatedAt: timestamp + 360_000
};

const orderBlock: OrderBlock = {
	id: 'order-block-1',
	type: 'BULLISH',
	createdAt: timestamp + 360_000,
	sourceCandleTimestamp: timestamp + 240_000,
	high: 101,
	low: 99,
	midpoint: 100,
	state: 'ACTIVE',
	causalStructureBreakId: structureBreak.id
};

const tradingSetup: TradingSetup = {
	id: 'setup-1',
	symbol: candle.symbol,
	createdAt: timestamp + 420_000,
	updatedAt: timestamp + 420_000,
	direction: 'LONG',
	status: 'VALID',
	eligibility: { eligible: true, failures: [] },
	score: 75,
	classification: 'VALID',
	entryZone: { min: fairValueGap.bottom, max: fairValueGap.top },
	entryPrice: fairValueGap.top,
	stopLoss: 98,
	takeProfit: 108,
	riskReward: 2,
	reasons: [setupReason],
	sourceEventIds: [liquiditySweep.id, structureBreak.id, fairValueGap.id],
	dependencies: {
		fvgId: fairValueGap.id,
		orderBlockId: null,
		sweepId: liquiditySweep.id,
		structureBreakId: structureBreak.id,
		displacementId: 'displacement-1',
		protectedSwingId: 'protected-hl',
		protectedSwingPrice: 98,
		protectedBosId: 'protecting-bos-1'
	},
	pendingEntryBars: 0
};

const backtestInput: BacktestInput = {
	symbol: candle.symbol,
	startDate: timestamp,
	endDate: timestamp + 86_400_000,
	config: DEFAULT_SMC_STRATEGY_CONFIG
};

const backtestTrade: BacktestTrade = {
	id: 'trade-1',
	setupId: tradingSetup.id,
	direction: tradingSetup.direction,
	entry: 100,
	stopLoss: tradingSetup.stopLoss,
	takeProfit: tradingSetup.takeProfit,
	exitPrice: tradingSetup.takeProfit,
	result: 'WIN',
	rMultiple: 2,
	entryTimestamp: timestamp + 480_000,
	exitTimestamp: timestamp + 600_000,
	setupScore: tradingSetup.score,
	setupReasons: tradingSetup.reasons,
	exitReason: 'TAKE_PROFIT',
	intrabarAmbiguous: false,
	feesPaid: 0,
	slippagePaid: 0
};

const backtestMetrics: BacktestMetrics = {
	totalTrades: 1,
	wins: 1,
	losses: 0,
	winRate: 100,
	profitFactor: null,
	expectancyR: 2,
	averageR: 2,
	totalR: 2,
	maxDrawdownR: 0,
	maxConsecutiveWins: 1,
	maxConsecutiveLosses: 0,
	averageRiskReward: 2,
	averageTradeDurationMs: 120_000
};

describe('core domain models', () => {
	it('exports framework-independent model contracts', () => {
		expectTypeOf<'5m'>().toMatchTypeOf<Timeframe>();
		expectTypeOf<'HL'>().toMatchTypeOf<StructureType>();
		expectTypeOf<'NEUTRAL'>().toMatchTypeOf<MarketBias>();
		expectTypeOf(DEFAULT_SMC_STRATEGY_CONFIG).toMatchTypeOf<SMCStrategyConfig>();

		expect({
			candle,
			swingPoint,
			marketStructurePoint,
			structureBreak,
			liquidityLevel,
			liquiditySweep,
			fairValueGap,
			orderBlock,
			tradingSetup,
			backtestInput,
			backtestTrade,
			backtestMetrics
		}).toBeDefined();
	});

	it('matches the documented default strategy config', () => {
		expect(DEFAULT_SMC_STRATEGY_CONFIG).toEqual({
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
		});
	});
});
