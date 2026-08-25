import type { MarketStructureState } from './market-structure-engine.js';

export type PremiumDiscountZone = 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';

export interface DealingRange {
	high: number;
	low: number;
	equilibrium: number;
	highSwingId: string;
	lowSwingId: string;
	highConfirmedAt: number;
	lowConfirmedAt: number;
	updatedAt: number;
}

export class PremiumDiscountError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PremiumDiscountError';
	}
}

/** Uses the latest confirmed swing high and swing low in the structure snapshot. */
export function calculateDealingRange(state: MarketStructureState): DealingRange | null {
	if (!state.lastHigh || !state.lastLow) return null;

	if (state.lastHigh.price <= state.lastLow.price) {
		throw new PremiumDiscountError('Dealing range high must be above its low.');
	}

	if (
		state.lastProcessedTimestamp === null ||
		state.lastHigh.confirmedTimestamp > state.lastProcessedTimestamp ||
		state.lastLow.confirmedTimestamp > state.lastProcessedTimestamp
	) {
		throw new PremiumDiscountError('Structure state contains a future-confirmed range source.');
	}

	return {
		high: state.lastHigh.price,
		low: state.lastLow.price,
		equilibrium: (state.lastHigh.price + state.lastLow.price) / 2,
		highSwingId: state.lastHigh.id,
		lowSwingId: state.lastLow.id,
		highConfirmedAt: state.lastHigh.confirmedTimestamp,
		lowConfirmedAt: state.lastLow.confirmedTimestamp,
		updatedAt: Math.max(state.lastHigh.confirmedTimestamp, state.lastLow.confirmedTimestamp)
	};
}

export function classifyPremiumDiscount(price: number, range: DealingRange): PremiumDiscountZone {
	if (!Number.isFinite(price)) throw new PremiumDiscountError('Price must be finite.');
	if (price < range.equilibrium) return 'DISCOUNT';
	if (price > range.equilibrium) return 'PREMIUM';
	return 'EQUILIBRIUM';
}
