import { describe, expect, it } from 'vitest';

import type { Candle } from './models.js';
import {
	CandleValidationError,
	getCandleIdentity,
	mergeCandleBatches,
	validateCandle
} from './candle-utils.js';

function minuteCandle(
	minute: number,
	overrides: Partial<
		Pick<Candle, 'symbol' | 'open' | 'high' | 'low' | 'close' | 'volume' | 'closed'>
	> = {}
): Candle {
	const openTimestamp = minute * 60_000;

	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + 59_999,
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		volume: 1,
		closed: true,
		...overrides
	};
}

describe('candle utilities', () => {
	it('builds identity from symbol, timeframe, and open timestamp', () => {
		expect(getCandleIdentity(minuteCandle(0))).toBe('["BTCUSDT","1m",0]');
		expect(getCandleIdentity(minuteCandle(1))).not.toBe(getCandleIdentity(minuteCandle(0)));
	});

	it('reports timestamp, price-range, and volume validation issues', () => {
		const candle = {
			...minuteCandle(0),
			openTimestamp: 1,
			closeTimestamp: 60_000,
			high: 100,
			close: 101,
			volume: -1
		};

		const result = validateCandle(candle);

		expect(result.valid).toBe(false);
		expect(result.issues.map(({ code }) => code)).toEqual([
			'MISALIGNED_OPEN_TIMESTAMP',
			'INVALID_PRICE_RANGE',
			'INVALID_VOLUME'
		]);
	});

	it('merges batches atomically by identity with latest values and chronological ordering', () => {
		const firstVersion = minuteCandle(2);
		const latestVersion = minuteCandle(2, { high: 106, close: 105 });

		const merged = mergeCandleBatches(
			[firstVersion, minuteCandle(0)],
			[minuteCandle(1), latestVersion]
		);

		expect(merged.map(({ openTimestamp }) => openTimestamp)).toEqual([0, 60_000, 120_000]);
		expect(merged[2]).toMatchObject({ high: 106, close: 105 });
		expect(() => mergeCandleBatches([minuteCandle(3, { volume: -1 })])).toThrow(
			CandleValidationError
		);
	});
});
