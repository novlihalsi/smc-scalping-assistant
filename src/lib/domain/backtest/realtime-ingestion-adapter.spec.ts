import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import {
	InMemoryRealtimeIngestionAdapter,
	RealtimeIngestionError
} from './realtime-ingestion-adapter.js';

function minuteCandle(minute: number, closed = true): Candle {
	const openTimestamp = minute * 60_000;
	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + 59_999,
		open: 100 + minute,
		high: 102 + minute,
		low: 99 + minute,
		close: 101 + minute,
		volume: closed ? 10 : 5,
		closed
	};
}

describe('in-memory realtime ingestion adapter', () => {
	it('models REST bootstrap, open updates, finalization, duplicates, and reversed arrival', () => {
		const adapter = new InMemoryRealtimeIngestionAdapter({
			symbol: 'BTCUSDT',
			expectedStartTimestamp: 0
		});
		const first = minuteCandle(0);
		const second = minuteCandle(1);
		const third = minuteCandle(2);

		expect(adapter.ingestRestBootstrap([second, first, { ...first }])).toEqual([first, second]);
		expect(adapter.ingestWebSocketUpdate(minuteCandle(2, false))).toEqual([]);
		expect(adapter.ingestWebSocketUpdate(minuteCandle(3, false))).toEqual([]);
		expect(adapter.ingestWebSocketUpdate(minuteCandle(3))).toEqual([]);
		expect(adapter.ingestWebSocketUpdate({ ...minuteCandle(3) })).toEqual([]);
		expect(adapter.ingestWebSocketUpdate(third)).toEqual([third, minuteCandle(3)]);
		expect(adapter.ingestWebSocketUpdate({ ...third })).toEqual([]);

		expect(adapter.complete()).toEqual([first, second, third, minuteCandle(3)]);
		expect(adapter.snapshot()).toMatchObject({
			phase: 'STREAMING',
			nextExpectedOpenTimestamp: 240_000,
			bufferedFinalCandles: [],
			openCandles: [],
			restDeliveries: 3,
			webSocketDeliveries: 6,
			openCandleUpdates: 2,
			duplicateFinalDeliveries: 2
		});
	});

	it('fails explicitly on a missing final candle or conflicting finalized duplicate', () => {
		const missing = new InMemoryRealtimeIngestionAdapter({ expectedStartTimestamp: 0 });
		missing.ingestRestBootstrap([]);
		missing.ingestWebSocketUpdate(minuteCandle(1));
		expect(() => missing.complete()).toThrowError(
			expect.objectContaining<Partial<RealtimeIngestionError>>({ code: 'DATA_GAP' })
		);

		const conflicting = new InMemoryRealtimeIngestionAdapter({ expectedStartTimestamp: 0 });
		conflicting.ingestRestBootstrap([minuteCandle(0)]);
		expect(() =>
			conflicting.ingestWebSocketUpdate({ ...minuteCandle(0), close: 100.5 })
		).toThrowError(
			expect.objectContaining<Partial<RealtimeIngestionError>>({
				code: 'CONFLICTING_FINAL_CANDLE'
			})
		);
	});

	it('never emits an open candle into the canonical finalized series', () => {
		const adapter = new InMemoryRealtimeIngestionAdapter({ expectedStartTimestamp: 0 });
		adapter.ingestRestBootstrap([]);
		adapter.ingestWebSocketUpdate(minuteCandle(0, false));

		expect(adapter.complete()).toEqual([]);
		expect(adapter.snapshot().openCandles).toEqual([minuteCandle(0, false)]);
	});
});
