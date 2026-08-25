import { fail } from '@sveltejs/kit';

import { DEFAULT_SMC_STRATEGY_CONFIG, type SMCStrategyConfig } from '$lib/domain/index.js';
import { BinanceHistoricalMarketDataProvider } from '$lib/services/exchange/index.js';
import { runHistoricalBacktest } from '$lib/services/backtest/index.js';

import type { Actions, PageServerLoad } from './$types.js';

const DAY_MILLISECONDS = 86_400_000;
const ONE_MINUTE_MILLISECONDS = 60_000;
const MAX_RANGE_DAYS = 31;

interface BacktestFormValues {
	startDate: string;
	endDate: string;
	swingLeftBars: number;
	swingRightBars: number;
	liquidityTolerancePercent: number;
	atrPeriod: number;
	displacementATRMultiplier: number;
	minimumScore: number;
	minimumRiskReward: number;
	stopLossATRBuffer: number;
	feeBps: number;
	slippageBps: number;
}

export const load: PageServerLoad = () => ({ defaults: defaultFormValues(Date.now()) });

export const actions: Actions = {
	default: async ({ request, fetch }) => {
		const formData = await request.formData();
		let values: BacktestFormValues;
		try {
			values = parseFormValues(formData);
			validateFormValues(values, Date.now());
		} catch (error) {
			return fail(400, {
				success: false as const,
				error: error instanceof Error ? error.message : 'Invalid backtest configuration.',
				values: rawFormValues(formData)
			});
		}

		const startTimestamp = parseUtcDate(values.startDate);
		const endTimestamp = parseUtcDate(values.endDate) + DAY_MILLISECONDS - ONE_MINUTE_MILLISECONDS;
		const config: SMCStrategyConfig = {
			biasTimeframe: '5m',
			entryTimeframe: '1m',
			swingLeftBars: values.swingLeftBars,
			swingRightBars: values.swingRightBars,
			liquidityTolerancePercent: values.liquidityTolerancePercent,
			atrPeriod: values.atrPeriod,
			displacementATRMultiplier: values.displacementATRMultiplier,
			minimumScore: values.minimumScore,
			minimumRiskReward: values.minimumRiskReward,
			stopLossATRBuffer: values.stopLossATRBuffer
		};

		try {
			const provider = new BinanceHistoricalMarketDataProvider({ fetch });
			const report = await runHistoricalBacktest(provider, {
				symbol: 'BTCUSDT',
				startTimestamp,
				endTimestamp,
				config,
				executionConfig: { feeBps: values.feeBps, slippageBps: values.slippageBps }
			});
			return { success: true as const, values, report };
		} catch (error) {
			return fail(502, {
				success: false as const,
				error:
					error instanceof Error
						? `Backtest could not be completed: ${error.message}`
						: 'Backtest could not be completed.',
				values
			});
		}
	}
};

function parseFormValues(formData: FormData): BacktestFormValues {
	return {
		startDate: requiredText(formData, 'startDate'),
		endDate: requiredText(formData, 'endDate'),
		swingLeftBars: requiredNumber(formData, 'swingLeftBars'),
		swingRightBars: requiredNumber(formData, 'swingRightBars'),
		liquidityTolerancePercent: requiredNumber(formData, 'liquidityTolerancePercent'),
		atrPeriod: requiredNumber(formData, 'atrPeriod'),
		displacementATRMultiplier: requiredNumber(formData, 'displacementATRMultiplier'),
		minimumScore: requiredNumber(formData, 'minimumScore'),
		minimumRiskReward: requiredNumber(formData, 'minimumRiskReward'),
		stopLossATRBuffer: requiredNumber(formData, 'stopLossATRBuffer'),
		feeBps: requiredNumber(formData, 'feeBps'),
		slippageBps: requiredNumber(formData, 'slippageBps')
	};
}

function validateFormValues(values: BacktestFormValues, now: number): void {
	const startTimestamp = parseUtcDate(values.startDate);
	const endDateTimestamp = parseUtcDate(values.endDate);
	const todayUtc = startOfUtcDay(now);
	if (startTimestamp > endDateTimestamp)
		throw new RangeError('Start date must not exceed end date.');
	if (endDateTimestamp >= todayUtc) throw new RangeError('End date must be a completed UTC day.');
	const inclusiveDays = (endDateTimestamp - startTimestamp) / DAY_MILLISECONDS + 1;
	if (inclusiveDays > MAX_RANGE_DAYS) {
		throw new RangeError(`Date range is limited to ${MAX_RANGE_DAYS} days per run.`);
	}
	assertIntegerRange(values.swingLeftBars, 1, 10, 'Swing left bars');
	assertIntegerRange(values.swingRightBars, 1, 10, 'Swing right bars');
	assertNumberRange(values.liquidityTolerancePercent, 0, 5, 'Liquidity tolerance');
	assertIntegerRange(values.atrPeriod, 1, 200, 'ATR period');
	assertNumberRange(values.displacementATRMultiplier, 0.01, 10, 'Displacement multiplier');
	assertIntegerRange(values.minimumScore, 0, 100, 'Minimum score');
	assertNumberRange(values.minimumRiskReward, 0.01, 20, 'Minimum risk/reward');
	assertNumberRange(values.stopLossATRBuffer, 0, 5, 'Stop-loss ATR buffer');
	assertNumberRange(values.feeBps, 0, 9_999.99, 'Fee');
	assertNumberRange(values.slippageBps, 0, 9_999.99, 'Slippage');
}

function defaultFormValues(now: number): BacktestFormValues {
	const yesterday = startOfUtcDay(now) - DAY_MILLISECONDS;
	const start = yesterday - 6 * DAY_MILLISECONDS;
	return {
		startDate: formatUtcDate(start),
		endDate: formatUtcDate(yesterday),
		swingLeftBars: DEFAULT_SMC_STRATEGY_CONFIG.swingLeftBars,
		swingRightBars: DEFAULT_SMC_STRATEGY_CONFIG.swingRightBars,
		liquidityTolerancePercent: DEFAULT_SMC_STRATEGY_CONFIG.liquidityTolerancePercent,
		atrPeriod: DEFAULT_SMC_STRATEGY_CONFIG.atrPeriod,
		displacementATRMultiplier: DEFAULT_SMC_STRATEGY_CONFIG.displacementATRMultiplier,
		minimumScore: DEFAULT_SMC_STRATEGY_CONFIG.minimumScore,
		minimumRiskReward: DEFAULT_SMC_STRATEGY_CONFIG.minimumRiskReward,
		stopLossATRBuffer: DEFAULT_SMC_STRATEGY_CONFIG.stopLossATRBuffer,
		feeBps: 0,
		slippageBps: 0
	};
}

function rawFormValues(formData: FormData): Record<string, string> {
	return Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)]));
}

function requiredText(formData: FormData, key: string): string {
	const value = formData.get(key);
	if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${key} is required.`);
	return value;
}

function requiredNumber(formData: FormData, key: string): number {
	const value = Number(requiredText(formData, key));
	if (!Number.isFinite(value)) throw new TypeError(`${key} must be a finite number.`);
	return value;
}

function parseUtcDate(value: string): number {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Dates must use YYYY-MM-DD.');
	const timestamp = Date.parse(`${value}T00:00:00.000Z`);
	if (!Number.isSafeInteger(timestamp) || formatUtcDate(timestamp) !== value) {
		throw new TypeError(`Invalid UTC date: ${value}.`);
	}
	return timestamp;
}

function startOfUtcDay(timestamp: number): number {
	const date = new Date(timestamp);
	return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatUtcDate(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function assertIntegerRange(value: number, min: number, max: number, label: string): void {
	if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be an integer.`);
	assertNumberRange(value, min, max, label);
}

function assertNumberRange(value: number, min: number, max: number, label: string): void {
	if (!Number.isFinite(value) || value < min || value > max) {
		throw new RangeError(`${label} must be between ${min} and ${max}.`);
	}
}
