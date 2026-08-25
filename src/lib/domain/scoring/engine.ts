import type { SetupReason } from './models.js';

export type SetupClassification = 'NO_TRADE' | 'WEAK' | 'VALID' | 'STRONG';

export interface SetupScoringInput {
	htfBias: boolean;
	liquiditySweep: boolean;
	choch: boolean;
	fvg: boolean;
	orderBlock: boolean;
	premiumDiscount: boolean;
	displacement: boolean;
	validRiskReward: boolean;
}

export interface SetupScoreResult {
	score: number;
	classification: SetupClassification;
	reasons: readonly SetupReason[];
}

const CRITERIA = [
	['htfBias', 'HTF bias', 20],
	['liquiditySweep', 'Liquidity sweep', 20],
	['choch', 'CHoCH', 20],
	['fvg', 'Fair Value Gap', 15],
	['orderBlock', 'Order Block', 10],
	['premiumDiscount', 'Premium / Discount', 5],
	['displacement', 'Displacement', 5],
	['validRiskReward', 'Valid risk/reward', 5]
] as const satisfies readonly (readonly [keyof SetupScoringInput, string, number])[];

export function scoreSetup(input: SetupScoringInput): SetupScoreResult {
	const reasons = CRITERIA.map(([key, label, weight]): SetupReason => {
		const valid = input[key];
		return {
			key,
			label,
			score: valid ? weight : 0,
			valid,
			description: valid
				? `${label} confirmed; awarded ${weight} points.`
				: `${label} not confirmed; awarded 0 of ${weight} points.`
		};
	});
	const score = reasons.reduce((total, reason) => total + reason.score, 0);
	return { score, classification: classifySetupScore(score), reasons };
}

export function classifySetupScore(score: number): SetupClassification {
	if (!Number.isFinite(score) || score < 0 || score > 100) {
		throw new RangeError('Setup score must be a finite number from 0 through 100.');
	}
	if (score < 60) return 'NO_TRADE';
	if (score < 75) return 'WEAK';
	if (score < 85) return 'VALID';
	return 'STRONG';
}
