import type { FairValueGap, LiquidityLevel, LiquiditySweep, OrderBlock } from '../smc/models.js';
import type { StrategyDirection } from '../strategy/state-machine.js';

export interface RiskConfig {
	minimumRiskReward: number;
	stopLossATRBuffer: number;
	accountBalance: number;
	riskPercent: number;
}

export interface RiskCalculationInput {
	direction: StrategyDirection;
	evaluationTimestamp: number;
	fvg: FairValueGap;
	orderBlock?: OrderBlock | null;
	sweep: LiquiditySweep;
	atr: number;
	liquidityLevels: readonly LiquidityLevel[];
	config: RiskConfig;
}

export interface RiskPlan {
	direction: StrategyDirection;
	entryZone: { min: number; max: number };
	entryZoneSource: 'FVG_OB_OVERLAP' | 'FVG';
	entryPrice: number;
	stopLoss: number;
	takeProfit: number;
	riskReward: number;
	positionSize: number;
	riskAmount: number;
	targetSource: 'LIQUIDITY' | 'FALLBACK_2R';
	targetLiquidityId?: string;
}

export type RiskErrorCode =
	| 'INVALID_INPUT'
	| 'FUTURE_DATA'
	| 'INVALID_ENTRY_ZONE'
	| 'INVALID_STOP_GEOMETRY'
	| 'INVALID_TARGET_GEOMETRY'
	| 'BELOW_MINIMUM_RR';

export class RiskCalculationError extends Error {
	constructor(
		public readonly code: RiskErrorCode,
		message: string
	) {
		super(message);
		this.name = 'RiskCalculationError';
	}
}

const FALLBACK_RISK_REWARD = 2;

export function calculateRiskPlan(input: RiskCalculationInput): RiskPlan {
	validateInput(input);
	const { entryZone, source } = selectEntryZone(input);
	const entryPrice = (entryZone.min + entryZone.max) / 2;
	const stopLoss =
		input.direction === 'LONG'
			? input.sweep.extremePrice - input.atr * input.config.stopLossATRBuffer
			: input.sweep.extremePrice + input.atr * input.config.stopLossATRBuffer;
	const riskDistance = input.direction === 'LONG' ? entryPrice - stopLoss : stopLoss - entryPrice;

	if (!Number.isFinite(riskDistance) || riskDistance <= 0) {
		throw new RiskCalculationError(
			'INVALID_STOP_GEOMETRY',
			`${input.direction} stop must be beyond the entry price in the risk direction.`
		);
	}

	const targetLevel = findNearestTarget(input, entryPrice);
	const takeProfit = targetLevel
		? targetLevel.price
		: input.direction === 'LONG'
			? entryPrice + riskDistance * FALLBACK_RISK_REWARD
			: entryPrice - riskDistance * FALLBACK_RISK_REWARD;
	const rewardDistance =
		input.direction === 'LONG' ? takeProfit - entryPrice : entryPrice - takeProfit;

	if (!Number.isFinite(rewardDistance) || rewardDistance <= 0) {
		throw new RiskCalculationError(
			'INVALID_TARGET_GEOMETRY',
			`${input.direction} target must be beyond the entry price in the reward direction.`
		);
	}

	const riskReward = rewardDistance / riskDistance;
	if (riskReward < input.config.minimumRiskReward) {
		throw new RiskCalculationError(
			'BELOW_MINIMUM_RR',
			`Risk/reward ${riskReward} is below minimum ${input.config.minimumRiskReward}.`
		);
	}

	const riskAmount = input.config.accountBalance * (input.config.riskPercent / 100);
	return {
		direction: input.direction,
		entryZone,
		entryZoneSource: source,
		entryPrice,
		stopLoss,
		takeProfit,
		riskReward,
		positionSize: riskAmount / riskDistance,
		riskAmount,
		targetSource: targetLevel ? 'LIQUIDITY' : 'FALLBACK_2R',
		...(targetLevel ? { targetLiquidityId: targetLevel.id } : {})
	};
}

function selectEntryZone(input: RiskCalculationInput): {
	entryZone: RiskPlan['entryZone'];
	source: RiskPlan['entryZoneSource'];
} {
	const fvgZone = { min: input.fvg.bottom, max: input.fvg.top };
	const block = input.orderBlock;
	if (
		block &&
		block.state === 'ACTIVE' &&
		block.type === expectedMarketDirection(input.direction)
	) {
		const overlap = {
			min: Math.max(fvgZone.min, block.low),
			max: Math.min(fvgZone.max, block.high)
		};
		if (overlap.min <= overlap.max) return { entryZone: overlap, source: 'FVG_OB_OVERLAP' };
	}
	return { entryZone: fvgZone, source: 'FVG' };
}

function findNearestTarget(input: RiskCalculationInput, entryPrice: number): LiquidityLevel | null {
	const targetType = input.direction === 'LONG' ? 'BUY_SIDE' : 'SELL_SIDE';
	const candidates = input.liquidityLevels.filter(
		(level) =>
			level.status === 'ACTIVE' &&
			level.type === targetType &&
			level.createdAt <= input.evaluationTimestamp &&
			(input.direction === 'LONG' ? level.price > entryPrice : level.price < entryPrice)
	);
	return (
		candidates.sort((left, right) =>
			input.direction === 'LONG' ? left.price - right.price : right.price - left.price
		)[0] ?? null
	);
}

function validateInput(input: RiskCalculationInput): void {
	const { config } = input;
	if (
		!Number.isFinite(input.evaluationTimestamp) ||
		!Number.isFinite(input.atr) ||
		input.atr <= 0 ||
		!Number.isFinite(config.minimumRiskReward) ||
		config.minimumRiskReward <= 0 ||
		!Number.isFinite(config.stopLossATRBuffer) ||
		config.stopLossATRBuffer < 0 ||
		!Number.isFinite(config.accountBalance) ||
		config.accountBalance <= 0 ||
		!Number.isFinite(config.riskPercent) ||
		config.riskPercent <= 0 ||
		config.riskPercent > 100
	) {
		throw new RiskCalculationError(
			'INVALID_INPUT',
			'Risk inputs and configuration must be finite and positive.'
		);
	}
	if (
		!Number.isFinite(input.fvg.bottom) ||
		!Number.isFinite(input.fvg.top) ||
		input.fvg.bottom <= 0 ||
		input.fvg.bottom >= input.fvg.top ||
		input.fvg.state === 'FILLED' ||
		input.fvg.type !== expectedMarketDirection(input.direction)
	) {
		throw new RiskCalculationError(
			'INVALID_ENTRY_ZONE',
			'A matching unfilled FVG with positive width is required.'
		);
	}
	const expectedSweep = input.direction === 'LONG' ? 'SELL_SIDE' : 'BUY_SIDE';
	if (input.sweep.direction !== expectedSweep) {
		throw new RiskCalculationError(
			'INVALID_INPUT',
			`${input.direction} requires a ${expectedSweep} sweep.`
		);
	}
	if (!Number.isFinite(input.sweep.extremePrice) || input.sweep.extremePrice <= 0) {
		throw new RiskCalculationError(
			'INVALID_INPUT',
			'Sweep extreme price must be finite and positive.'
		);
	}
	if (
		input.orderBlock &&
		(!Number.isFinite(input.orderBlock.low) ||
			!Number.isFinite(input.orderBlock.high) ||
			input.orderBlock.low <= 0 ||
			input.orderBlock.low > input.orderBlock.high)
	) {
		throw new RiskCalculationError('INVALID_INPUT', 'Order Block geometry is invalid.');
	}
	if (input.liquidityLevels.some((level) => !Number.isFinite(level.price) || level.price <= 0)) {
		throw new RiskCalculationError(
			'INVALID_INPUT',
			'Liquidity prices must be finite and positive.'
		);
	}
	if (
		input.fvg.createdAt > input.evaluationTimestamp ||
		input.fvg.lastUpdatedAt > input.evaluationTimestamp ||
		input.sweep.timestamp > input.evaluationTimestamp ||
		(input.orderBlock?.createdAt ?? 0) > input.evaluationTimestamp ||
		(input.orderBlock?.sourceCandleTimestamp ?? 0) > input.evaluationTimestamp ||
		input.liquidityLevels.some(
			(level) =>
				level.createdAt > input.evaluationTimestamp ||
				(level.sweptAt ?? 0) > input.evaluationTimestamp
		)
	) {
		throw new RiskCalculationError(
			'FUTURE_DATA',
			'Risk calculation inputs contain future-confirmed data.'
		);
	}
}

function expectedMarketDirection(direction: StrategyDirection): 'BULLISH' | 'BEARISH' {
	return direction === 'LONG' ? 'BULLISH' : 'BEARISH';
}
