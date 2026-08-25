import { describe, expect, it } from 'vitest';

import { createBosState, type BosState } from './bos-engine.js';
import {
	calculateDealingRange,
	classifyPremiumDiscount,
	PremiumDiscountError
} from './premium-discount-engine.js';

function bullishState(expansionHigh = 120): BosState {
	return {
		...createBosState(),
		symbol: 'BTCUSDT',
		timeframe: '5m',
		protectedLow: {
			swingId: 'protected-hl',
			price: 100,
			confirmedAt: 10,
			establishedAt: 20,
			causalBosId: 'bullish-bos'
		},
		bullishExpansionHigh: {
			price: expansionHigh,
			timestamp: 30,
			causalBosId: 'bullish-bos'
		},
		lastProcessedTimestamp: 30
	};
}

function bearishState(): BosState {
	return {
		...createBosState(),
		symbol: 'BTCUSDT',
		timeframe: '5m',
		protectedHigh: {
			swingId: 'protected-lh',
			price: 120,
			confirmedAt: 10,
			establishedAt: 20,
			causalBosId: 'bearish-bos'
		},
		bearishExpansionLow: {
			price: 90,
			timestamp: 30,
			causalBosId: 'bearish-bos'
		},
		lastProcessedTimestamp: 30
	};
}

describe('premium/discount engine', () => {
	it('calculates a bullish range from protected HL to expansion high and exposes its source', () => {
		const range = calculateDealingRange(bullishState(), 'BULLISH');
		expect(range).toEqual({
			direction: 'BULLISH',
			high: 120,
			low: 100,
			equilibrium: 110,
			protectedSwingId: 'protected-hl',
			protectedSwingConfirmedAt: 10,
			causalBosId: 'bullish-bos',
			expansionExtremeTimestamp: 30,
			updatedAt: 30
		});
		expect(classifyPremiumDiscount(109, range!)).toBe('DISCOUNT');
		expect(classifyPremiumDiscount(110, range!)).toBe('EQUILIBRIUM');
		expect(classifyPremiumDiscount(111, range!)).toBe('PREMIUM');
	});

	it('updates deterministically when the expansion extreme changes', () => {
		const first = calculateDealingRange(bullishState(120), 'BULLISH');
		const updated = calculateDealingRange(bullishState(130), 'BULLISH');
		expect(first?.equilibrium).toBe(110);
		expect(updated).toMatchObject({ equilibrium: 115, protectedSwingId: 'protected-hl' });
	});

	it('calculates a bearish range from protected LH to expansion low', () => {
		expect(calculateDealingRange(bearishState(), 'BEARISH')).toMatchObject({
			direction: 'BEARISH',
			high: 120,
			low: 90,
			equilibrium: 105,
			protectedSwingId: 'protected-lh',
			causalBosId: 'bearish-bos'
		});
	});

	it('requires protected BOS state and valid range geometry', () => {
		expect(calculateDealingRange(createBosState(), 'BULLISH')).toBeNull();
		expect(() => calculateDealingRange(bullishState(90), 'BULLISH')).toThrow(PremiumDiscountError);
	});
});
