import type { SetupReason } from './models.js';

export type SetupClassification = 'WEAK' | 'VALID' | 'STRONG';

export interface EligibilityInput {
	alignedHtfBias: boolean;
	liquiditySweep: boolean;
	choch: boolean;
	displacement: boolean;
	causalFvg: boolean;
	validEntryGeometry: boolean;
	validRiskReward: boolean;
}

export interface EligibilityFailure {
	key: keyof EligibilityInput;
	label: string;
	description: string;
}

export interface EligibilityResult {
	eligible: boolean;
	failures: readonly EligibilityFailure[];
}

export interface QualityScoringInput {
	orderBlockOverlap: boolean;
	premiumDiscountAlignment: boolean;
	sweepQuality: boolean;
	displacementStrength: boolean;
	fvgQuality: boolean;
	targetQuality: boolean;
	sessionReady: boolean;
}

export interface QualityScoreResult {
	score: number;
	classification: SetupClassification;
	reasons: readonly SetupReason[];
}

export const QUALITY_SCORE_BANDS = [
	{ classification: 'WEAK', label: '0–59 · Weak', min: 0, max: 59 },
	{ classification: 'VALID', label: '60–79 · Valid', min: 60, max: 79 },
	{ classification: 'STRONG', label: '80–100 · Strong', min: 80, max: 100 }
] as const satisfies readonly {
	classification: SetupClassification;
	label: string;
	min: number;
	max: number;
}[];

export const QUALITY_SCORE_MIN = QUALITY_SCORE_BANDS[0].min;
export const QUALITY_SCORE_MAX = QUALITY_SCORE_BANDS[QUALITY_SCORE_BANDS.length - 1].max;

const ELIGIBILITY_CRITERIA = [
	['alignedHtfBias', 'Aligned HTF bias'],
	['liquiditySweep', 'Liquidity sweep'],
	['choch', 'CHoCH'],
	['displacement', 'Displacement'],
	['causalFvg', 'Causal Fair Value Gap'],
	['validEntryGeometry', 'Valid entry geometry'],
	['validRiskReward', 'Minimum risk/reward']
] as const satisfies readonly (readonly [keyof EligibilityInput, string])[];

const QUALITY_CRITERIA = [
	['orderBlockOverlap', 'Order Block overlap quality', 25],
	['premiumDiscountAlignment', 'Premium / Discount alignment', 20],
	['sweepQuality', 'Sweep quality', 15],
	['displacementStrength', 'Displacement strength', 15],
	['fvgQuality', 'FVG quality', 10],
	['targetQuality', 'Target quality', 10],
	['sessionReady', 'Reserved / session-ready', 5]
] as const satisfies readonly (readonly [keyof QualityScoringInput, string, number])[];

export function evaluateSetupEligibility(input: EligibilityInput): EligibilityResult {
	const failures = ELIGIBILITY_CRITERIA.filter(([key]) => !input[key]).map(
		([key, label]): EligibilityFailure => ({
			key,
			label,
			description: `${label} is mandatory for setup eligibility.`
		})
	);
	return { eligible: failures.length === 0, failures };
}

export function scoreSetupQuality(input: QualityScoringInput): QualityScoreResult {
	const reasons = QUALITY_CRITERIA.map(([key, label, weight]): SetupReason => {
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
	return { score, classification: classifyQualityScore(score), reasons };
}

export function classifyQualityScore(score: number): SetupClassification {
	if (!Number.isFinite(score) || score < QUALITY_SCORE_MIN || score > QUALITY_SCORE_MAX) {
		throw new RangeError(
			`Quality score must be a finite number from ${QUALITY_SCORE_MIN} through ${QUALITY_SCORE_MAX}.`
		);
	}
	const band = QUALITY_SCORE_BANDS.find(({ min, max }) => score >= min && score <= max);
	if (!band) throw new RangeError('Quality score does not match a configured classification band.');
	return band.classification;
}
