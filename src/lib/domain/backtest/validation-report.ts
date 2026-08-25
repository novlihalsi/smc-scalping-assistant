import type { BacktestAnalytics } from './analytics.js';
import type { BacktestExecutionConfig } from './engine.js';

export type ValidationVerdict = 'INSUFFICIENT_SAMPLE' | 'CANDIDATE' | 'NEEDS_REVIEW';
export type ValidationCheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'NOT_ASSESSED';

export interface ValidationCheck {
	key: string;
	label: string;
	status: ValidationCheckStatus;
	detail: string;
}

export interface BacktestValidationReport {
	verdict: ValidationVerdict;
	title: string;
	summary: string;
	checks: ValidationCheck[];
	feeBps: number;
	slippageBps: number;
}

const MINIMUM_USEFUL_SAMPLE = 500;
const PREFERRED_SAMPLE = 1_000;

export function generateBacktestValidationReport(
	analytics: BacktestAnalytics,
	executionConfig: BacktestExecutionConfig
): BacktestValidationReport {
	const { metrics, breakdowns } = analytics;
	const sampleCheck = sampleSizeCheck(metrics.totalTrades);
	const expectancyCheck: ValidationCheck = {
		key: 'EXPECTANCY',
		label: 'Expectancy',
		status: metrics.expectancyR > 0 ? 'PASS' : 'FAIL',
		detail: `${formatR(metrics.expectancyR)} average per closed trade.`
	};
	const profitFactorCheck = createProfitFactorCheck(metrics.profitFactor);
	const periodCheck: ValidationCheck = {
		key: 'PERIOD_ROBUSTNESS',
		label: 'Period robustness',
		status: breakdowns.dayUtc.length >= 2 ? 'WARN' : 'NOT_ASSESSED',
		detail:
			breakdowns.dayUtc.length >= 2
				? `${breakdowns.dayUtc.length} UTC days are represented; inspect consistency rather than the aggregate alone.`
				: 'Run multiple chronological periods before assessing robustness.'
	};
	const costCheck: ValidationCheck = {
		key: 'COSTS',
		label: 'Execution costs',
		status: executionConfig.feeBps > 0 || executionConfig.slippageBps > 0 ? 'PASS' : 'WARN',
		detail:
			executionConfig.feeBps > 0 || executionConfig.slippageBps > 0
				? `${formatBps(executionConfig.feeBps)} fee + ${formatBps(executionConfig.slippageBps)} adverse slippage modeled per side.`
				: 'Zero-cost baseline; rerun with realistic fees and slippage before drawing conclusions.'
	};
	const verdict = deriveVerdict(metrics.totalTrades, metrics.expectancyR, metrics.profitFactor);

	return {
		verdict,
		title:
			verdict === 'CANDIDATE'
				? 'Candidate for out-of-sample validation'
				: verdict === 'INSUFFICIENT_SAMPLE'
					? 'More observations required'
					: 'Research review required',
		summary:
			verdict === 'CANDIDATE'
				? 'The aggregate clears the minimum sample, expectancy, and profit-factor gates. This is not proof of a live edge; validate on an untouched chronological period.'
				: verdict === 'INSUFFICIENT_SAMPLE'
					? `The run has ${metrics.totalTrades} closed trades. Avoid strong conclusions before at least ${MINIMUM_USEFUL_SAMPLE}.`
					: 'The minimum sample is available, but aggregate expectancy or profit factor does not support promotion yet. Negative findings are valid research output.',
		checks: [
			sampleCheck,
			expectancyCheck,
			profitFactorCheck,
			{
				key: 'DRAWDOWN',
				label: 'Maximum drawdown',
				status: 'NOT_ASSESSED',
				detail: `${formatR(metrics.maxDrawdownR)} observed. No acceptance threshold is defined in the strategy specification.`
			},
			periodCheck,
			costCheck
		],
		feeBps: executionConfig.feeBps,
		slippageBps: executionConfig.slippageBps
	};
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
			label: 'Profit factor',
			status: 'WARN',
			detail:
				'Undefined because there are no losing R observations; inspect the sample for representativeness.'
		};
	}
	return {
		key: 'PROFIT_FACTOR',
		label: 'Profit factor',
		status: profitFactor > 1 ? 'PASS' : 'FAIL',
		detail: `${profitFactor.toFixed(2)} gross winning R per losing R.`
	};
}

function deriveVerdict(
	totalTrades: number,
	expectancyR: number,
	profitFactor: number | null
): ValidationVerdict {
	if (totalTrades < MINIMUM_USEFUL_SAMPLE) return 'INSUFFICIENT_SAMPLE';
	return expectancyR > 0 && profitFactor !== null && profitFactor > 1
		? 'CANDIDATE'
		: 'NEEDS_REVIEW';
}

function formatR(value: number): string {
	return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
}

function formatBps(value: number): string {
	return `${value.toFixed(2)} bps`;
}
