import { describe, expect, it } from 'vitest';

import type { FairValueGap, LiquidityLevel, LiquiditySweep, OrderBlock } from '../smc/models.js';
import { calculateRiskPlan, RiskCalculationError, type RiskCalculationInput } from './engine.js';

const fvg: FairValueGap = {
	id: 'fvg',
	type: 'BULLISH',
	createdAt: 10,
	sourceCandleTimestamps: [8, 9, 10],
	bottom: 100,
	top: 104,
	midpoint: 102,
	state: 'UNTOUCHED',
	lastUpdatedAt: 10,
	causalSequenceId: 'sequence',
	causalStructureBreakId: 'break',
	causalDisplacementId: 'displacement'
};
const block: OrderBlock = {
	id: 'ob',
	type: 'BULLISH',
	createdAt: 9,
	sourceCandleTimestamp: 8,
	high: 102,
	low: 98,
	midpoint: 100,
	state: 'ACTIVE',
	causalStructureBreakId: 'break',
	causalDisplacementId: 'displacement',
	causalSequenceId: 'sequence'
};
const sweep: LiquiditySweep = {
	id: 'sweep',
	liquidityId: 'sell',
	timestamp: 7,
	direction: 'SELL_SIDE',
	liquidityPrice: 97,
	extremePrice: 96,
	closePrice: 98
};
const config = {
	minimumRiskReward: 1.5,
	stopLossATRBuffer: 0.1,
	accountBalance: 10_000,
	riskPercent: 1
};

function liquidity(
	id: string,
	type: LiquidityLevel['type'],
	price: number,
	createdAt = 5
): LiquidityLevel {
	return {
		id,
		type,
		price,
		createdAt,
		source: type === 'BUY_SIDE' ? 'SWING_HIGH' : 'SWING_LOW',
		sourceSwingIds: ['s'],
		status: 'ACTIVE'
	};
}

function longInput(overrides: Partial<RiskCalculationInput> = {}): RiskCalculationInput {
	return {
		direction: 'LONG',
		evaluationTimestamp: 10,
		fvg,
		orderBlock: block,
		sweep,
		atr: 10,
		liquidityLevels: [liquidity('near', 'BUY_SIDE', 113), liquidity('far', 'BUY_SIDE', 120)],
		config,
		...overrides
	};
}

describe('risk engine', () => {
	it('uses FVG/OB overlap, buffered long stop, nearest active target, RR, and fixed-risk size', () => {
		const plan = calculateRiskPlan(longInput());
		expect(plan).toMatchObject({
			entryZone: { min: 100, max: 102 },
			entryZoneSource: 'FVG_OB_OVERLAP',
			entryPrice: 102,
			stopLoss: 95,
			takeProfit: 113,
			riskReward: 11 / 7,
			riskAmount: 100,
			targetSource: 'LIQUIDITY',
			targetLiquidityId: 'near'
		});
		expect(plan.positionSize).toBeCloseTo(100 / 7, 12);
	});

	it('uses the FVG alone when no valid overlap exists', () => {
		const nonOverlapping = { ...block, low: 90, high: 95, midpoint: 92.5 };
		expect(
			calculateRiskPlan({
				...longInput({ orderBlock: nonOverlapping }),
				liquidityLevels: [liquidity('target', 'BUY_SIDE', 120)]
			}).entryZoneSource
		).toBe('FVG');
	});

	it('calculates the short mirror and falls back to exactly 2R without active target liquidity', () => {
		const shortPlan = calculateRiskPlan({
			...longInput(),
			direction: 'SHORT',
			fvg: { ...fvg, type: 'BEARISH', bottom: 96, top: 100, midpoint: 98 },
			orderBlock: { ...block, type: 'BEARISH', low: 98, high: 102, midpoint: 100 },
			sweep: { ...sweep, direction: 'BUY_SIDE', extremePrice: 104 },
			liquidityLevels: []
		});
		expect(shortPlan).toMatchObject({
			entryZone: { min: 98, max: 100 },
			entryPrice: 98,
			stopLoss: 105,
			takeProfit: 84,
			riskReward: 2,
			targetSource: 'FALLBACK_2R'
		});
	});

	it('fails explicitly for invalid stop geometry', () => {
		try {
			calculateRiskPlan(longInput({ sweep: { ...sweep, extremePrice: 103 } }));
			expect.unreachable('Expected invalid stop geometry');
		} catch (error) {
			expect(error).toBeInstanceOf(RiskCalculationError);
			expect((error as RiskCalculationError).code).toBe('INVALID_STOP_GEOMETRY');
		}
	});

	it('enforces minimum RR against the nearest primary liquidity target', () => {
		expect(() =>
			calculateRiskPlan(
				longInput({
					liquidityLevels: [liquidity('too-close', 'BUY_SIDE', 108)],
					config: { ...config, minimumRiskReward: 1.5 }
				})
			)
		).toThrowError(expect.objectContaining({ code: 'BELOW_MINIMUM_RR' }));
	});

	it('rejects future-confirmed inputs instead of leaking them into a backtest', () => {
		expect(() =>
			calculateRiskPlan(longInput({ liquidityLevels: [liquidity('future', 'BUY_SIDE', 112, 11)] }))
		).toThrowError(expect.objectContaining({ code: 'FUTURE_DATA' }));
	});
});
