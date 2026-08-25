import {
	assertValidCandle,
	CANONICAL_STRATEGY_TIMEFRAME,
	PRIMARY_MARKET_SYMBOL,
	type Candle
} from '../../../domain/market/index.js';
import type {
	RealtimeCandlesRequest,
	RealtimeConnectionState,
	RealtimeMarketDataListener,
	RealtimeMarketDataProvider,
	Unsubscribe
} from '../../realtime/index.js';

const DEFAULT_BASE_URL = 'wss://data-stream.binance.vision/ws';
const DEFAULT_STALE_AFTER_MILLISECONDS = 10_000;
const DEFAULT_RECONNECT_INITIAL_DELAY_MILLISECONDS = 1_000;
const DEFAULT_RECONNECT_MAX_DELAY_MILLISECONDS = 30_000;
const DEFAULT_RECONNECT_MULTIPLIER = 2;

export type BinanceRealtimeMarketDataErrorCode =
	'INVALID_REQUEST' | 'INVALID_MESSAGE' | 'CONNECTION_FAILED' | 'SOCKET_ERROR';

export class BinanceRealtimeMarketDataError extends Error {
	constructor(
		public readonly code: BinanceRealtimeMarketDataErrorCode,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = 'BinanceRealtimeMarketDataError';
	}
}

export interface RealtimeWebSocketConnection {
	onOpen: (() => void) | null;
	onMessage: ((data: unknown) => void) | null;
	onError: (() => void) | null;
	onClose: (() => void) | null;
	close(code?: number, reason?: string): void;
}

export type RealtimeWebSocketFactory = (url: string) => RealtimeWebSocketConnection;

export interface RealtimeTimerScheduler {
	now(): number;
	setTimeout(callback: () => void, delayMilliseconds: number): unknown;
	clearTimeout(handle: unknown): void;
}

export interface BinanceRealtimeMarketDataProviderOptions {
	baseUrl?: string;
	createWebSocket?: RealtimeWebSocketFactory;
	scheduler?: RealtimeTimerScheduler;
	staleAfterMilliseconds?: number;
	reconnectInitialDelayMilliseconds?: number;
	reconnectMaxDelayMilliseconds?: number;
	reconnectMultiplier?: number;
}

export class BinanceRealtimeMarketDataProvider implements RealtimeMarketDataProvider {
	readonly #baseUrl: string;
	readonly #createWebSocket: RealtimeWebSocketFactory;
	readonly #scheduler: RealtimeTimerScheduler;
	readonly #staleAfterMilliseconds: number;
	readonly #reconnectInitialDelayMilliseconds: number;
	readonly #reconnectMaxDelayMilliseconds: number;
	readonly #reconnectMultiplier: number;

	constructor(options: BinanceRealtimeMarketDataProviderOptions = {}) {
		this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
		this.#createWebSocket = options.createWebSocket ?? createBrowserWebSocket;
		this.#scheduler = options.scheduler ?? browserTimerScheduler;
		this.#staleAfterMilliseconds =
			options.staleAfterMilliseconds ?? DEFAULT_STALE_AFTER_MILLISECONDS;
		this.#reconnectInitialDelayMilliseconds =
			options.reconnectInitialDelayMilliseconds ?? DEFAULT_RECONNECT_INITIAL_DELAY_MILLISECONDS;
		this.#reconnectMaxDelayMilliseconds =
			options.reconnectMaxDelayMilliseconds ?? DEFAULT_RECONNECT_MAX_DELAY_MILLISECONDS;
		this.#reconnectMultiplier = options.reconnectMultiplier ?? DEFAULT_RECONNECT_MULTIPLIER;

		assertPositiveFiniteInteger(this.#staleAfterMilliseconds, 'staleAfterMilliseconds');
		assertPositiveFiniteInteger(
			this.#reconnectInitialDelayMilliseconds,
			'reconnectInitialDelayMilliseconds'
		);
		assertPositiveFiniteInteger(
			this.#reconnectMaxDelayMilliseconds,
			'reconnectMaxDelayMilliseconds'
		);
		if (this.#reconnectMaxDelayMilliseconds < this.#reconnectInitialDelayMilliseconds) {
			throw invalidRequest(
				'reconnectMaxDelayMilliseconds must be greater than or equal to the initial delay.'
			);
		}
		if (!Number.isFinite(this.#reconnectMultiplier) || this.#reconnectMultiplier < 1) {
			throw invalidRequest(
				'reconnectMultiplier must be a finite number greater than or equal to 1.'
			);
		}
	}

	subscribe(request: RealtimeCandlesRequest, listener: RealtimeMarketDataListener): Unsubscribe {
		validateRequest(request);

		let subscribed = true;
		let socket: RealtimeWebSocketConnection | null = null;
		let staleTimer: unknown;
		let reconnectTimer: unknown;
		let reconnectAttempt = 0;
		const streamUrl = `${this.#baseUrl}/${request.symbol.toLowerCase()}@kline_${request.timeframe}`;

		const emitState = (state: RealtimeConnectionState): void => {
			if (!subscribed && state !== 'DISCONNECTED') return;
			listener.onConnectionState({
				state,
				changedAt: this.#scheduler.now(),
				reconnectAttempt
			});
		};

		const clearStaleTimer = (): void => {
			if (staleTimer === undefined) return;
			this.#scheduler.clearTimeout(staleTimer);
			staleTimer = undefined;
		};

		const detachAndClose = (connection: RealtimeWebSocketConnection): void => {
			connection.onOpen = null;
			connection.onMessage = null;
			connection.onError = null;
			connection.onClose = null;
			connection.close(1000, 'reconnect');
		};

		const reconnectDelay = (): number =>
			Math.min(
				this.#reconnectInitialDelayMilliseconds *
					this.#reconnectMultiplier ** Math.max(0, reconnectAttempt - 1),
				this.#reconnectMaxDelayMilliseconds
			);

		const scheduleReconnect = (): void => {
			if (!subscribed || reconnectTimer !== undefined) return;
			clearStaleTimer();
			reconnectAttempt += 1;
			emitState('RECONNECTING');
			reconnectTimer = this.#scheduler.setTimeout(() => {
				reconnectTimer = undefined;
				connect();
			}, reconnectDelay());
		};

		const terminateAndReconnect = (connection: RealtimeWebSocketConnection): void => {
			if (!subscribed || socket !== connection) return;
			socket = null;
			detachAndClose(connection);
			scheduleReconnect();
		};

		const armStaleTimer = (connection: RealtimeWebSocketConnection): void => {
			clearStaleTimer();
			staleTimer = this.#scheduler.setTimeout(() => {
				staleTimer = undefined;
				if (!subscribed || socket !== connection) return;
				emitState('STALE');
				terminateAndReconnect(connection);
			}, this.#staleAfterMilliseconds);
		};

		const connect = (): void => {
			if (!subscribed) return;
			emitState('CONNECTING');

			let connection: RealtimeWebSocketConnection;
			try {
				connection = this.#createWebSocket(streamUrl);
			} catch (cause) {
				listener.onError?.(
					new BinanceRealtimeMarketDataError(
						'CONNECTION_FAILED',
						'Unable to create the Binance public market-data WebSocket.',
						{ cause }
					)
				);
				scheduleReconnect();
				return;
			}

			socket = connection;
			connection.onOpen = () => {
				if (!subscribed || socket !== connection) return;
				reconnectAttempt = 0;
				emitState('CONNECTED');
				armStaleTimer(connection);
			};
			connection.onMessage = (data) => {
				if (!subscribed || socket !== connection) return;
				let candle: Candle;
				try {
					candle = normalizeKlineMessage(data, request);
				} catch (cause) {
					listener.onError?.(
						cause instanceof BinanceRealtimeMarketDataError
							? cause
							: new BinanceRealtimeMarketDataError(
									'INVALID_MESSAGE',
									'Binance returned an invalid realtime kline message.',
									{ cause }
								)
					);
					return;
				}
				armStaleTimer(connection);
				listener.onCandle(candle);
			};
			connection.onError = () => {
				if (!subscribed || socket !== connection) return;
				listener.onError?.(
					new BinanceRealtimeMarketDataError(
						'SOCKET_ERROR',
						'The Binance public market-data WebSocket reported an error.'
					)
				);
				terminateAndReconnect(connection);
			};
			connection.onClose = () => {
				if (!subscribed || socket !== connection) return;
				socket = null;
				clearStaleTimer();
				scheduleReconnect();
			};
		};

		connect();

		return () => {
			if (!subscribed) return;
			subscribed = false;
			clearStaleTimer();
			if (reconnectTimer !== undefined) {
				this.#scheduler.clearTimeout(reconnectTimer);
				reconnectTimer = undefined;
			}
			if (socket) {
				const connection = socket;
				socket = null;
				connection.onOpen = null;
				connection.onMessage = null;
				connection.onError = null;
				connection.onClose = null;
				connection.close(1000, 'unsubscribe');
			}
			emitState('DISCONNECTED');
		};
	}
}

function normalizeKlineMessage(data: unknown, request: RealtimeCandlesRequest): Candle {
	if (typeof data !== 'string') {
		throw invalidMessage('Realtime kline message must be JSON text.');
	}

	let payload: unknown;
	try {
		payload = JSON.parse(data);
	} catch (cause) {
		throw new BinanceRealtimeMarketDataError(
			'INVALID_MESSAGE',
			'Realtime kline message contains malformed JSON.',
			{ cause }
		);
	}

	if (!isRecord(payload) || payload.e !== 'kline' || !isRecord(payload.k)) {
		throw invalidMessage('Realtime message is not a Binance kline event.');
	}

	const kline = payload.k;
	if (
		payload.s !== request.symbol ||
		kline.s !== request.symbol ||
		kline.i !== request.timeframe ||
		typeof kline.x !== 'boolean'
	) {
		throw invalidMessage('Realtime kline symbol, timeframe, or closed state is invalid.');
	}

	const candle: Candle = {
		symbol: request.symbol,
		timeframe: request.timeframe,
		openTimestamp: parseTimestamp(kline.t, 'open timestamp'),
		closeTimestamp: parseTimestamp(kline.T, 'close timestamp'),
		open: parseNumber(kline.o, 'open'),
		high: parseNumber(kline.h, 'high'),
		low: parseNumber(kline.l, 'low'),
		close: parseNumber(kline.c, 'close'),
		volume: parseNumber(kline.v, 'volume'),
		closed: kline.x
	};

	try {
		assertValidCandle(candle);
	} catch (cause) {
		throw new BinanceRealtimeMarketDataError(
			'INVALID_MESSAGE',
			'Realtime kline does not normalize to a valid canonical candle.',
			{ cause }
		);
	}

	return candle;
}

function validateRequest(request: RealtimeCandlesRequest): void {
	if (
		request.symbol !== PRIMARY_MARKET_SYMBOL ||
		request.timeframe !== CANONICAL_STRATEGY_TIMEFRAME
	) {
		throw invalidRequest('Only the public BTCUSDT 1m kline stream is supported.');
	}
}

function normalizeBaseUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch (cause) {
		throw new BinanceRealtimeMarketDataError(
			'INVALID_REQUEST',
			'Binance WebSocket baseUrl must be a valid URL.',
			{ cause }
		);
	}
	if (url.protocol !== 'wss:') {
		throw invalidRequest('Binance WebSocket baseUrl must use wss.');
	}
	return value.replace(/\/+$/, '');
}

function parseTimestamp(value: unknown, field: string): number {
	const parsed = parseNumber(value, field);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw invalidMessage(`Realtime kline ${field} must be a non-negative safe integer.`);
	}
	return parsed;
}

function parseNumber(value: unknown, field: string): number {
	if (typeof value !== 'number' && typeof value !== 'string') {
		throw invalidMessage(`Realtime kline ${field} must be numeric.`);
	}
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(parsed)) {
		throw invalidMessage(`Realtime kline ${field} must be finite.`);
	}
	return parsed;
}

function assertPositiveFiniteInteger(value: number, field: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw invalidRequest(`${field} must be a positive safe integer.`);
	}
}

function invalidRequest(message: string): BinanceRealtimeMarketDataError {
	return new BinanceRealtimeMarketDataError('INVALID_REQUEST', message);
}

function invalidMessage(message: string): BinanceRealtimeMarketDataError {
	return new BinanceRealtimeMarketDataError('INVALID_MESSAGE', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createBrowserWebSocket(url: string): RealtimeWebSocketConnection {
	const socket = new WebSocket(url);
	const connection: RealtimeWebSocketConnection = {
		onOpen: null,
		onMessage: null,
		onError: null,
		onClose: null,
		close: (code, reason) => socket.close(code, reason)
	};
	socket.addEventListener('open', () => connection.onOpen?.());
	socket.addEventListener('message', (event) => connection.onMessage?.(event.data));
	socket.addEventListener('error', () => connection.onError?.());
	socket.addEventListener('close', () => connection.onClose?.());
	return connection;
}

const browserTimerScheduler: RealtimeTimerScheduler = {
	now: Date.now,
	setTimeout: (callback, delayMilliseconds) => globalThis.setTimeout(callback, delayMilliseconds),
	clearTimeout: (handle) =>
		globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>)
};
