import { describe, expect, it } from 'vitest';

import type { BacktestAnalytics } from './analytics.js';
import { generateBacktestValidationReport } from './validation-report.js';

function analytics(
	totalTrades: number,
	expectancyR: number,
	profitFactor: number | null
): BacktestAnalytics {
	return {
		metrics: {
			totalTrades,
			wins: Math.round(totalTrades / 2),
			losses: Math.floor(totalTrades / 2),
			winRate: 50,
			profitFactor,
			expectancyR,
			averageR: expectancyR,
			totalR: expectancyR * totalTrades,
			maxDrawdownR: 12,
			maxConsecutiveWins: 4,
			maxConsecutiveLosses: 6,
			averageRiskReward: 2,
			averageTradeDurationMs: 120_000
		},
		equityCurve: [],
		breakdowns: {
			direction: [],
			score: [],
			hourUtc: [],
			dayUtc: [],
			sessionUtc: []
		}
	};
}

describe('backtest validation report', () => {
	it('does not promote a profitable but undersized sample', () => {
		const report = generateBacktestValidationReport(analytics(499, 0.4, 1.8), {
			feeBps: 0,
			slippageBps: 0
		});

		expect(report.verdict).toBe('INSUFFICIENT_SAMPLE');
		expect(report.checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'SAMPLE_SIZE', status: 'FAIL' }),
				expect.objectContaining({ key: 'COSTS', status: 'WARN' })
			])
		);
	});

	it('marks a minimum-sample positive aggregate as an out-of-sample candidate', () => {
		const report = generateBacktestValidationReport(analytics(600, 0.2, 1.3), {
			feeBps: 4,
			slippageBps: 2
		});

		expect(report.verdict).toBe('CANDIDATE');
		expect(report.checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'EXPECTANCY', status: 'PASS' }),
				expect.objectContaining({ key: 'PROFIT_FACTOR', status: 'PASS' }),
				expect.objectContaining({ key: 'COSTS', status: 'PASS' })
			])
		);
	});

	it('keeps a large negative aggregate in research review', () => {
		expect(
			generateBacktestValidationReport(analytics(1_000, -0.1, 0.8), {
				feeBps: 4,
				slippageBps: 2
			}).verdict
		).toBe('NEEDS_REVIEW');
	});
});
