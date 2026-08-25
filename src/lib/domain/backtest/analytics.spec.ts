import { describe, expect, it } from 'vitest';

import type { BacktestTrade } from './models.js';
import { analyzeBacktest, BacktestAnalyticsError, calculateBacktestMetrics } from './analytics.js';

const baseTimestamp = Date.UTC(2026, 0, 1);

function trade(
	id: string,
	rMultiple: number,
	entryOffsetMinutes: number,
	overrides: Partial<BacktestTrade> = {}
): BacktestTrade {
	const direction = overrides.direction ?? 'LONG';
	const entryTimestamp = baseTimestamp + entryOffsetMinutes * 60_000;
	return {
		id,
		setupId: `setup-${id}`,
		direction,
		entry: 100,
		stopLoss: direction === 'LONG' ? 90 : 110,
		takeProfit: direction === 'LONG' ? 120 : 80,
		exitPrice: rMultiple > 0 ? (direction === 'LONG' ? 120 : 80) : direction === 'LONG' ? 90 : 110,
		result: rMultiple > 0 ? 'WIN' : 'LOSS',
		rMultiple,
		entryTimestamp,
		exitTimestamp: entryTimestamp + 60_000,
		setupScore: 80,
		setupReasons: [],
		exitReason: rMultiple > 0 ? 'TAKE_PROFIT' : 'STOP_LOSS',
		intrabarAmbiguous: false,
		feesPaid: 0,
		slippagePaid: 0,
		...overrides
	};
}

describe('backtest analytics', () => {
	it('calculates the complete metric fixture in chronological exit order', () => {
		const metrics = calculateBacktestMetrics([
			trade('four', -0.5, 30, { exitTimestamp: baseTimestamp + 34 * 60_000 }),
			trade('one', 2, 0, { exitTimestamp: baseTimestamp + 1 * 60_000 }),
			trade('three', 1.5, 20, { exitTimestamp: baseTimestamp + 23 * 60_000 }),
			trade('two', -1, 10, { exitTimestamp: baseTimestamp + 12 * 60_000 })
		]);

		expect(metrics).toMatchObject({
			totalTrades: 4,
			wins: 2,
			losses: 2,
			winRate: 50,
			expectancyR: 0.5,
			averageR: 0.5,
			totalR: 2,
			maxDrawdownR: 1,
			maxConsecutiveWins: 1,
			maxConsecutiveLosses: 1,
			averageRiskReward: 2,
			averageTradeDurationMs: 150_000
		});
		expect(metrics.profitFactor).toBeCloseTo(3.5 / 1.5, 12);
	});

	it('measures drawdown from the initial zero-R peak and consecutive losses', () => {
		const analytics = analyzeBacktest([
			trade('one', -1, 0),
			trade('two', -0.5, 2),
			trade('three', 2, 4)
		]);

		expect(
			analytics.equityCurve.map(({ cumulativeR, drawdownR }) => ({ cumulativeR, drawdownR }))
		).toEqual([
			{ cumulativeR: -1, drawdownR: 1 },
			{ cumulativeR: -1.5, drawdownR: 1.5 },
			{ cumulativeR: 0.5, drawdownR: 0 }
		]);
		expect(analytics.metrics.maxDrawdownR).toBe(1.5);
		expect(analytics.metrics.maxConsecutiveLosses).toBe(2);
	});

	it('uses null profit factor when no losing trades exist and zero when no winners exist', () => {
		expect(calculateBacktestMetrics([trade('win', 2, 0)]).profitFactor).toBeNull();
		expect(calculateBacktestMetrics([trade('loss', -1, 0)]).profitFactor).toBe(0);
		expect(calculateBacktestMetrics([]).profitFactor).toBeNull();
	});

	it('builds direction, score, UTC hour/day, and session breakdowns', () => {
		const analytics = analyzeBacktest([
			trade('asia-long', 2, 60, { setupScore: 88 }),
			trade('london-short', -1, 9 * 60, { direction: 'SHORT', setupScore: 78 }),
			trade('new-york', 1.5, 14 * 60, { setupScore: 70 }),
			trade('next-day', -1, 24 * 60 + 22 * 60, { setupScore: 55 })
		]);

		expect(
			analytics.breakdowns.direction.map(({ key, metrics }) => [key, metrics.totalTrades])
		).toEqual([
			['LONG', 3],
			['SHORT', 1]
		]);
		expect(
			analytics.breakdowns.score.map(({ key, metrics }) => [key, metrics.totalTrades])
		).toEqual([
			['NO_TRADE', 1],
			['WEAK', 1],
			['VALID', 1],
			['STRONG', 1]
		]);
		expect(analytics.breakdowns.hourUtc.map(({ key }) => key)).toEqual(['1', '9', '14', '22']);
		expect(analytics.breakdowns.dayUtc.map(({ key }) => key)).toEqual(['2026-01-01', '2026-01-02']);
		expect(
			analytics.breakdowns.sessionUtc.map(({ key, metrics }) => [key, metrics.totalTrades])
		).toEqual([
			['ASIA', 1],
			['LONDON', 1],
			['NEW_YORK', 1],
			['OFF_HOURS', 1]
		]);
	});

	it('rejects malformed trades rather than producing misleading statistics', () => {
		expect(() =>
			analyzeBacktest([trade('future-exit', 1, 5, { exitTimestamp: baseTimestamp })])
		).toThrow(BacktestAnalyticsError);
	});
});
