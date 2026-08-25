import type { BacktestMetrics, BacktestTrade } from './models.js';

export interface EquityCurvePoint {
	tradeId: string;
	timestamp: number;
	rMultiple: number;
	cumulativeR: number;
	drawdownR: number;
}

export interface BacktestBreakdownBucket {
	key: string;
	label: string;
	metrics: BacktestMetrics;
}

export interface BacktestBreakdowns {
	direction: BacktestBreakdownBucket[];
	score: BacktestBreakdownBucket[];
	hourUtc: BacktestBreakdownBucket[];
	dayUtc: BacktestBreakdownBucket[];
	sessionUtc: BacktestBreakdownBucket[];
}

export interface BacktestAnalytics {
	metrics: BacktestMetrics;
	equityCurve: EquityCurvePoint[];
	breakdowns: BacktestBreakdowns;
}

export class BacktestAnalyticsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BacktestAnalyticsError';
	}
}

interface NamedBucket {
	key: string;
	label: string;
}

const SCORE_BUCKETS = [
	{ key: 'NO_TRADE', label: '0–59 · No trade', min: 0, max: 59 },
	{ key: 'WEAK', label: '60–74 · Weak', min: 60, max: 74 },
	{ key: 'VALID', label: '75–84 · Valid', min: 75, max: 84 },
	{ key: 'STRONG', label: '85–100 · Strong', min: 85, max: 100 }
] as const;

const SESSION_BUCKETS = [
	{ key: 'ASIA', label: 'Asia · 00:00–07:59 UTC', startHour: 0, endHour: 7 },
	{ key: 'LONDON', label: 'London · 08:00–12:59 UTC', startHour: 8, endHour: 12 },
	{ key: 'NEW_YORK', label: 'New York · 13:00–20:59 UTC', startHour: 13, endHour: 20 },
	{ key: 'OFF_HOURS', label: 'Off-hours · 21:00–23:59 UTC', startHour: 21, endHour: 23 }
] as const;

export function analyzeBacktest(trades: readonly BacktestTrade[]): BacktestAnalytics {
	const chronologicalTrades = prepareTrades(trades);
	return {
		metrics: calculateBacktestMetrics(chronologicalTrades),
		equityCurve: buildEquityCurve(chronologicalTrades),
		breakdowns: buildBreakdowns(chronologicalTrades)
	};
}

export function calculateBacktestMetrics(trades: readonly BacktestTrade[]): BacktestMetrics {
	const chronologicalTrades = prepareTrades(trades);
	if (chronologicalTrades.length === 0) return emptyMetrics();

	const wins = chronologicalTrades.filter(({ rMultiple }) => rMultiple > 0);
	const losses = chronologicalTrades.filter(({ rMultiple }) => rMultiple <= 0);
	const grossProfitR = sum(wins.map(({ rMultiple }) => rMultiple));
	const grossLossR = Math.abs(sum(losses.map(({ rMultiple }) => rMultiple)));
	const totalR = grossProfitR - grossLossR;
	const equityCurve = buildEquityCurve(chronologicalTrades);
	const riskRewards = chronologicalTrades.map(plannedRiskReward);
	const durations = chronologicalTrades.map(
		({ entryTimestamp, exitTimestamp }) => exitTimestamp - entryTimestamp
	);
	const streaks = calculateStreaks(chronologicalTrades);

	return {
		totalTrades: chronologicalTrades.length,
		wins: wins.length,
		losses: losses.length,
		winRate: (wins.length / chronologicalTrades.length) * 100,
		profitFactor: losses.length === 0 ? null : grossLossR === 0 ? null : grossProfitR / grossLossR,
		expectancyR: totalR / chronologicalTrades.length,
		averageR: totalR / chronologicalTrades.length,
		totalR,
		maxDrawdownR: Math.max(0, ...equityCurve.map(({ drawdownR }) => drawdownR)),
		maxConsecutiveWins: streaks.wins,
		maxConsecutiveLosses: streaks.losses,
		averageRiskReward: sum(riskRewards) / riskRewards.length,
		averageTradeDurationMs: sum(durations) / durations.length
	};
}

export function buildEquityCurve(trades: readonly BacktestTrade[]): EquityCurvePoint[] {
	const chronologicalTrades = prepareTrades(trades);
	let cumulativeR = 0;
	let peakR = 0;

	return chronologicalTrades.map((trade) => {
		cumulativeR += trade.rMultiple;
		peakR = Math.max(peakR, cumulativeR);
		return {
			tradeId: trade.id,
			timestamp: trade.exitTimestamp,
			rMultiple: trade.rMultiple,
			cumulativeR,
			drawdownR: peakR - cumulativeR
		};
	});
}

export function buildBreakdowns(trades: readonly BacktestTrade[]): BacktestBreakdowns {
	const chronologicalTrades = prepareTrades(trades);
	const activeHours = [
		...new Set(
			chronologicalTrades.map(({ entryTimestamp }) => new Date(entryTimestamp).getUTCHours())
		)
	].sort((left, right) => left - right);
	const activeDays = [
		...new Set(chronologicalTrades.map(({ entryTimestamp }) => toUtcDate(entryTimestamp)))
	].sort();

	return {
		direction: [
			bucket(
				{ key: 'LONG', label: 'Long' },
				chronologicalTrades,
				({ direction }) => direction === 'LONG'
			),
			bucket(
				{ key: 'SHORT', label: 'Short' },
				chronologicalTrades,
				({ direction }) => direction === 'SHORT'
			)
		],
		score: SCORE_BUCKETS.map(({ key, label, min, max }) =>
			bucket(
				{ key, label },
				chronologicalTrades,
				({ setupScore }) => setupScore >= min && setupScore <= max
			)
		),
		hourUtc: activeHours.map((hour) =>
			bucket(
				{ key: String(hour), label: `${String(hour).padStart(2, '0')}:00 UTC` },
				chronologicalTrades,
				({ entryTimestamp }) => new Date(entryTimestamp).getUTCHours() === hour
			)
		),
		dayUtc: activeDays.map((day) =>
			bucket(
				{ key: day, label: day },
				chronologicalTrades,
				({ entryTimestamp }) => toUtcDate(entryTimestamp) === day
			)
		),
		sessionUtc: SESSION_BUCKETS.map(({ key, label, startHour, endHour }) =>
			bucket({ key, label }, chronologicalTrades, ({ entryTimestamp }) => {
				const hour = new Date(entryTimestamp).getUTCHours();
				return hour >= startHour && hour <= endHour;
			})
		)
	};
}

function prepareTrades(trades: readonly BacktestTrade[]): BacktestTrade[] {
	for (const trade of trades) validateTrade(trade);
	return [...trades].sort(
		(left, right) =>
			left.exitTimestamp - right.exitTimestamp ||
			left.entryTimestamp - right.entryTimestamp ||
			left.id.localeCompare(right.id)
	);
}

function validateTrade(trade: BacktestTrade): void {
	const finiteNumbers = [
		trade.entry,
		trade.stopLoss,
		trade.takeProfit,
		trade.exitPrice,
		trade.rMultiple,
		trade.entryTimestamp,
		trade.exitTimestamp,
		trade.setupScore,
		trade.feesPaid,
		trade.slippagePaid
	].every(Number.isFinite);
	const timestampsValid =
		Number.isSafeInteger(trade.entryTimestamp) &&
		trade.entryTimestamp >= 0 &&
		Number.isSafeInteger(trade.exitTimestamp) &&
		trade.exitTimestamp >= trade.entryTimestamp;
	const geometryValid =
		trade.direction === 'LONG'
			? trade.stopLoss < trade.entry && trade.takeProfit > trade.entry
			: trade.stopLoss > trade.entry && trade.takeProfit < trade.entry;

	if (
		!trade.id ||
		!finiteNumbers ||
		!timestampsValid ||
		!geometryValid ||
		trade.setupScore < 0 ||
		trade.setupScore > 100 ||
		trade.feesPaid < 0 ||
		trade.slippagePaid < 0
	) {
		throw new BacktestAnalyticsError(`Trade ${trade.id} is invalid and cannot be analyzed.`);
	}
}

function plannedRiskReward(trade: BacktestTrade): number {
	const risk = Math.abs(trade.entry - trade.stopLoss);
	const reward = Math.abs(trade.takeProfit - trade.entry);
	if (risk <= 0 || reward <= 0) {
		throw new BacktestAnalyticsError(`Trade ${trade.id} has invalid risk/reward geometry.`);
	}
	return reward / risk;
}

function calculateStreaks(trades: readonly BacktestTrade[]): { wins: number; losses: number } {
	let currentWins = 0;
	let currentLosses = 0;
	let maxWins = 0;
	let maxLosses = 0;

	for (const trade of trades) {
		if (trade.rMultiple > 0) {
			currentWins += 1;
			currentLosses = 0;
			maxWins = Math.max(maxWins, currentWins);
		} else {
			currentLosses += 1;
			currentWins = 0;
			maxLosses = Math.max(maxLosses, currentLosses);
		}
	}
	return { wins: maxWins, losses: maxLosses };
}

function bucket(
	named: NamedBucket,
	trades: readonly BacktestTrade[],
	predicate: (trade: BacktestTrade) => boolean
): BacktestBreakdownBucket {
	return {
		...named,
		metrics: calculateBacktestMetrics(trades.filter(predicate))
	};
}

function emptyMetrics(): BacktestMetrics {
	return {
		totalTrades: 0,
		wins: 0,
		losses: 0,
		winRate: 0,
		profitFactor: null,
		expectancyR: 0,
		averageR: 0,
		totalR: 0,
		maxDrawdownR: 0,
		maxConsecutiveWins: 0,
		maxConsecutiveLosses: 0,
		averageRiskReward: 0,
		averageTradeDurationMs: 0
	};
}

function toUtcDate(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}
