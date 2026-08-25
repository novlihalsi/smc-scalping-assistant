import { describe, expect, it } from 'vitest';

import type { Candle } from '../../domain/market/index.js';
import type {
	HistoricalCandlesRequest,
	HistoricalMarketDataProvider
} from '../historical/index.js';
import {
	bootstrapRealtimeCandleState,
	RealtimeCandleState,
	RealtimeCandleStateError
} from './candle-state.js';

interface CandleValues {
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	closed?: boolean;
}

function minuteCandle(
	minute: number,
	values: Partial<CandleValues> = {},
	closed = values.closed ?? true
): Candle {
	const openTimestamp = minute * 60_000;
	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + 59_999,
		open: values.open ?? 100 + minute,
		high: values.high ?? 102 + minute,
		low: values.low ?? 99 + minute,
		close: values.close ?? 101 + minute,
		volume: values.volume ?? minute + 1,
		closed
	};
}

function deferred<T>(): {
	promise: Promise<T>;
	resolve(value: T): void;
} {
	let resolvePromise: ((value: T) => void) | undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return {
		promise,
		resolve: (value) => {
			if (!resolvePromise) throw new Error('Deferred promise is not initialized.');
			resolvePromise(value);
		}
	};
}

class DeferredHistoricalProvider implements HistoricalMarketDataProvider {
	readonly request = deferred<Candle[]>();
	requests: HistoricalCandlesRequest[] = [];

	async getCandles(request: HistoricalCandlesRequest): Promise<Candle[]> {
		this.requests.push(request);
		return this.request.promise;
	}
}

describe('RealtimeCandleState', () => {
	it('buffers WebSocket updates during REST bootstrap and merges the transition without duplicates', async () => {
		const provider = new DeferredHistoricalProvider();
		const state = new RealtimeCandleState();
		const bootstrap = bootstrapRealtimeCandleState(state, provider, {
			symbol: 'BTCUSDT',
			timeframe: '1m',
			startTimestamp: 0,
			endTimestamp: 240_000
		});
		const rest = [0, 1, 2, 3, 4].map((minute) => minuteCandle(minute));
		const current = minuteCandle(
			5,
			{ open: 105, high: 108, low: 104, close: 107, volume: 6 },
			false
		);

		state.ingestWebSocketUpdate({ ...rest[4]! });
		state.ingestWebSocketUpdate(current);
		expect(state.snapshot()).toMatchObject({
			phase: 'AWAITING_BOOTSTRAP',
			bufferedWebSocketUpdates: 2,
			closedOneMinuteCandles: []
		});

		provider.request.resolve([...rest].reverse());
		const result = await bootstrap;

		expect(provider.requests).toEqual([
			{
				symbol: 'BTCUSDT',
				timeframe: '1m',
				startTimestamp: 0,
				endTimestamp: 240_000
			}
		]);
		expect(result.finalizedOneMinuteCandles).toEqual(rest);
		expect(result.finalizedFiveMinuteCandles).toEqual([
			{
				symbol: 'BTCUSDT',
				timeframe: '5m',
				openTimestamp: 0,
				closeTimestamp: 299_999,
				open: 100,
				high: 106,
				low: 99,
				close: 105,
				volume: 15,
				closed: true
			}
		]);
		expect(result.snapshot).toMatchObject({
			phase: 'STREAMING',
			nextExpectedOneMinuteOpenTimestamp: 300_000,
			currentOneMinuteCandle: current,
			bufferedWebSocketUpdates: 0,
			restDeliveries: 5,
			webSocketDeliveries: 2,
			duplicateCandleDeliveries: 1
		});
		expect(result.snapshot.closedOneMinuteCandles).toEqual(rest);
		expect(result.snapshot.currentFiveMinuteCandle).toEqual({
			symbol: 'BTCUSDT',
			timeframe: '5m',
			openTimestamp: 300_000,
			closeTimestamp: 599_999,
			open: 105,
			high: 108,
			low: 104,
			close: 107,
			volume: 6,
			closed: false
		});
	});

	it('updates current 1m/5m snapshots but closes a 5m candle only after the fifth final minute', () => {
		const state = new RealtimeCandleState();
		const bootstrap = [
			minuteCandle(0, { open: 100, high: 102, low: 99, close: 101, volume: 1 }),
			minuteCandle(1, { open: 101, high: 104, low: 100, close: 103, volume: 2 }),
			minuteCandle(2, { open: 103, high: 105, low: 98, close: 99, volume: 3 }),
			minuteCandle(3, { open: 99, high: 100, low: 97, close: 98, volume: 4 })
		];
		state.ingestRestBootstrap(bootstrap, { startTimestamp: 0, endTimestamp: 180_000 });
		const firstOpen = minuteCandle(
			4,
			{ open: 98, high: 101, low: 97, close: 100, volume: 2 },
			false
		);
		const updatedOpen = minuteCandle(
			4,
			{ open: 98, high: 103, low: 96, close: 102, volume: 5 },
			false
		);

		state.ingestWebSocketUpdate(firstOpen);
		const openResult = state.ingestWebSocketUpdate(updatedOpen);

		expect(openResult.finalizedOneMinuteCandles).toEqual([]);
		expect(openResult.finalizedFiveMinuteCandles).toEqual([]);
		expect(openResult.snapshot.currentOneMinuteCandle).toEqual(updatedOpen);
		expect(openResult.snapshot.currentFiveMinuteCandle).toMatchObject({
			open: 100,
			high: 105,
			low: 96,
			close: 102,
			volume: 15,
			closed: false
		});
		expect(openResult.snapshot.closedFiveMinuteCandles).toEqual([]);

		const finalized = { ...updatedOpen, closed: true };
		const closeResult = state.ingestWebSocketUpdate(finalized);
		expect(closeResult.finalizedOneMinuteCandles).toEqual([finalized]);
		expect(closeResult.finalizedFiveMinuteCandles).toEqual([
			expect.objectContaining({
				timeframe: '5m',
				openTimestamp: 0,
				high: 105,
				low: 96,
				close: 102,
				volume: 15,
				closed: true
			})
		]);
		expect(closeResult.snapshot.currentOneMinuteCandle).toBeNull();
		expect(closeResult.snapshot.currentFiveMinuteCandle).toBeNull();

		const duplicate = state.ingestWebSocketUpdate({ ...finalized });
		expect(duplicate.finalizedOneMinuteCandles).toEqual([]);
		expect(duplicate.finalizedFiveMinuteCandles).toEqual([]);
		expect(duplicate.snapshot.closedOneMinuteCandles).toHaveLength(5);
		expect(duplicate.snapshot.closedFiveMinuteCandles).toHaveLength(1);
		expect(duplicate.snapshot.duplicateCandleDeliveries).toBe(1);
	});

	it('buffers out-of-order final candles and releases them once in chronological order', () => {
		const state = new RealtimeCandleState();
		state.ingestRestBootstrap([minuteCandle(0)], { startTimestamp: 0, endTimestamp: 0 });

		const thirdFirst = state.ingestWebSocketUpdate(minuteCandle(2));
		expect(thirdFirst.finalizedOneMinuteCandles).toEqual([]);
		expect(thirdFirst.snapshot.bufferedFinalOneMinuteCandles).toEqual([minuteCandle(2)]);
		expect(thirdFirst.snapshot.closedOneMinuteCandles).toEqual([minuteCandle(0)]);

		const gapFilled = state.ingestWebSocketUpdate(minuteCandle(1));
		expect(gapFilled.finalizedOneMinuteCandles).toEqual([minuteCandle(1), minuteCandle(2)]);
		expect(gapFilled.snapshot.closedOneMinuteCandles).toEqual([
			minuteCandle(0),
			minuteCandle(1),
			minuteCandle(2)
		]);
		expect(gapFilled.snapshot.bufferedFinalOneMinuteCandles).toEqual([]);
		expect(gapFilled.snapshot.nextExpectedOneMinuteOpenTimestamp).toBe(180_000);
	});

	it('rejects incomplete REST ranges and conflicting finalized duplicates', () => {
		const missing = new RealtimeCandleState();
		expect(() =>
			missing.ingestRestBootstrap([minuteCandle(0), minuteCandle(2)], {
				startTimestamp: 0,
				endTimestamp: 120_000
			})
		).toThrowError(
			expect.objectContaining<Partial<RealtimeCandleStateError>>({ code: 'DATA_GAP' })
		);

		const conflicting = new RealtimeCandleState();
		conflicting.ingestRestBootstrap([minuteCandle(0)], { startTimestamp: 0, endTimestamp: 0 });
		expect(() =>
			conflicting.ingestWebSocketUpdate({ ...minuteCandle(0), high: 110, close: 109 })
		).toThrowError(
			expect.objectContaining<Partial<RealtimeCandleStateError>>({
				code: 'CONFLICTING_FINAL_CANDLE'
			})
		);
	});
});
