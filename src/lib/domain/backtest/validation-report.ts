import { getTimeframeDurationMilliseconds } from '../market/constants.js';
import type { SMCStrategyConfig } from '../strategy/index.js';
import {
	analyzeBacktest,
	type BacktestAnalytics,
	type BacktestBreakdownBucket
} from './analytics.js';
import type { BacktestExecutionConfig } from './engine.js';
import type { BacktestInput, BacktestMetrics, BacktestTrade } from './models.js';

export type ValidationVerdict = 'INSUFFICIENT_SAMPLE' | 'CANDIDATE' | 'NEEDS_REVIEW';
export type ValidationCheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'NOT_ASSESSED';

export interface ValidationCheck {
	key: string;
	label: string;
	status: ValidationCheckStatus;
	detail: string;
}

export interface ValidationSegment {
	key: 'IN_SAMPLE' | 'OUT_OF_SAMPLE';
	label: string;
	startTimestamp: number;
	endTimestampExclusive: number;
	metrics: BacktestMetrics;
}

export interface ValidationChronologicalSplit {
	method: 'CHRONOLOGICAL_TIME_70_30';
	splitTimestamp: number;
	inSamplePercent: 70;
	outOfSamplePercent: 30;
	segments: readonly [ValidationSegment, ValidationSegment];
}

export interface ValidationMonthlyPeriod {
	key: string;
	label: string;
	startTimestamp: number;
	endTimestampExclusive: number;
	metrics: BacktestMetrics;
}

export interface ValidationRobustness {
	months: ValidationMonthlyPeriod[];
	direction: BacktestBreakdownBucket[];
	score: BacktestBreakdownBucket[];
	hourUtc: BacktestBreakdownBucket[];
	sessionUtc: BacktestBreakdownBucket[];
}

export interface ValidationCostRun {
	key: 'ZERO_COST' | 'BASELINE' | 'STRESS_2X';
	label: string;
	executionConfig: BacktestExecutionConfig;
	analytics: BacktestAnalytics;
}

export interface ValidationCostScenario {
	key: ValidationCostRun['key'];
	label: string;
	feeBps: number;
	slippageBps: number;
	metrics: BacktestMetrics;
	expectancyDeltaR: number;
	totalRDelta: number;
}

export interface ValidationOutlierConcentration {
	topPercent: 5;
	topTradeCount: number;
	grossProfitR: number;
	topProfitR: number;
	shareOfGrossProfitPercent: number | null;
	largestTradeR: number | null;
}

export interface ValidationProvenance {
	schemaVersion: 'validation-v1';
	strategy: 'SMC_SCALPING_V1';
	symbol: string;
	startTimestamp: number;
	endTimestamp: number;
	configHash: string;
	strategyConfig: SMCStrategyConfig;
	executionConfig: BacktestExecutionConfig;
}

export interface BacktestValidationInput {
	input: BacktestInput;
	trades: readonly BacktestTrade[];
	analytics: BacktestAnalytics;
	executionConfig: BacktestExecutionConfig;
	costRuns: readonly ValidationCostRun[];
}

export interface BacktestValidationReport {
	verdict: ValidationVerdict;
	title: string;
	summary: string;
	checks: ValidationCheck[];
	chronologicalSplit: ValidationChronologicalSplit;
	robustness: ValidationRobustness;
	costSensitivity: ValidationCostScenario[];
	outlierConcentration: ValidationOutlierConcentration;
	provenance: ValidationProvenance;
}

const MINIMUM_USEFUL_SAMPLE = 500;
const PREFERRED_SAMPLE = 1_000;
const IN_SAMPLE_PERCENT = 70;
const OUTLIER_TOP_PERCENT = 5;

export function generateBacktestValidationReport(
	input: BacktestValidationInput
): BacktestValidationReport {
	validateCostRuns(input.costRuns);
	const chronologicalSplit = createChronologicalSplit(input.input, input.trades);
	const outOfSample = chronologicalSplit.segments[1];
	const robustness = createRobustness(input.trades, input.analytics);
	const costSensitivity = createCostSensitivity(input.costRuns);
	const outlierConcentration = calculateOutlierConcentration(input.trades);
	const provenance = createValidationProvenance(input.input, input.executionConfig);
	const checks = createChecks(
		input.analytics,
		chronologicalSplit,
		robustness,
		costSensitivity,
		outlierConcentration,
		provenance
	);
	const verdict = deriveVerdict(input.analytics.metrics.totalTrades, outOfSample.metrics);

	return {
		verdict,
		title:
			verdict === 'CANDIDATE'
				? 'Candidate after chronological OOS validation'
				: verdict === 'INSUFFICIENT_SAMPLE'
					? 'More observations required'
					: 'Research review required',
		summary:
			verdict === 'CANDIDATE'
				? 'The minimum sample and designated 30% chronological holdout have positive expectancy and profit factor above one. This is evidence for continued research, not proof of a live edge.'
				: verdict === 'INSUFFICIENT_SAMPLE'
					? `The run has ${input.analytics.metrics.totalTrades} closed trades. Avoid strong conclusions before at least ${MINIMUM_USEFUL_SAMPLE}.`
					: 'The sample is large enough for review, but the chronological holdout does not support promotion. Negative findings remain valid research output.',
		checks,
		chronologicalSplit,
		robustness,
		costSensitivity,
		outlierConcentration,
		provenance
	};
}

export function createValidationConfigHash(
	strategyConfig: SMCStrategyConfig,
	executionConfig: BacktestExecutionConfig
): string {
	const serialized = stableSerialize({ executionConfig, strategyConfig });
	let hash = 0x811c9dc5;
	for (let index = 0; index < serialized.length; index += 1) {
		hash ^= serialized.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function createChronologicalSplit(
	input: BacktestInput,
	trades: readonly BacktestTrade[]
): ValidationChronologicalSplit {
	const timeframeDuration = getTimeframeDurationMilliseconds(input.config.entryTimeframe);
	const totalBars = Math.floor((input.endDate - input.startDate) / timeframeDuration) + 1;
	const inSampleBars = Math.floor(totalBars * (IN_SAMPLE_PERCENT / 100));
	const splitTimestamp = input.startDate + inSampleBars * timeframeDuration;
	const endTimestampExclusive = input.endDate + timeframeDuration;
	const inSampleTrades = trades.filter(({ entryTimestamp }) => entryTimestamp < splitTimestamp);
	const outOfSampleTrades = trades.filter(({ entryTimestamp }) => entryTimestamp >= splitTimestamp);

	return {
		method: 'CHRONOLOGICAL_TIME_70_30',
		splitTimestamp,
		inSamplePercent: 70,
		outOfSamplePercent: 30,
		segments: [
			{
				key: 'IN_SAMPLE',
				label: 'In-sample · first 70%',
				startTimestamp: input.startDate,
				endTimestampExclusive: splitTimestamp,
				metrics: analyzeBacktest(inSampleTrades).metrics
			},
			{
				key: 'OUT_OF_SAMPLE',
				label: 'Out-of-sample · final 30%',
				startTimestamp: splitTimestamp,
				endTimestampExclusive,
				metrics: analyzeBacktest(outOfSampleTrades).metrics
			}
		]
	};
}

function createRobustness(
	trades: readonly BacktestTrade[],
	analytics: BacktestAnalytics
): ValidationRobustness {
	const monthKeys = [
		...new Set(
			trades.map(({ entryTimestamp }) => new Date(entryTimestamp).toISOString().slice(0, 7))
		)
	].sort();

	return {
		months: monthKeys.map((key) => {
			const startTimestamp = Date.parse(`${key}-01T00:00:00.000Z`);
			const start = new Date(startTimestamp);
			const endTimestampExclusive = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
			return {
				key,
				label: start.toLocaleDateString('en-US', {
					timeZone: 'UTC',
					month: 'short',
					year: 'numeric'
				}),
				startTimestamp,
				endTimestampExclusive,
				metrics: analyzeBacktest(
					trades.filter(
						({ entryTimestamp }) =>
							entryTimestamp >= startTimestamp && entryTimestamp < endTimestampExclusive
					)
				).metrics
			};
		}),
		direction: cloneBreakdowns(analytics.breakdowns.direction),
		score: cloneBreakdowns(analytics.breakdowns.score),
		hourUtc: cloneBreakdowns(analytics.breakdowns.hourUtc),
		sessionUtc: cloneBreakdowns(analytics.breakdowns.sessionUtc)
	};
}

function createCostSensitivity(costRuns: readonly ValidationCostRun[]): ValidationCostScenario[] {
	const baseline = costRuns.find(({ key }) => key === 'BASELINE');
	if (!baseline) throw new TypeError('Cost sensitivity requires a BASELINE run.');
	return costRuns.map(({ key, label, executionConfig, analytics }) => ({
		key,
		label,
		feeBps: executionConfig.feeBps,
		slippageBps: executionConfig.slippageBps,
		metrics: { ...analytics.metrics },
		expectancyDeltaR: analytics.metrics.expectancyR - baseline.analytics.metrics.expectancyR,
		totalRDelta: analytics.metrics.totalR - baseline.analytics.metrics.totalR
	}));
}

function calculateOutlierConcentration(
	trades: readonly BacktestTrade[]
): ValidationOutlierConcentration {
	const winners = trades
		.filter(({ rMultiple }) => rMultiple > 0)
		.sort((left, right) => right.rMultiple - left.rMultiple || left.id.localeCompare(right.id));
	const grossProfitR = winners.reduce((total, { rMultiple }) => total + rMultiple, 0);
	const topTradeCount = trades.length === 0 ? 0 : Math.max(1, Math.ceil(trades.length * 0.05));
	const topProfitR = winners
		.slice(0, topTradeCount)
		.reduce((total, { rMultiple }) => total + rMultiple, 0);

	return {
		topPercent: OUTLIER_TOP_PERCENT,
		topTradeCount,
		grossProfitR,
		topProfitR,
		shareOfGrossProfitPercent: grossProfitR > 0 ? (topProfitR / grossProfitR) * 100 : null,
		largestTradeR: winners[0]?.rMultiple ?? null
	};
}

function createValidationProvenance(
	input: BacktestInput,
	executionConfig: BacktestExecutionConfig
): ValidationProvenance {
	return {
		schemaVersion: 'validation-v1',
		strategy: 'SMC_SCALPING_V1',
		symbol: input.symbol,
		startTimestamp: input.startDate,
		endTimestamp: input.endDate,
		configHash: createValidationConfigHash(input.config, executionConfig),
		strategyConfig: { ...input.config },
		executionConfig: { ...executionConfig }
	};
}

function createChecks(
	analytics: BacktestAnalytics,
	split: ValidationChronologicalSplit,
	robustness: ValidationRobustness,
	costSensitivity: readonly ValidationCostScenario[],
	outliers: ValidationOutlierConcentration,
	provenance: ValidationProvenance
): ValidationCheck[] {
	const { metrics } = analytics;
	const outOfSample = split.segments[1].metrics;
	const stress = costSensitivity.find(({ key }) => key === 'STRESS_2X');
	const activeDirections = robustness.direction.filter(({ metrics }) => metrics.totalTrades > 0);
	const activeScores = robustness.score.filter(({ metrics }) => metrics.totalTrades > 0);
	const positiveMonths = robustness.months.filter(({ metrics }) => metrics.expectancyR > 0).length;

	return [
		sampleSizeCheck(metrics.totalTrades),
		{
			key: 'OOS_EVIDENCE',
			label: 'Chronological OOS evidence',
			status:
				outOfSample.totalTrades === 0
					? 'NOT_ASSESSED'
					: outOfSample.expectancyR > 0 &&
						  outOfSample.profitFactor !== null &&
						  outOfSample.profitFactor > 1
						? 'PASS'
						: 'FAIL',
			detail:
				outOfSample.totalTrades === 0
					? 'The final 30% chronological holdout contains no closed trades.'
					: `${outOfSample.totalTrades} OOS trades, ${formatR(outOfSample.expectancyR)} expectancy, ${formatProfitFactor(outOfSample.profitFactor)} profit factor.`
		},
		{
			key: 'EXPECTANCY',
			label: 'Aggregate expectancy',
			status: metrics.expectancyR > 0 ? 'PASS' : 'FAIL',
			detail: `${formatR(metrics.expectancyR)} average per closed trade.`
		},
		createProfitFactorCheck(metrics.profitFactor),
		{
			key: 'DRAWDOWN',
			label: 'Maximum drawdown',
			status: 'NOT_ASSESSED',
			detail: `${formatR(metrics.maxDrawdownR)} observed. No acceptance threshold is defined in the strategy specification.`
		},
		{
			key: 'MONTH_ROBUSTNESS',
			label: 'Monthly robustness',
			status: robustness.months.length >= 2 ? 'WARN' : 'NOT_ASSESSED',
			detail:
				robustness.months.length >= 2
					? `${positiveMonths} of ${robustness.months.length} represented UTC months have positive expectancy; inspect dispersion.`
					: 'At least two represented UTC months are required for period comparison.'
		},
		{
			key: 'DIRECTION_COVERAGE',
			label: 'LONG / SHORT coverage',
			status: activeDirections.length === 2 ? 'PASS' : 'WARN',
			detail: `${activeDirections.length} of 2 directions contain closed trades.`
		},
		{
			key: 'SCORE_COVERAGE',
			label: 'Quality-score coverage',
			status: activeScores.length >= 2 ? 'PASS' : 'WARN',
			detail: `${activeScores.length} of ${robustness.score.length} quality bands contain closed trades.`
		},
		{
			key: 'TIME_OF_DAY',
			label: 'Time-of-day analysis',
			status: robustness.hourUtc.length >= 2 ? 'PASS' : 'WARN',
			detail: `${robustness.hourUtc.length} UTC entry hours and ${robustness.sessionUtc.filter(({ metrics }) => metrics.totalTrades > 0).length} sessions are represented.`
		},
		{
			key: 'COST_SENSITIVITY',
			label: 'Fee / slippage sensitivity',
			status:
				!stress || stress.metrics.totalTrades === 0
					? 'NOT_ASSESSED'
					: stress.metrics.expectancyR > 0
						? 'PASS'
						: 'FAIL',
			detail: stress
				? `Stress ${formatBps(stress.feeBps)} fee + ${formatBps(stress.slippageBps)} slippage per side yields ${formatR(stress.metrics.expectancyR)} expectancy.`
				: 'A stress-cost replay is required.'
		},
		{
			key: 'OUTLIER_CONCENTRATION',
			label: 'Outlier concentration',
			status:
				metrics.totalTrades < 20 || outliers.shareOfGrossProfitPercent === null
					? 'NOT_ASSESSED'
					: outliers.shareOfGrossProfitPercent > 50
						? 'WARN'
						: 'PASS',
			detail:
				outliers.shareOfGrossProfitPercent === null
					? 'No winning R is available for concentration analysis.'
					: `Top ${outliers.topPercent}% (${outliers.topTradeCount} trades) contribute ${outliers.shareOfGrossProfitPercent.toFixed(1)}% of gross winning R.`
		},
		{
			key: 'PROVENANCE',
			label: 'Experiment provenance',
			status: 'PASS',
			detail: `${provenance.schemaVersion} · ${provenance.configHash} · ${provenance.symbol}.`
		}
	];
}

function sampleSizeCheck(totalTrades: number): ValidationCheck {
	if (totalTrades >= PREFERRED_SAMPLE) {
		return {
			key: 'SAMPLE_SIZE',
			label: 'Sample size',
			status: 'PASS',
			detail: `${totalTrades} trades meets the preferred ${PREFERRED_SAMPLE}+ guidance.`
		};
	}
	if (totalTrades >= MINIMUM_USEFUL_SAMPLE) {
		return {
			key: 'SAMPLE_SIZE',
			label: 'Sample size',
			status: 'WARN',
			detail: `${totalTrades} trades clears the minimum; ${PREFERRED_SAMPLE}+ is preferred.`
		};
	}
	return {
		key: 'SAMPLE_SIZE',
		label: 'Sample size',
		status: 'FAIL',
		detail: `${totalTrades} trades is below the minimum useful sample of ${MINIMUM_USEFUL_SAMPLE}.`
	};
}

function createProfitFactorCheck(profitFactor: number | null): ValidationCheck {
	if (profitFactor === null) {
		return {
			key: 'PROFIT_FACTOR',
			label: 'Aggregate profit factor',
			status: 'WARN',
			detail:
				'Undefined because there are no losing R observations; inspect the sample for representativeness.'
		};
	}
	return {
		key: 'PROFIT_FACTOR',
		label: 'Aggregate profit factor',
		status: profitFactor > 1 ? 'PASS' : 'FAIL',
		detail: `${profitFactor.toFixed(2)} gross winning R per losing R.`
	};
}

function deriveVerdict(totalTrades: number, outOfSample: BacktestMetrics): ValidationVerdict {
	if (totalTrades < MINIMUM_USEFUL_SAMPLE) return 'INSUFFICIENT_SAMPLE';
	return outOfSample.totalTrades > 0 &&
		outOfSample.expectancyR > 0 &&
		outOfSample.profitFactor !== null &&
		outOfSample.profitFactor > 1
		? 'CANDIDATE'
		: 'NEEDS_REVIEW';
}

function validateCostRuns(costRuns: readonly ValidationCostRun[]): void {
	const keys = costRuns.map(({ key }) => key);
	if (
		costRuns.length !== 3 ||
		!keys.includes('ZERO_COST') ||
		!keys.includes('BASELINE') ||
		!keys.includes('STRESS_2X')
	) {
		throw new TypeError('Validation requires ZERO_COST, BASELINE, and STRESS_2X cost runs.');
	}
}

function cloneBreakdowns(buckets: readonly BacktestBreakdownBucket[]): BacktestBreakdownBucket[] {
	return buckets.map((bucket) => ({ ...bucket, metrics: { ...bucket.metrics } }));
}

function stableSerialize(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

function formatR(value: number): string {
	return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
}

function formatBps(value: number): string {
	return `${value.toFixed(2)} bps`;
}

function formatProfitFactor(value: number | null): string {
	return value === null ? 'undefined' : value.toFixed(2);
}
