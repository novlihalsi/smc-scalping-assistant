import { assertValidCandle, type Candle, type Timeframe } from '../market/index.js';

export interface AtrConfig {
	period: number;
}

export interface AtrState {
	symbol: string | null;
	timeframe: Timeframe | null;
	period: number;
	previousClose: number | null;
	seedTrueRanges: readonly number[];
	atr: number | null;
	processedCandles: number;
	lastProcessedTimestamp: number | null;
}

export interface AtrValue {
	timestamp: number;
	trueRange: number;
	atr: number | null;
}

export interface AtrProcessingResult {
	state: AtrState;
	value: AtrValue | null;
}

export class AtrError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AtrError';
	}
}

export function createAtrState(config: AtrConfig): AtrState {
	validateConfig(config);

	return {
		symbol: null,
		timeframe: null,
		period: config.period,
		previousClose: null,
		seedTrueRanges: [],
		atr: null,
		processedCandles: 0,
		lastProcessedTimestamp: null
	};
}

export function calculateTrueRange(
	candle: Pick<Candle, 'high' | 'low'>,
	previousClose: number | null
): number {
	if (
		!Number.isFinite(candle.high) ||
		!Number.isFinite(candle.low) ||
		candle.high <= 0 ||
		candle.low <= 0 ||
		candle.high < candle.low
	) {
		throw new AtrError('True Range requires finite positive high/low values with high >= low.');
	}

	if (previousClose === null) {
		return candle.high - candle.low;
	}

	if (!Number.isFinite(previousClose) || previousClose <= 0) {
		throw new AtrError('Previous close must be null or a finite positive number.');
	}

	return Math.max(
		candle.high - candle.low,
		Math.abs(candle.high - previousClose),
		Math.abs(candle.low - previousClose)
	);
}

/**
 * Processes one closed candle using Wilder smoothing. The seed ATR is the simple
 * average of the first `period` True Ranges; earlier values expose `atr: null`.
 */
export function processAtrCandle(state: AtrState, candle: Candle): AtrProcessingResult {
	if (!candle.closed) {
		return { state, value: null };
	}

	assertValidCandle(candle);
	assertCompatibleCandle(state, candle);

	const trueRange = calculateTrueRange(candle, state.previousClose);
	let seedTrueRanges = state.seedTrueRanges;
	let atr: number | null;

	if (state.atr === null) {
		seedTrueRanges = [...state.seedTrueRanges, trueRange];
		atr =
			seedTrueRanges.length === state.period
				? seedTrueRanges.reduce((total, value) => total + value, 0) / state.period
				: null;
	} else {
		atr = (state.atr * (state.period - 1) + trueRange) / state.period;
	}

	return {
		state: {
			symbol: state.symbol ?? candle.symbol,
			timeframe: state.timeframe ?? candle.timeframe,
			period: state.period,
			previousClose: candle.close,
			seedTrueRanges,
			atr,
			processedCandles: state.processedCandles + 1,
			lastProcessedTimestamp: candle.closeTimestamp
		},
		value: {
			timestamp: candle.closeTimestamp,
			trueRange,
			atr
		}
	};
}

function validateConfig(config: AtrConfig): void {
	if (!Number.isSafeInteger(config.period) || config.period < 1) {
		throw new RangeError('ATR period must be a positive safe integer.');
	}
}

function assertCompatibleCandle(state: AtrState, candle: Candle): void {
	if (state.symbol !== null && state.symbol !== candle.symbol) {
		throw new AtrError(`Cannot process ${candle.symbol} candle in ${state.symbol} ATR state.`);
	}

	if (state.timeframe !== null && state.timeframe !== candle.timeframe) {
		throw new AtrError(
			`Cannot process ${candle.timeframe} candle in ${state.timeframe} ATR state.`
		);
	}

	if (
		state.lastProcessedTimestamp !== null &&
		candle.closeTimestamp <= state.lastProcessedTimestamp
	) {
		throw new AtrError('Closed candles must be processed once in chronological order.');
	}
}
