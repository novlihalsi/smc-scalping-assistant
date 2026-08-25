import type { BosState } from './bos-engine.js';
import type { StructureBreak } from './models.js';

export type PremiumDiscountZone = 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';

export interface DealingRange {
	direction: StructureBreak['direction'];
	high: number;
	low: number;
	equilibrium: number;
	protectedSwingId: string;
	protectedSwingConfirmedAt: number;
	causalBosId: string;
	expansionExtremeTimestamp: number;
	updatedAt: number;
}

export class PremiumDiscountError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PremiumDiscountError';
	}
}

/** Uses the protected swing established by BOS and its active expansion extreme. */
export function calculateDealingRange(
	state: BosState,
	direction: StructureBreak['direction']
): DealingRange | null {
	const protectedSwing = direction === 'BULLISH' ? state.protectedLow : state.protectedHigh;
	const expansionExtreme =
		direction === 'BULLISH' ? state.bullishExpansionHigh : state.bearishExpansionLow;
	if (!protectedSwing || !expansionExtreme) return null;
	if (protectedSwing.causalBosId !== expansionExtreme.causalBosId) {
		throw new PremiumDiscountError(
			'Protected swing and expansion extreme must share a causal BOS.'
		);
	}

	const high = direction === 'BULLISH' ? expansionExtreme.price : protectedSwing.price;
	const low = direction === 'BULLISH' ? protectedSwing.price : expansionExtreme.price;
	if (high <= low) {
		throw new PremiumDiscountError('Dealing range high must be above its low.');
	}

	if (
		state.lastProcessedTimestamp === null ||
		protectedSwing.confirmedAt > state.lastProcessedTimestamp ||
		expansionExtreme.timestamp > state.lastProcessedTimestamp
	) {
		throw new PremiumDiscountError('BOS state contains a future-confirmed range source.');
	}

	return {
		direction,
		high,
		low,
		equilibrium: (high + low) / 2,
		protectedSwingId: protectedSwing.swingId,
		protectedSwingConfirmedAt: protectedSwing.confirmedAt,
		causalBosId: protectedSwing.causalBosId,
		expansionExtremeTimestamp: expansionExtreme.timestamp,
		updatedAt: Math.max(protectedSwing.establishedAt, expansionExtreme.timestamp)
	};
}

export function classifyPremiumDiscount(price: number, range: DealingRange): PremiumDiscountZone {
	if (!Number.isFinite(price)) throw new PremiumDiscountError('Price must be finite.');
	if (price < range.equilibrium) return 'DISCOUNT';
	if (price > range.equilibrium) return 'PREMIUM';
	return 'EQUILIBRIUM';
}
