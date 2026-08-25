import { describe, expect, it } from 'vitest';

import {
	CANONICAL_CANDLES_PER_BIAS_CANDLE,
	CANONICAL_STRATEGY_TIMEFRAME,
	DERIVED_BIAS_TIMEFRAME,
	getTimeframeDurationMilliseconds,
	isTimeframe,
	MILLISECONDS_PER_DAY,
	TIMEFRAME_DURATION_MILLISECONDS
} from './constants.js';

describe('shared market constants', () => {
	it('defines every supported timeframe and duration from one map', () => {
		expect(TIMEFRAME_DURATION_MILLISECONDS).toEqual({
			'1m': 60_000,
			'5m': 300_000,
			'15m': 900_000,
			'1h': 3_600_000
		});
		expect(Object.keys(TIMEFRAME_DURATION_MILLISECONDS).every(isTimeframe)).toBe(true);
		expect(isTimeframe('4h')).toBe(false);
		expect(getTimeframeDurationMilliseconds('15m')).toBe(900_000);
	});

	it('derives canonical strategy timing without a second duration table', () => {
		expect(CANONICAL_STRATEGY_TIMEFRAME).toBe('1m');
		expect(DERIVED_BIAS_TIMEFRAME).toBe('5m');
		expect(CANONICAL_CANDLES_PER_BIAS_CANDLE).toBe(5);
		expect(MILLISECONDS_PER_DAY).toBe(86_400_000);
	});
});
