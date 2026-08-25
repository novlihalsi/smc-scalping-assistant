import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { RealtimeConnectionStatus, RealtimeMarketDataProvider } from '../../realtime/index.js';
import {
	BinanceRealtimeMarketDataProvider,
	type RealtimeTimerScheduler,
	type RealtimeWebSocketConnection
} from './realtime-market-data-provider.js';

class ManualScheduler implements RealtimeTimerScheduler {
	#time = 1_000_000;
	#nextId = 1;
	readonly #timers = new Map<number, { dueAt: number; callback: () => void }>();

	now(): number {
		return this.#time;
	}

	setTimeout(callback: () => void, delayMilliseconds: number): unknown {
		const id = this.#nextId++;
		this.#timers.set(id, { dueAt: this.#time + delayMilliseconds, callback });
		return id;
	}

	clearTimeout(handle: unknown): void {
		if (typeof handle === 'number') this.#timers.delete(handle);
	}

	advance(milliseconds: number): void {
		const target = this.#time + milliseconds;
		while (true) {
			const next = [...this.#timers.entries()]
				.filter(([, timer]) => timer.dueAt <= target)
				.sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
			if (!next) break;
			this.#time = next[1].dueAt;
			this.#timers.delete(next[0]);
			next[1].callback();
		}
		this.#time = target;
	}
}

class FakeWebSocket implements RealtimeWebSocketConnection {
	onOpen: (() => void) | null = null;
	onMessage: ((data: unknown) => void) | null = null;
	onError: (() => void) | null = null;
	onClose: (() => void) | null = null;
	readonly close = vi.fn<(code?: number, reason?: string) => void>();

	open(): void {
		this.onOpen?.();
	}

	message(data: unknown): void {
		this.onMessage?.(data);
	}

	disconnect(): void {
		this.onClose?.();
	}
}

function kline(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		e: 'kline',
		E: 60_000,
		s: 'BTCUSDT',
		k: {
			t: 0,
			T: 59_999,
			s: 'BTCUSDT',
			i: '1m',
			o: '100.00',
			c: '101.00',
			h: '102.00',
			l: '99.00',
			v: '10.50',
			x: false,
			...overrides
		}
	});
}

function fixture(options: { staleAfterMilliseconds?: number } = {}) {
	const scheduler = new ManualScheduler();
	const sockets: FakeWebSocket[] = [];
	const urls: string[] = [];
	const states: RealtimeConnectionStatus[] = [];
	const candles = vi.fn();
	const errors = vi.fn();
	const provider = new BinanceRealtimeMarketDataProvider({
		scheduler,
		staleAfterMilliseconds: options.staleAfterMilliseconds ?? 10_000,
		reconnectInitialDelayMilliseconds: 1_000,
		reconnectMaxDelayMilliseconds: 4_000,
		createWebSocket: (url) => {
			urls.push(url);
			const socket = new FakeWebSocket();
			sockets.push(socket);
			return socket;
		}
	});
	const unsubscribe = provider.subscribe(
		{ symbol: 'BTCUSDT', timeframe: '1m' },
		{ onCandle: candles, onConnectionState: (status) => states.push(status), onError: errors }
	);
	return { scheduler, sockets, urls, states, candles, errors, provider, unsubscribe };
}

describe('BinanceRealtimeMarketDataProvider', () => {
	it('opens the public market-data stream and normalizes open and finalized candle events', () => {
		const context = fixture();
		expectTypeOf(context.provider).toMatchTypeOf<RealtimeMarketDataProvider>();
		expect(context.urls).toEqual(['wss://data-stream.binance.vision/ws/btcusdt@kline_1m']);
		expect(context.states.map(({ state }) => state)).toEqual(['CONNECTING']);

		context.sockets[0]?.open();
		context.sockets[0]?.message(kline());
		context.sockets[0]?.message(kline({ x: true, c: '101.50', v: '12.25' }));

		expect(context.states.map(({ state }) => state)).toEqual(['CONNECTING', 'CONNECTED']);
		expect(context.candles).toHaveBeenNthCalledWith(1, {
			symbol: 'BTCUSDT',
			timeframe: '1m',
			openTimestamp: 0,
			closeTimestamp: 59_999,
			open: 100,
			high: 102,
			low: 99,
			close: 101,
			volume: 10.5,
			closed: false
		});
		expect(context.candles).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ close: 101.5, volume: 12.25, closed: true })
		);
		expect(context.errors).not.toHaveBeenCalled();
	});

	it('rejects malformed or mismatched messages without refreshing the stale watchdog', () => {
		const context = fixture({ staleAfterMilliseconds: 5_000 });
		context.sockets[0]?.open();
		context.scheduler.advance(4_000);
		context.sockets[0]?.message(kline({ s: 'ETHUSDT' }));
		context.scheduler.advance(1_000);

		expect(context.candles).not.toHaveBeenCalled();
		expect(context.errors).toHaveBeenCalledWith(
			expect.objectContaining({ code: 'INVALID_MESSAGE' })
		);
		expect(context.states.map(({ state }) => state)).toEqual([
			'CONNECTING',
			'CONNECTED',
			'STALE',
			'RECONNECTING'
		]);
		expect(context.sockets[0]?.close).toHaveBeenCalledWith(1000, 'reconnect');
	});

	it('reconnects unexpected closures through an isolated, bounded retry schedule', () => {
		const context = fixture();
		context.sockets[0]?.disconnect();

		expect(context.states.at(-1)).toMatchObject({
			state: 'RECONNECTING',
			reconnectAttempt: 1
		});
		context.scheduler.advance(999);
		expect(context.sockets).toHaveLength(1);
		context.scheduler.advance(1);
		expect(context.sockets).toHaveLength(2);
		expect(context.states.at(-1)).toMatchObject({ state: 'CONNECTING', reconnectAttempt: 1 });

		context.sockets[1]?.disconnect();
		context.scheduler.advance(1_999);
		expect(context.sockets).toHaveLength(2);
		context.scheduler.advance(1);
		expect(context.sockets).toHaveLength(3);
		expect(context.urls.every((url) => !url.includes('key') && !url.includes('token'))).toBe(true);
	});

	it('cleans up idempotently and cancels pending stale or reconnect work', () => {
		const context = fixture({ staleAfterMilliseconds: 5_000 });
		context.sockets[0]?.open();
		context.unsubscribe();
		context.unsubscribe();
		context.scheduler.advance(60_000);
		context.sockets[0]?.message(kline({ x: true }));

		expect(context.sockets).toHaveLength(1);
		expect(context.sockets[0]?.close).toHaveBeenCalledOnce();
		expect(context.sockets[0]?.close).toHaveBeenCalledWith(1000, 'unsubscribe');
		expect(context.states.map(({ state }) => state)).toEqual([
			'CONNECTING',
			'CONNECTED',
			'DISCONNECTED'
		]);
		expect(context.candles).not.toHaveBeenCalled();
	});
});
