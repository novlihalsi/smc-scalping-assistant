import { describe, expect, it } from 'vitest';

import { DEFAULT_SMC_STRATEGY_CONFIG } from '../strategy/index.js';
import { analyzeBacktest, type BacktestAnalytics } from './analytics.js';
import type { BacktestInput, BacktestTrade } from './models.js';
import {
	createValidationConfigHash,
	generateBacktestValidationReport,
	type BacktestValidationInput,
	type ValidationCostRun
} from './validation-report.js';

const startTimestamp = Date.UTC(2026, 0, 1);
const endTimestamp = Date.UTC(2026, 2, 31);
const range = endTimestamp - startTimestamp;

function trade(index: number, rMultiple: number, count: number): BacktestTrade {
	const entryTimestamp = startTimestamp + Math.floor((index / Math.max(1, count - 1)) * range);
	const direction = index % 2 === 0 ? 'LONG' : 'SHORT';
	return {
		id: `trade-${index}`,
		setupId: `setup-${index}`,
		direction,
		entry: 100,
		stopLoss: direction === 'LONG' ? 90 : 110,
		takeProfit: direction === 'LONG' ? 120 : 80,
		exitPrice: rMultiple > 0 ? (direction === 'LONG' ? 120 : 80) : direction === 'LONG' ? 90 : 110,
		result: rMultiple > 0 ? 'WIN' : 'LOSS',
		rMultiple,
		entryTimestamp,
		exitTimestamp: entryTimestamp + 60_000,
		setupScore: [40, 65, 85][index % 3]!,
		setupReasons: [],
		exitReason: rMultiple > 0 ? 'TAKE_PROFIT' : 'STOP_LOSS',
		intrabarAmbiguous: false,
		feesPaid: 0,
		slippagePaid: 0
	};
}

function patternedTrades(count: number): BacktestTrade[] {
	return Array.from({ length: count }, (_, index) => trade(index, index % 4 === 3 ? -1 : 1, count));
}

function analyticsWithR(trades: readonly BacktestTrade[], adjustment: number): BacktestAnalytics {
	return analyzeBacktest(
		trades.map((item) => ({ ...item, rMultiple: item.rMultiple + adjustment }))
	);
}

function costRuns(trades: readonly BacktestTrade[]): ValidationCostRun[] {
	return [
		{
			key: 'ZERO_COST',
			label: 'Zero-cost reference',
			executionConfig: { feeBps: 0, slippageBps: 0 },
			analytics: analyticsWithR(trades, 0.1)
		},
		{
			key: 'BASELINE',
			label: 'Configured baseline',
			executionConfig: { feeBps: 4, slippageBps: 2 },
			analytics: analyzeBacktest(trades)
		},
		{
			key: 'STRESS_2X',
			label: 'Cost stress',
			executionConfig: { feeBps: 8, slippageBps: 4 },
			analytics: analyticsWithR(trades, -0.2)
		}
	];
}

function validationInput(trades: BacktestTrade[]): BacktestValidationInput {
	const input: BacktestInput = {
		symbol: 'BTCUSDT',
		startDate: startTimestamp,
		endDate: endTimestamp,
		config: DEFAULT_SMC_STRATEGY_CONFIG
	};
	return {
		input,
		trades,
		analytics: analyzeBacktest(trades),
		executionConfig: { feeBps: 4, slippageBps: 2 },
		costRuns: costRuns(trades)
	};
}

describe('backtest validation report', () => {
	it('does not promote a profitable but undersized sample', () => {
		const report = generateBacktestValidationReport(validationInput(patternedTrades(499)));

		expect(report.verdict).toBe('INSUFFICIENT_SAMPLE');
		expect(report.checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'SAMPLE_SIZE', status: 'FAIL' }),
				expect.objectContaining({ key: 'OOS_EVIDENCE', status: 'PASS' })
			])
		);
	});

	it('records explicit OOS, monthly, breakdown, cost, provenance, and outlier evidence', () => {
		const input = validationInput(patternedTrades(600));
		const report = generateBacktestValidationReport(input);

		expect(report.verdict).toBe('CANDIDATE');
		expect(report.chronologicalSplit).toMatchObject({
			method: 'CHRONOLOGICAL_TIME_70_30',
			inSamplePercent: 70,
			outOfSamplePercent: 30
		});
		expect(report.chronologicalSplit.segments.map(({ key }) => key)).toEqual([
			'IN_SAMPLE',
			'OUT_OF_SAMPLE'
		]);
		expect(report.chronologicalSplit.segments[1].metrics.totalTrades).toBeGreaterThan(0);
		expect(report.robustness.months.map(({ key }) => key)).toEqual([
			'2026-01',
			'2026-02',
			'2026-03'
		]);
		expect(report.robustness.direction.map(({ key }) => key)).toEqual(['LONG', 'SHORT']);
		expect(report.robustness.score.map(({ key }) => key)).toEqual(['WEAK', 'VALID', 'STRONG']);
		expect(report.robustness.hourUtc.length).toBeGreaterThan(1);
		expect(report.costSensitivity.map(({ key }) => key)).toEqual([
			'ZERO_COST',
			'BASELINE',
			'STRESS_2X'
		]);
		expect(report.costSensitivity[0]?.expectancyDeltaR).toBeCloseTo(0.1, 12);
		expect(report.costSensitivity[2]?.expectancyDeltaR).toBeCloseTo(-0.2, 12);
		expect(report.costSensitivity[2]?.totalRDelta).toBeCloseTo(-120, 10);
		expect(report.outlierConcentration).toMatchObject({ topPercent: 5, topTradeCount: 30 });
		expect(report.provenance).toMatchObject({
			schemaVersion: 'validation-v1',
			strategy: 'SMC_SCALPING_V1',
			symbol: 'BTCUSDT',
			configHash: expect.stringMatching(/^fnv1a32:[0-9a-f]{8}$/)
		});
	});

	it('does not promote a positive aggregate when the chronological OOS segment fails', () => {
		const trades = patternedTrades(600).map((item, index) => ({
			...item,
			rMultiple: index < 420 ? 2 : -1,
			result: (index < 420 ? 'WIN' : 'LOSS') as BacktestTrade['result']
		}));
		const report = generateBacktestValidationReport(validationInput(trades));

		expect(report).not.toHaveProperty('analytics');
		expect(report.verdict).toBe('NEEDS_REVIEW');
		expect(report.checks).toContainEqual(
			expect.objectContaining({ key: 'OOS_EVIDENCE', status: 'FAIL' })
		);
	});

	it('produces a stable config fingerprint that changes with strategy or cost inputs', () => {
		const baseline = createValidationConfigHash(DEFAULT_SMC_STRATEGY_CONFIG, {
			feeBps: 4,
			slippageBps: 2
		});

		expect(
			createValidationConfigHash({ ...DEFAULT_SMC_STRATEGY_CONFIG }, { feeBps: 4, slippageBps: 2 })
		).toBe(baseline);
		expect(
			createValidationConfigHash(
				{ ...DEFAULT_SMC_STRATEGY_CONFIG, atrPeriod: 20 },
				{ feeBps: 4, slippageBps: 2 }
			)
		).not.toBe(baseline);
		expect(
			createValidationConfigHash(DEFAULT_SMC_STRATEGY_CONFIG, {
				feeBps: 8,
				slippageBps: 4
			})
		).not.toBe(baseline);
	});

	it('warns when the top five percent dominate gross winning R', () => {
		const trades = Array.from({ length: 20 }, (_, index) =>
			trade(index, index === 0 ? 100 : 1, 20)
		);
		const report = generateBacktestValidationReport(validationInput(trades));

		expect(report.outlierConcentration.shareOfGrossProfitPercent).toBeGreaterThan(50);
		expect(report.checks).toContainEqual(
			expect.objectContaining({ key: 'OUTLIER_CONCENTRATION', status: 'WARN' })
		);
	});
});
