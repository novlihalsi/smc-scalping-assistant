import type { Candle } from '../market/index.js';
import type { SwingPoint } from './models.js';

export interface SwingDetectionConfig {
	leftBars: number;
	rightBars: number;
}

/**
 * Detects the swing point(s) that become confirmed by the latest supplied candle.
 * Callers must provide a chronological prefix of one symbol and timeframe. Returning
 * an array allows an outside candle to be both a strict swing high and swing low.
 */
export function detectConfirmedSwings(
	candles: readonly Candle[],
	config: SwingDetectionConfig
): SwingPoint[] {
	validateConfig(config);

	const requiredCandleCount = config.leftBars + config.rightBars + 1;

	if (candles.length < requiredCandleCount) {
		return [];
	}

	const confirmationIndex = candles.length - 1;
	const sourceIndex = confirmationIndex - config.rightBars;
	const windowStartIndex = sourceIndex - config.leftBars;
	const window = candles.slice(windowStartIndex, confirmationIndex + 1);
	const sourceCandle = candles[sourceIndex];
	const confirmationCandle = candles[confirmationIndex];

	if (!sourceCandle || !confirmationCandle) {
		return [];
	}

	if (window.some((candle) => !candle.closed)) {
		return [];
	}

	const comparisonCandles = window.filter((_, index) => index !== config.leftBars);
	const strength = Math.min(config.leftBars, config.rightBars);
	const swings: SwingPoint[] = [];

	if (comparisonCandles.every((candle) => sourceCandle.high > candle.high)) {
		swings.push(createSwingPoint(sourceCandle, confirmationCandle, sourceIndex, 'HIGH', strength));
	}

	if (comparisonCandles.every((candle) => sourceCandle.low < candle.low)) {
		swings.push(createSwingPoint(sourceCandle, confirmationCandle, sourceIndex, 'LOW', strength));
	}

	return swings;
}

function createSwingPoint(
	sourceCandle: Candle,
	confirmationCandle: Candle,
	sourceIndex: number,
	type: SwingPoint['type'],
	strength: number
): SwingPoint {
	return {
		id: JSON.stringify([
			'SWING',
			sourceCandle.symbol,
			sourceCandle.timeframe,
			sourceCandle.openTimestamp,
			type
		]),
		symbol: sourceCandle.symbol,
		timeframe: sourceCandle.timeframe,
		sourceIndex,
		sourceTimestamp: sourceCandle.openTimestamp,
		confirmedTimestamp: confirmationCandle.closeTimestamp,
		price: type === 'HIGH' ? sourceCandle.high : sourceCandle.low,
		type,
		strength
	};
}

function validateConfig(config: SwingDetectionConfig): void {
	if (!Number.isSafeInteger(config.leftBars) || config.leftBars < 1) {
		throw new RangeError('Swing leftBars must be a positive safe integer.');
	}

	if (!Number.isSafeInteger(config.rightBars) || config.rightBars < 1) {
		throw new RangeError('Swing rightBars must be a positive safe integer.');
	}
}
