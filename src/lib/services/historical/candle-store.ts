import type { Candle, Timeframe } from '../../domain/market/index.js';
import {
	assertValidCandle,
	getCandleIdentity,
	sortCandlesChronologically
} from '../../domain/market/index.js';

export interface HistoricalCandleQuery {
	symbol?: string;
	timeframe?: Timeframe;
	startTimestamp?: number;
	endTimestamp?: number;
	closedOnly?: boolean;
}

export interface HistoricalCandleStore {
	readonly size: number;
	mergeBatch(candles: Iterable<Candle>): Candle[];
	getCandles(query?: HistoricalCandleQuery): Candle[];
}

export class InMemoryHistoricalCandleStore implements HistoricalCandleStore {
	readonly #candlesByIdentity = new Map<string, Candle>();

	constructor(initialCandles: Iterable<Candle> = []) {
		this.mergeBatch(initialCandles);
	}

	get size(): number {
		return this.#candlesByIdentity.size;
	}

	mergeBatch(candles: Iterable<Candle>): Candle[] {
		const incomingCandles = [...candles];

		for (const candle of incomingCandles) {
			assertValidCandle(candle);
		}

		for (const candle of incomingCandles) {
			this.#candlesByIdentity.set(getCandleIdentity(candle), { ...candle });
		}

		return this.getCandles();
	}

	getCandles(query: HistoricalCandleQuery = {}): Candle[] {
		validateQuery(query);

		return sortCandlesChronologically(this.#candlesByIdentity.values())
			.filter(
				(candle) =>
					(query.symbol === undefined || candle.symbol === query.symbol) &&
					(query.timeframe === undefined || candle.timeframe === query.timeframe) &&
					(query.startTimestamp === undefined || candle.openTimestamp >= query.startTimestamp) &&
					(query.endTimestamp === undefined || candle.openTimestamp <= query.endTimestamp) &&
					(!query.closedOnly || candle.closed)
			)
			.map((candle) => ({ ...candle }));
	}
}

function validateQuery(query: HistoricalCandleQuery): void {
	if (
		(query.startTimestamp !== undefined && !isNonNegativeSafeInteger(query.startTimestamp)) ||
		(query.endTimestamp !== undefined && !isNonNegativeSafeInteger(query.endTimestamp))
	) {
		throw new RangeError('Historical candle query timestamps must be non-negative safe integers.');
	}

	if (
		query.startTimestamp !== undefined &&
		query.endTimestamp !== undefined &&
		query.startTimestamp > query.endTimestamp
	) {
		throw new RangeError('Historical candle query startTimestamp must not exceed endTimestamp.');
	}
}

function isNonNegativeSafeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}
