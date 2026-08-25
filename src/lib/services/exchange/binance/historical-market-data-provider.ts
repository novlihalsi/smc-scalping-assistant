import {
	CANONICAL_STRATEGY_TIMEFRAME,
	DERIVED_BIAS_TIMEFRAME,
	getTimeframeDurationMilliseconds,
	PRIMARY_MARKET_SYMBOL,
	type Candle
} from '../../../domain/market/index.js';
import {
	HistoricalMarketDataError,
	type HistoricalCandlesRequest,
	type HistoricalMarketDataProvider
} from '../../historical/index.js';

const DEFAULT_BASE_URL = 'https://data-api.binance.vision';
const DEFAULT_PAGE_LIMIT = 1_000;

export interface BinanceHistoricalMarketDataProviderOptions {
	baseUrl?: string;
	fetch?: typeof globalThis.fetch;
	now?: () => number;
	pageLimit?: number;
}

export class BinanceHistoricalMarketDataProvider implements HistoricalMarketDataProvider {
	readonly #baseUrl: string;
	readonly #fetch: typeof globalThis.fetch;
	readonly #now: () => number;
	readonly #pageLimit: number;

	constructor(options: BinanceHistoricalMarketDataProviderOptions = {}) {
		this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
		this.#fetch = options.fetch ?? globalThis.fetch;
		this.#now = options.now ?? Date.now;
		this.#pageLimit = options.pageLimit ?? DEFAULT_PAGE_LIMIT;

		if (!Number.isInteger(this.#pageLimit) || this.#pageLimit < 1 || this.#pageLimit > 1_000) {
			throw new HistoricalMarketDataError(
				'INVALID_REQUEST',
				'Binance pageLimit must be an integer between 1 and 1000.'
			);
		}
	}

	async getCandles(request: HistoricalCandlesRequest): Promise<Candle[]> {
		validateRequest(request);

		const requestedAt = this.#now();
		const intervalMilliseconds = getTimeframeDurationMilliseconds(request.timeframe);
		const candlesByOpenTimestamp = new Map<number, Candle>();
		let cursor = request.startTimestamp;

		while (cursor <= request.endTimestamp) {
			const payload = await this.#fetchPage(request, cursor);

			if (payload.length === 0) {
				break;
			}

			const page = payload.map((row, index) => normalizeKline(row, request, requestedAt, index));
			const lastOpenTimestamp = Math.max(...page.map((candle) => candle.openTimestamp));

			if (lastOpenTimestamp < cursor) {
				throw new HistoricalMarketDataError(
					'INVALID_RESPONSE',
					'Binance kline pagination did not advance.'
				);
			}

			for (const candle of page) {
				if (
					candle.openTimestamp >= request.startTimestamp &&
					candle.openTimestamp <= request.endTimestamp
				) {
					if (candlesByOpenTimestamp.has(candle.openTimestamp)) {
						throw new HistoricalMarketDataError(
							'DUPLICATE_CANDLE',
							`Binance returned duplicate ${request.timeframe} candle at ${candle.openTimestamp}.`
						);
					}
					candlesByOpenTimestamp.set(candle.openTimestamp, candle);
				}
			}

			if (payload.length < this.#pageLimit || lastOpenTimestamp >= request.endTimestamp) {
				break;
			}

			const nextCursor = lastOpenTimestamp + intervalMilliseconds;

			if (!Number.isSafeInteger(nextCursor) || nextCursor <= cursor) {
				throw new HistoricalMarketDataError(
					'INVALID_RESPONSE',
					'Binance kline pagination produced an invalid cursor.'
				);
			}

			cursor = nextCursor;
		}

		return [...candlesByOpenTimestamp.values()].sort(
			(left, right) => left.openTimestamp - right.openTimestamp
		);
	}

	async #fetchPage(request: HistoricalCandlesRequest, startTimestamp: number): Promise<unknown[]> {
		const url = new URL('/api/v3/klines', this.#baseUrl);
		url.searchParams.set('symbol', request.symbol);
		url.searchParams.set('interval', request.timeframe);
		url.searchParams.set('startTime', String(startTimestamp));
		url.searchParams.set('endTime', String(request.endTimestamp));
		url.searchParams.set('limit', String(this.#pageLimit));

		let response: Response;

		try {
			response = await this.#fetch(url);
		} catch (cause) {
			throw new HistoricalMarketDataError(
				'NETWORK_ERROR',
				'Unable to fetch historical candles from Binance.',
				{ cause }
			);
		}

		if (!response.ok) {
			throw new HistoricalMarketDataError(
				'HTTP_ERROR',
				`Binance historical candle request failed with HTTP ${response.status}.`
			);
		}

		let payload: unknown;

		try {
			payload = await response.json();
		} catch (cause) {
			throw new HistoricalMarketDataError(
				'INVALID_RESPONSE',
				'Binance returned malformed JSON for historical candles.',
				{ cause }
			);
		}

		if (!isUnknownArray(payload)) {
			throw new HistoricalMarketDataError(
				'INVALID_RESPONSE',
				'Binance historical candle response must be an array.'
			);
		}

		return payload;
	}
}

function validateRequest(request: HistoricalCandlesRequest): void {
	if (request.symbol !== PRIMARY_MARKET_SYMBOL) {
		throw new HistoricalMarketDataError(
			'INVALID_REQUEST',
			`Unsupported historical symbol: ${String(request.symbol)}.`
		);
	}

	if (
		request.timeframe !== CANONICAL_STRATEGY_TIMEFRAME &&
		request.timeframe !== DERIVED_BIAS_TIMEFRAME
	) {
		throw new HistoricalMarketDataError(
			'INVALID_REQUEST',
			`Unsupported historical timeframe: ${String(request.timeframe)}.`
		);
	}

	if (!isTimestamp(request.startTimestamp) || !isTimestamp(request.endTimestamp)) {
		throw new HistoricalMarketDataError(
			'INVALID_REQUEST',
			'Historical range timestamps must be non-negative safe integers.'
		);
	}

	if (request.startTimestamp > request.endTimestamp) {
		throw new HistoricalMarketDataError(
			'INVALID_REQUEST',
			'Historical range startTimestamp must not exceed endTimestamp.'
		);
	}
}

function normalizeKline(
	value: unknown,
	request: HistoricalCandlesRequest,
	requestedAt: number,
	rowIndex: number
): Candle {
	if (!isUnknownArray(value) || value.length < 7) {
		throw invalidRow(rowIndex, 'expected at least seven fields');
	}

	const openTimestamp = parseTimestamp(value[0], rowIndex, 'open timestamp');
	const closeTimestamp = parseTimestamp(value[6], rowIndex, 'close timestamp');

	return {
		symbol: request.symbol,
		timeframe: request.timeframe,
		openTimestamp,
		closeTimestamp,
		open: parseFiniteNumber(value[1], rowIndex, 'open'),
		high: parseFiniteNumber(value[2], rowIndex, 'high'),
		low: parseFiniteNumber(value[3], rowIndex, 'low'),
		close: parseFiniteNumber(value[4], rowIndex, 'close'),
		volume: parseFiniteNumber(value[5], rowIndex, 'volume'),
		closed: closeTimestamp < requestedAt
	};
}

function parseTimestamp(value: unknown, rowIndex: number, field: string): number {
	const parsed = parseFiniteNumber(value, rowIndex, field);

	if (!isTimestamp(parsed)) {
		throw invalidRow(rowIndex, `${field} must be a non-negative safe integer`);
	}

	return parsed;
}

function parseFiniteNumber(value: unknown, rowIndex: number, field: string): number {
	if (typeof value !== 'number' && typeof value !== 'string') {
		throw invalidRow(rowIndex, `${field} must be numeric`);
	}

	const parsed = typeof value === 'number' ? value : Number(value);

	if (!Number.isFinite(parsed)) {
		throw invalidRow(rowIndex, `${field} must be finite`);
	}

	return parsed;
}

function invalidRow(rowIndex: number, reason: string): HistoricalMarketDataError {
	return new HistoricalMarketDataError(
		'INVALID_RESPONSE',
		`Invalid Binance kline at row ${rowIndex}: ${reason}.`
	);
}

function isTimestamp(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}

function isUnknownArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}
