import { describe, expect, it } from 'vitest';

import type { Candle } from './models.js';
import { aggregateOneMinuteCandlesToFiveMinutes, CandleAggregationError } from './aggregation.js';

interface CandleValues {
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	closed?: boolean;
}

function minuteCandle(minute: number, values: CandleValues): Candle {
	const openTimestamp = minute * 60_000;

	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + 59_999,
		open: values.open,
		high: values.high,
		low: values.low,
		close: values.close,
		volume: values.volume,
		closed: values.closed ?? true
	};
}

function flatMinuteCandle(minute: number, closed = true): Candle {
	return minuteCandle(minute, {
		open: 100,
		high: 101,
		low: 99,
		close: 100,
		volume: 1,
		closed
	});
}

describe('1m to 5m candle aggregation', () => {
	it('produces correct OHLCV from a complete closed bucket', () => {
		const source = [
			minuteCandle(3, { open: 99, high: 100, low: 97, close: 98, volume: 4 }),
			minuteCandle(0, { open: 100, high: 102, low: 99, close: 101, volume: 1 }),
			minuteCandle(4, { open: 98, high: 103, low: 96, close: 102, volume: 5 }),
			minuteCandle(1, { open: 101, high: 104, low: 100, close: 103, volume: 2 }),
			minuteCandle(2, { open: 103, high: 105, low: 98, close: 99, volume: 3 })
		];

		const result = aggregateOneMinuteCandlesToFiveMinutes(source);

		expect(result.candles).toEqual([
			{
				symbol: 'BTCUSDT',
				timeframe: '5m',
				openTimestamp: 0,
				closeTimestamp: 299_999,
				open: 100,
				high: 105,
				low: 96,
				close: 102,
				volume: 15,
				closed: true
			}
		]);
		expect(result.incompleteBuckets).toEqual([]);
	});

	it('reports missing and unclosed buckets instead of emitting partial 5m candles', () => {
		const missingMinuteBucket = [0, 1, 3, 4].map((minute) => flatMinuteCandle(minute));
		const unclosedMinuteBucket = [5, 6, 7, 8, 9].map((minute) =>
			flatMinuteCandle(minute, minute !== 9)
		);

		const result = aggregateOneMinuteCandlesToFiveMinutes([
			...unclosedMinuteBucket,
			...missingMinuteBucket
		]);

		expect(result.candles).toEqual([]);
		expect(result.incompleteBuckets).toEqual([
			{
				symbol: 'BTCUSDT',
				openTimestamp: 0,
				presentOpenTimestamps: [0, 60_000, 180_000, 240_000],
				missingOpenTimestamps: [120_000],
				unclosedOpenTimestamps: []
			},
			{
				symbol: 'BTCUSDT',
				openTimestamp: 300_000,
				presentOpenTimestamps: [300_000, 360_000, 420_000, 480_000, 540_000],
				missingOpenTimestamps: [],
				unclosedOpenTimestamps: [540_000]
			}
		]);
	});

	it('deduplicates source candles and returns buckets chronologically', () => {
		const secondBucket = [5, 6, 7, 8, 9].map((minute) => flatMinuteCandle(minute));
		const firstBucket = [0, 1, 2, 3, 4].map((minute) => flatMinuteCandle(minute));
		const correctedMinute = minuteCandle(2, {
			open: 100,
			high: 110,
			low: 99,
			close: 100,
			volume: 1
		});

		const result = aggregateOneMinuteCandlesToFiveMinutes([
			...secondBucket,
			...firstBucket,
			correctedMinute
		]);

		expect(result.candles.map(({ openTimestamp }) => openTimestamp)).toEqual([0, 300_000]);
		expect(result.candles[0]?.high).toBe(110);
		expect(result.incompleteBuckets).toEqual([]);
	});

	it('rejects source candles that are not 1m', () => {
		const fiveMinuteCandle: Candle = {
			symbol: 'BTCUSDT',
			timeframe: '5m',
			openTimestamp: 0,
			closeTimestamp: 299_999,
			open: 100,
			high: 101,
			low: 99,
			close: 100,
			volume: 5,
			closed: true
		};

		expect(() => aggregateOneMinuteCandlesToFiveMinutes([fiveMinuteCandle])).toThrow(
			CandleAggregationError
		);
	});
});
