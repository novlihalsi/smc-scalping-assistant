import { describe, expect, it } from 'vitest';

import type { Candle } from '../../domain/market/index.js';
import { CandleValidationError } from '../../domain/market/index.js';
import { InMemoryHistoricalCandleStore } from './candle-store.js';

function minuteCandle(
	minute: number,
	overrides: Partial<Pick<Candle, 'high' | 'close' | 'volume' | 'closed'>> = {}
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

describe('InMemoryHistoricalCandleStore', () => {
	it('merges duplicate batches and guarantees chronological retrieval', () => {
		const store = new InMemoryHistoricalCandleStore([minuteCandle(2), minuteCandle(0)]);

		const merged = store.mergeBatch([minuteCandle(1), minuteCandle(2, { high: 106, close: 105 })]);

		expect(store.size).toBe(3);
		expect(merged.map(({ openTimestamp }) => openTimestamp)).toEqual([0, 60_000, 120_000]);
		expect(merged[2]).toMatchObject({ high: 106, close: 105 });
	});

	it('supports explicit range and closed-only queries', () => {
		const store = new InMemoryHistoricalCandleStore([
			minuteCandle(0),
			minuteCandle(1, { closed: false }),
			minuteCandle(2)
		]);

		expect(
			store
				.getCandles({ startTimestamp: 60_000, endTimestamp: 120_000 })
				.map(({ openTimestamp }) => openTimestamp)
		).toEqual([60_000, 120_000]);
		expect(
			store.getCandles({ closedOnly: true }).map(({ openTimestamp }) => openTimestamp)
		).toEqual([0, 120_000]);
	});

	it('validates a whole batch before committing and isolates stored values', () => {
		const source = minuteCandle(0);
		const store = new InMemoryHistoricalCandleStore([source]);

		expect(() => store.mergeBatch([minuteCandle(1), minuteCandle(2, { volume: -1 })])).toThrow(
			CandleValidationError
		);
		expect(store.size).toBe(1);

		source.close = 99;
		const retrieved = store.getCandles();
		retrieved[0]!.close = 98;

		expect(store.getCandles()[0]?.close).toBe(101);
	});

	it('rejects inverted query ranges', () => {
		const store = new InMemoryHistoricalCandleStore();

		expect(() => store.getCandles({ startTimestamp: 1, endTimestamp: 0 })).toThrow(RangeError);
	});
});
