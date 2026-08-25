import { describe, expect, it } from 'vitest';

import {
	classifyQualityScore,
	evaluateSetupEligibility,
	QUALITY_SCORE_BANDS,
	QUALITY_SCORE_MAX,
	QUALITY_SCORE_MIN,
	scoreSetupQuality,
	type EligibilityInput,
	type QualityScoringInput
} from './engine.js';

const eligibleInput: EligibilityInput = {
	alignedHtfBias: true,
	liquiditySweep: true,
	choch: true,
	displacement: true,
	causalFvg: true,
	validEntryGeometry: true,
	validRiskReward: true
};

const emptyQuality: QualityScoringInput = {
	orderBlockOverlap: false,
	premiumDiscountAlignment: false,
	sweepQuality: false,
	displacementStrength: false,
	fvgQuality: false,
	targetQuality: false,
	sessionReady: false
};

const maximumQuality: QualityScoringInput = {
	orderBlockOverlap: true,
	premiumDiscountAlignment: true,
	sweepQuality: true,
	displacementStrength: true,
	fvgQuality: true,
	targetQuality: true,
	sessionReady: true
};

describe('setup eligibility and quality scoring', () => {
	it('defines classification thresholds once for scoring and downstream analytics', () => {
		expect(QUALITY_SCORE_BANDS).toEqual([
			{ classification: 'WEAK', label: '0–59 · Weak', min: 0, max: 59 },
			{ classification: 'VALID', label: '60–79 · Valid', min: 60, max: 79 },
			{ classification: 'STRONG', label: '80–100 · Strong', min: 80, max: 100 }
		]);
		expect({ min: QUALITY_SCORE_MIN, max: QUALITY_SCORE_MAX }).toEqual({ min: 0, max: 100 });
	});

	it('returns an explicit eligibility failure without a numeric score', () => {
		const result = evaluateSetupEligibility({ ...eligibleInput, causalFvg: false });

		expect(result).toEqual({
			eligible: false,
			failures: [expect.objectContaining({ key: 'causalFvg', label: 'Causal Fair Value Gap' })]
		});
		expect(result).not.toHaveProperty('score');
		expect(result).not.toHaveProperty('classification');
	});

	it('passes only when every mandatory eligibility rule passes', () => {
		expect(evaluateSetupEligibility(eligibleInput)).toEqual({ eligible: true, failures: [] });
		expect(
			evaluateSetupEligibility({
				...eligibleInput,
				alignedHtfBias: false,
				validRiskReward: false
			}).failures.map(({ key }) => key)
		).toEqual(['alignedHtfBias', 'validRiskReward']);
	});

	it('scores the locked quality table to an exact maximum of 100', () => {
		const result = scoreSetupQuality(maximumQuality);

		expect(result.score).toBe(100);
		expect(result.classification).toBe('STRONG');
		expect(result.reasons.map(({ score }) => score)).toEqual([25, 20, 15, 15, 10, 10, 5]);
	});

	it.each([
		[{}, 0, 'WEAK'],
		[{ orderBlockOverlap: true, premiumDiscountAlignment: true, sweepQuality: true }, 60, 'VALID'],
		[
			{
				orderBlockOverlap: true,
				premiumDiscountAlignment: true,
				sweepQuality: true,
				displacementStrength: true,
				fvgQuality: true
			},
			85,
			'STRONG'
		]
	] as const)('makes quality %s reachable at %s as %s', (overrides, score, expected) => {
		const result = scoreSetupQuality({ ...emptyQuality, ...overrides });

		expect(result).toMatchObject({ score, classification: expected });
	});

	it.each([
		[0, 'WEAK'],
		[59, 'WEAK'],
		[60, 'VALID'],
		[79, 'VALID'],
		[80, 'STRONG'],
		[100, 'STRONG']
	] as const)('classifies quality boundary score %s as %s', (score, expected) => {
		expect(classifyQualityScore(score)).toBe(expected);
	});

	it('rejects quality scores outside the documented range', () => {
		expect(() => classifyQualityScore(-1)).toThrow(RangeError);
		expect(() => classifyQualityScore(101)).toThrow(RangeError);
	});
});
