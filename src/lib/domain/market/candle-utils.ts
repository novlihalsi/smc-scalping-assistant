import type { Candle } from './models.js';
import { getTimeframeDurationMilliseconds, isTimeframe } from './constants.js';

export type CandleValidationIssueCode =
	| 'INVALID_SYMBOL'
	| 'INVALID_TIMEFRAME'
	| 'INVALID_OPEN_TIMESTAMP'
	| 'INVALID_CLOSE_TIMESTAMP'
	| 'MISALIGNED_OPEN_TIMESTAMP'
	| 'INVALID_CANDLE_DURATION'
	| 'INVALID_PRICE'
	| 'INVALID_PRICE_RANGE'
	| 'INVALID_VOLUME'
	| 'INVALID_CLOSED_STATE';

export interface CandleValidationIssue {
	code: CandleValidationIssueCode;
	message: string;
}

export interface CandleValidationResult {
	valid: boolean;
	issues: CandleValidationIssue[];
}

export class CandleValidationError extends Error {
	readonly issues: CandleValidationIssue[];

	constructor(issues: CandleValidationIssue[]) {
		super(issues.map(({ message }) => message).join(' '));
		this.name = 'CandleValidationError';
		this.issues = issues;
	}
}

export function getCandleIdentity(
	candle: Pick<Candle, 'symbol' | 'timeframe' | 'openTimestamp'>
): string {
	return JSON.stringify([candle.symbol, candle.timeframe, candle.openTimestamp]);
}

export function validateCandle(candle: Candle): CandleValidationResult {
	const issues: CandleValidationIssue[] = [];
	const timeframe = isTimeframe(candle.timeframe) ? candle.timeframe : undefined;
	const validOpenTimestamp = isNonNegativeSafeInteger(candle.openTimestamp);
	const validCloseTimestamp = isNonNegativeSafeInteger(candle.closeTimestamp);

	if (typeof candle.symbol !== 'string' || candle.symbol.trim().length === 0) {
		issues.push({ code: 'INVALID_SYMBOL', message: 'Candle symbol must not be empty.' });
	}

	if (!timeframe) {
		issues.push({
			code: 'INVALID_TIMEFRAME',
			message: `Unsupported candle timeframe: ${String(candle.timeframe)}.`
		});
	}

	if (!validOpenTimestamp) {
		issues.push({
			code: 'INVALID_OPEN_TIMESTAMP',
			message: 'Candle openTimestamp must be a non-negative safe integer.'
		});
	}

	if (!validCloseTimestamp) {
		issues.push({
			code: 'INVALID_CLOSE_TIMESTAMP',
			message: 'Candle closeTimestamp must be a non-negative safe integer.'
		});
	}

	if (timeframe && validOpenTimestamp) {
		const duration = getTimeframeDurationMilliseconds(timeframe);

		if (candle.openTimestamp % duration !== 0) {
			issues.push({
				code: 'MISALIGNED_OPEN_TIMESTAMP',
				message: `Candle openTimestamp must align to its ${timeframe} UTC boundary.`
			});
		}

		if (validCloseTimestamp && candle.closeTimestamp !== candle.openTimestamp + duration - 1) {
			issues.push({
				code: 'INVALID_CANDLE_DURATION',
				message: `Candle timestamps must span exactly one ${timeframe} interval.`
			});
		}
	}

	const prices = [candle.open, candle.high, candle.low, candle.close];
	const validPrices = prices.every((price) => Number.isFinite(price) && price > 0);

	if (!validPrices) {
		issues.push({
			code: 'INVALID_PRICE',
			message: 'Candle OHLC prices must be finite positive numbers.'
		});
	} else if (
		candle.low > candle.high ||
		candle.open < candle.low ||
		candle.open > candle.high ||
		candle.close < candle.low ||
		candle.close > candle.high
	) {
		issues.push({
			code: 'INVALID_PRICE_RANGE',
			message: 'Candle high/low must contain its open and close prices.'
		});
	}

	if (!Number.isFinite(candle.volume) || candle.volume < 0) {
		issues.push({
			code: 'INVALID_VOLUME',
			message: 'Candle volume must be a finite non-negative number.'
		});
	}

	if (typeof candle.closed !== 'boolean') {
		issues.push({
			code: 'INVALID_CLOSED_STATE',
			message: 'Candle closed state must be boolean.'
		});
	}

	return { valid: issues.length === 0, issues };
}

export function assertValidCandle(candle: Candle): void {
	const result = validateCandle(candle);

	if (!result.valid) {
		throw new CandleValidationError(result.issues);
	}
}

export function sortCandlesChronologically(candles: Iterable<Candle>): Candle[] {
	return [...candles].sort(
		(left, right) =>
			left.openTimestamp - right.openTimestamp ||
			left.closeTimestamp - right.closeTimestamp ||
			left.symbol.localeCompare(right.symbol) ||
			left.timeframe.localeCompare(right.timeframe)
	);
}

export function mergeCandleBatches(...batches: ReadonlyArray<readonly Candle[]>): Candle[] {
	const candlesByIdentity = new Map<string, Candle>();

	for (const batch of batches) {
		for (const candle of batch) {
			assertValidCandle(candle);
			candlesByIdentity.set(getCandleIdentity(candle), { ...candle });
		}
	}

	return sortCandlesChronologically(candlesByIdentity.values());
}

function isNonNegativeSafeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}
