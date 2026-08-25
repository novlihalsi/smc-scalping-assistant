import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import { detectConfirmedSwings } from './swing-engine.js';

const DEFAULT_CONFIG = { leftBars: 2, rightBars: 2 } as const;

function minuteCandle(minute: number, high: number, low: number, closed = true): Candle {
	const openTimestamp = minute * 60_000;
	const midpoint = (high + low) / 2;

	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + 59_999,
		open: midpoint,
		high,
		low,
		close: midpoint,
		volume: 1,
		closed
	};
}

function candles(highs: readonly number[], lows: readonly number[]): Candle[] {
	return highs.map((high, index) => minuteCandle(index, high, lows[index] ?? high - 1));
}

describe('confirmed swing detection', () => {
	it('confirms a strict swing high only after the configured right bars have closed', () => {
		const history = candles([103, 105, 110, 106, 104], [98, 97, 99, 96, 95]);

		expect(detectConfirmedSwings(history.slice(0, 4), DEFAULT_CONFIG)).toEqual([]);
		expect(detectConfirmedSwings(history, DEFAULT_CONFIG)).toEqual([
			{
				id: '["SWING","BTCUSDT","1m",120000,"HIGH"]',
				symbol: 'BTCUSDT',
				timeframe: '1m',
				sourceIndex: 2,
				sourceTimestamp: 120_000,
				confirmedTimestamp: 299_999,
				price: 110,
				type: 'HIGH',
				strength: 2
			}
		]);
	});

	it('confirms the mirrored strict swing low', () => {
		const history = candles([102, 103, 101, 104, 105], [97, 95, 90, 94, 96]);

		expect(detectConfirmedSwings(history, DEFAULT_CONFIG)).toEqual([
			expect.objectContaining({
				sourceIndex: 2,
				sourceTimestamp: 120_000,
				confirmedTimestamp: 299_999,
				price: 90,
				type: 'LOW',
				strength: 2
			})
		]);
	});

	it.each([
		{
			name: 'equal high on the left',
			highs: [103, 110, 110, 106, 104],
			lows: [98, 97, 99, 96, 95]
		},
		{
			name: 'equal high on the right',
			highs: [103, 105, 110, 110, 104],
			lows: [98, 97, 99, 96, 95]
		},
		{
			name: 'equal low on the left',
			highs: [102, 103, 101, 104, 105],
			lows: [97, 90, 90, 94, 96]
		},
		{
			name: 'equal low on the right',
			highs: [102, 103, 101, 104, 105],
			lows: [97, 95, 90, 90, 96]
		}
	])('rejects a candidate with $name', ({ highs, lows }) => {
		expect(detectConfirmedSwings(candles(highs, lows), DEFAULT_CONFIG)).toEqual([]);
	});

	it('returns no swing when there are insufficient candles', () => {
		const history = candles([103, 105, 110, 106], [98, 97, 99, 96]);

		expect(detectConfirmedSwings(history, DEFAULT_CONFIG)).toEqual([]);
	});

	it('supports configurable left and right bar counts', () => {
		const history = candles([103, 110, 106, 104], [98, 99, 96, 95]);

		expect(detectConfirmedSwings(history, { leftBars: 1, rightBars: 2 })).toEqual([
			expect.objectContaining({
				sourceIndex: 1,
				sourceTimestamp: 60_000,
				confirmedTimestamp: 239_999,
				type: 'HIGH',
				strength: 1
			})
		]);
	});

	it('does not confirm from an open candle in the comparison window', () => {
		const history = candles([103, 105, 110, 106, 104], [98, 97, 99, 96, 95]);
		history[4] = minuteCandle(4, 104, 95, false);

		expect(detectConfirmedSwings(history, DEFAULT_CONFIG)).toEqual([]);
	});

	it.each([
		{ leftBars: 0, rightBars: 2 },
		{ leftBars: 2, rightBars: 0 },
		{ leftBars: 1.5, rightBars: 2 }
	])('rejects invalid bar counts: $leftBars/$rightBars', (config) => {
		expect(() => detectConfirmedSwings([], config)).toThrow(RangeError);
	});
});
