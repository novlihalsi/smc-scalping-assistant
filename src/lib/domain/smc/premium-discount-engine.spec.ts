import { describe, expect, it } from 'vitest';

import type { MarketStructureState } from './market-structure-engine.js';
import type { SwingPoint } from './models.js';
import {
	calculateDealingRange,
	classifyPremiumDiscount,
	PremiumDiscountError
} from './premium-discount-engine.js';

function swing(
	id: string,
	type: 'HIGH' | 'LOW',
	price: number,
	confirmedTimestamp: number
): SwingPoint {
	return {
		id,
		symbol: 'BTCUSDT',
		timeframe: '5m',
		sourceIndex: 0,
		sourceTimestamp: confirmedTimestamp - 1,
		confirmedTimestamp,
		price,
		type,
		strength: 2
	};
}

function state(high: SwingPoint | null, low: SwingPoint | null): MarketStructureState {
	return {
		symbol: 'BTCUSDT',
		timeframe: '5m',
		bias: 'BULLISH',
		sequence: [],
		lastHigh: high,
		lastLow: low,
		latestHighStructure: null,
		latestLowStructure: null,
		lastProcessedTimestamp: Math.max(high?.confirmedTimestamp ?? 0, low?.confirmedTimestamp ?? 0)
	};
}

describe('premium/discount engine', () => {
	it('calculates equilibrium from the latest confirmed swing range and exposes its source', () => {
		const range = calculateDealingRange(
			state(swing('h1', 'HIGH', 120, 20), swing('l1', 'LOW', 100, 10))
		);
		expect(range).toEqual({
			high: 120,
			low: 100,
			equilibrium: 110,
			highSwingId: 'h1',
			lowSwingId: 'l1',
			highConfirmedAt: 20,
			lowConfirmedAt: 10,
			updatedAt: 20
		});
		expect(classifyPremiumDiscount(109, range!)).toBe('DISCOUNT');
		expect(classifyPremiumDiscount(110, range!)).toBe('EQUILIBRIUM');
		expect(classifyPremiumDiscount(111, range!)).toBe('PREMIUM');
	});

	it('updates deterministically when the latest confirmed range source changes', () => {
		const low = swing('l1', 'LOW', 100, 10);
		const first = calculateDealingRange(state(swing('h1', 'HIGH', 120, 20), low));
		const updated = calculateDealingRange(state(swing('h2', 'HIGH', 130, 30), low));
		expect(first?.equilibrium).toBe(110);
		expect(updated).toMatchObject({ equilibrium: 115, highSwingId: 'h2', updatedAt: 30 });
	});

	it('requires both confirmed sources and valid range geometry', () => {
		expect(calculateDealingRange(state(null, swing('l1', 'LOW', 100, 10)))).toBeNull();
		expect(() =>
			calculateDealingRange(state(swing('h1', 'HIGH', 90, 20), swing('l1', 'LOW', 100, 10)))
		).toThrow(PremiumDiscountError);
	});
});
