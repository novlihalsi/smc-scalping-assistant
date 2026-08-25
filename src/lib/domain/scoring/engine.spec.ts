import { describe, expect, it } from 'vitest';

import { classifySetupScore, scoreSetup, type SetupScoringInput } from './engine.js';

const allValid: SetupScoringInput = {
	htfBias: true,
	liquiditySweep: true,
	choch: true,
	fvg: true,
	orderBlock: true,
	premiumDiscount: true,
	displacement: true,
	validRiskReward: true
};

describe('setup scoring engine', () => {
	it('scores the PRD criteria to an exact maximum of 100 with one reason each', () => {
		const result = scoreSetup(allValid);
		expect(result.score).toBe(100);
		expect(result.classification).toBe('STRONG');
		expect(result.reasons).toHaveLength(8);
		expect(result.reasons.map(({ score }) => score)).toEqual([20, 20, 20, 15, 10, 5, 5, 5]);
		expect(
			result.reasons.every(({ valid, description }) => valid && description.includes('awarded'))
		).toBe(true);
	});

	it('awards zero and explains each unmet criterion', () => {
		const result = scoreSetup({ ...allValid, fvg: false, orderBlock: false });
		expect(result.score).toBe(75);
		expect(result.reasons.find(({ key }) => key === 'fvg')).toMatchObject({
			valid: false,
			score: 0
		});
		expect(result.reasons.find(({ key }) => key === 'orderBlock')?.description).toContain(
			'0 of 10'
		);
	});

	it.each([
		[59, 'NO_TRADE'],
		[60, 'WEAK'],
		[74, 'WEAK'],
		[75, 'VALID'],
		[84, 'VALID'],
		[85, 'STRONG']
	] as const)('classifies boundary score %s as %s', (score, expected) => {
		expect(classifySetupScore(score)).toBe(expected);
	});

	it('rejects scores outside the documented range', () => {
		expect(() => classifySetupScore(-1)).toThrow(RangeError);
		expect(() => classifySetupScore(101)).toThrow(RangeError);
	});
});
