import type { Candle } from './models.js';
import {
	assertValidCandle,
	getCandleIdentity,
	sortCandlesChronologically
} from './candle-utils.js';
import { CANONICAL_STRATEGY_TIMEFRAME, TIMEFRAME_DURATION_MILLISECONDS } from './constants.js';

export type CandleContinuityErrorCode = 'INVALID_SERIES' | 'DUPLICATE_CANDLE' | 'DATA_GAP';

export class CandleContinuityError extends Error {
	constructor(
		public readonly code: CandleContinuityErrorCode,
		message: string
	) {
		super(message);
		this.name = 'CandleContinuityError';
	}
}

export interface OneMinuteContinuityRange {
	startTimestamp: number;
	endTimestamp: number;
}

/**
 * Validates and chronologically normalizes one closed 1m series before replay.
 * Duplicate or missing timestamps fail instead of being merged or skipped.
 */
export function prepareContinuousOneMinuteCandles(
	candles: readonly Candle[],
	range?: OneMinuteContinuityRange
): Candle[] {
	assertValidRange(range);
	const seen = new Set<string>();
	let symbol: string | null = null;
	const prepared: Candle[] = [];

	for (const candle of candles) {
		assertValidCandle(candle);
		if (candle.timeframe !== CANONICAL_STRATEGY_TIMEFRAME || !candle.closed) {
			throw new CandleContinuityError(
				'INVALID_SERIES',
				'Historical continuity requires only closed 1m candles.'
			);
		}
		if (symbol !== null && candle.symbol !== symbol) {
			throw new CandleContinuityError(
				'INVALID_SERIES',
				'Historical continuity cannot mix candle symbols.'
			);
		}

		symbol = candle.symbol;
		const identity = getCandleIdentity(candle);
		if (seen.has(identity)) {
			throw new CandleContinuityError(
				'DUPLICATE_CANDLE',
				`Duplicate canonical 1m candle at ${candle.openTimestamp}.`
			);
		}
		seen.add(identity);
		prepared.push({ ...candle });
	}

	const chronological = sortCandlesChronologically(prepared);
	if (range) {
		assertRangeBoundary(chronological[0], range.startTimestamp, 'first');
		assertRangeBoundary(chronological.at(-1), range.endTimestamp, 'last');
	}
	for (let index = 1; index < chronological.length; index += 1) {
		const previous = chronological[index - 1];
		const current = chronological[index];
		if (!previous || !current) continue;

		const expectedOpenTimestamp =
			previous.openTimestamp + TIMEFRAME_DURATION_MILLISECONDS[CANONICAL_STRATEGY_TIMEFRAME];
		if (current.openTimestamp !== expectedOpenTimestamp) {
			throw new CandleContinuityError(
				'DATA_GAP',
				`Missing canonical 1m candle at ${expectedOpenTimestamp}; next candle opens at ${current.openTimestamp}.`
			);
		}
	}

	return chronological;
}

function assertValidRange(range: OneMinuteContinuityRange | undefined): void {
	if (!range) return;
	if (
		!Number.isSafeInteger(range.startTimestamp) ||
		!Number.isSafeInteger(range.endTimestamp) ||
		range.startTimestamp < 0 ||
		range.endTimestamp < range.startTimestamp ||
		range.startTimestamp % TIMEFRAME_DURATION_MILLISECONDS[CANONICAL_STRATEGY_TIMEFRAME] !== 0 ||
		range.endTimestamp % TIMEFRAME_DURATION_MILLISECONDS[CANONICAL_STRATEGY_TIMEFRAME] !== 0
	) {
		throw new CandleContinuityError(
			'INVALID_SERIES',
			'Expected 1m continuity range must use aligned non-negative timestamps.'
		);
	}
}

function assertRangeBoundary(
	candle: Candle | undefined,
	expectedOpenTimestamp: number,
	boundary: 'first' | 'last'
): void {
	if (candle?.openTimestamp === expectedOpenTimestamp) return;
	throw new CandleContinuityError(
		'DATA_GAP',
		`Missing expected ${boundary} canonical 1m candle at ${expectedOpenTimestamp}.`
	);
}
