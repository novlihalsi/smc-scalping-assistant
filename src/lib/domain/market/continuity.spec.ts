import { describe, expect, it } from 'vitest';

import type { Candle } from './models.js';
import { CandleContinuityError, prepareContinuousOneMinuteCandles } from './continuity.js';

function minuteCandle(minute: number): Candle {
	const openTimestamp = minute * 60_000;
	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + 59_999,
		open: 100,
		high: 101,
		low: 99,
		close: 100,
		volume: 1,
		closed: true
	};
}

describe('canonical 1m continuity', () => {
	it('sorts a complete closed series without changing its candles', () => {
		const source = [minuteCandle(2), minuteCandle(0), minuteCandle(1)];

		const prepared = prepareContinuousOneMinuteCandles(source);

		expect(prepared.map(({ openTimestamp }) => openTimestamp)).toEqual([0, 60_000, 120_000]);
		expect(prepared).not.toBe(source);
		expect(prepared[0]).not.toBe(source[1]);
	});

	it('rejects a missing expected minute with an explicit DATA_GAP error', () => {
		const prepareGap = () => prepareContinuousOneMinuteCandles([minuteCandle(0), minuteCandle(2)]);

		expect(prepareGap).toThrowError(
			expect.objectContaining<Partial<CandleContinuityError>>({
				code: 'DATA_GAP'
			})
		);
		expect(prepareGap).toThrow('60000');
	});

	it('rejects duplicate source minutes instead of silently merging them', () => {
		expect(() =>
			prepareContinuousOneMinuteCandles([minuteCandle(0), minuteCandle(0)])
		).toThrowError(
			expect.objectContaining<Partial<CandleContinuityError>>({ code: 'DUPLICATE_CANDLE' })
		);
	});

	it('rejects a missing requested range boundary', () => {
		expect(() =>
			prepareContinuousOneMinuteCandles([minuteCandle(1), minuteCandle(2)], {
				startTimestamp: 0,
				endTimestamp: 120_000
			})
		).toThrowError(expect.objectContaining<Partial<CandleContinuityError>>({ code: 'DATA_GAP' }));
	});
});
