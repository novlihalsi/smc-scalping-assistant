import { assertValidCandle, type Candle } from '../market/index.js';

export interface DisplacementConfig {
	atrMultiplier: number;
}

export interface DisplacementEvent {
	id: string;
	symbol: string;
	timeframe: Candle['timeframe'];
	timestamp: number;
	direction: 'BULLISH' | 'BEARISH';
	bodySize: number;
	atr: number;
	threshold: number;
}

export class DisplacementError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DisplacementError';
	}
}

/** Detects displacement from one closed candle and the ATR known at that close. */
export function detectDisplacement(
	candle: Candle,
	atr: number | null,
	config: DisplacementConfig
): DisplacementEvent | null {
	validateConfig(config);

	if (!candle.closed || atr === null) {
		return null;
	}

	assertValidCandle(candle);

	if (!Number.isFinite(atr) || atr <= 0) {
		throw new DisplacementError('ATR must be a finite positive number when available.');
	}

	const bodySize = Math.abs(candle.close - candle.open);
	const threshold = atr * config.atrMultiplier;

	if (bodySize <= threshold || candle.close === candle.open) {
		return null;
	}

	const direction = candle.close > candle.open ? 'BULLISH' : 'BEARISH';

	return {
		id: JSON.stringify([
			'DISPLACEMENT',
			candle.symbol,
			candle.timeframe,
			candle.closeTimestamp,
			direction
		]),
		symbol: candle.symbol,
		timeframe: candle.timeframe,
		timestamp: candle.closeTimestamp,
		direction,
		bodySize,
		atr,
		threshold
	};
}

function validateConfig(config: DisplacementConfig): void {
	if (!Number.isFinite(config.atrMultiplier) || config.atrMultiplier <= 0) {
		throw new RangeError('Displacement ATR multiplier must be a finite positive number.');
	}
}
