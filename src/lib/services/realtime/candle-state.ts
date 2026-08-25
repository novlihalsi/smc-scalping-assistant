import {
	aggregateOneMinuteCandlesToFiveMinutes,
	assertValidCandle,
	CANONICAL_STRATEGY_TIMEFRAME,
	DERIVED_BIAS_TIMEFRAME,
	PRIMARY_MARKET_SYMBOL,
	sortCandlesChronologically,
	TIMEFRAME_DURATION_MILLISECONDS,
	type Candle
} from '../../domain/market/index.js';
import type {
	HistoricalCandlesRequest,
	HistoricalMarketDataProvider
} from '../historical/index.js';
import type { RealtimeSymbol, RealtimeTimeframe } from './provider.js';

const CANONICAL_DURATION = TIMEFRAME_DURATION_MILLISECONDS[CANONICAL_STRATEGY_TIMEFRAME];
const BIAS_DURATION = TIMEFRAME_DURATION_MILLISECONDS[DERIVED_BIAS_TIMEFRAME];

export type RealtimeCandleStatePhase = 'AWAITING_BOOTSTRAP' | 'STREAMING';
export type RealtimeCandleStateErrorCode =
	| 'BOOTSTRAP_ALREADY_COMPLETED'
	| 'INVALID_CANDLE'
	| 'MIXED_SYMBOLS'
	| 'CONFLICTING_FINAL_CANDLE'
	| 'DATA_GAP';

export interface RealtimeCandleStateOptions {
	symbol?: RealtimeSymbol;
}

export interface RealtimeCandleBootstrapRange {
	startTimestamp: number;
	endTimestamp: number;
}

export interface RealtimeCandleBootstrapRequest extends RealtimeCandleBootstrapRange {
	symbol: RealtimeSymbol;
	timeframe: RealtimeTimeframe;
}

export interface RealtimeCandleStateSnapshot {
	phase: RealtimeCandleStatePhase;
	symbol: RealtimeSymbol;
	nextExpectedOneMinuteOpenTimestamp: number | null;
	closedOneMinuteCandles: readonly Candle[];
	currentOneMinuteCandle: Candle | null;
	closedFiveMinuteCandles: readonly Candle[];
	currentFiveMinuteCandle: Candle | null;
	bufferedFinalOneMinuteCandles: readonly Candle[];
	bufferedWebSocketUpdates: number;
	restDeliveries: number;
	webSocketDeliveries: number;
	openCandleUpdates: number;
	duplicateCandleDeliveries: number;
}

export interface RealtimeCandleIngestionResult {
	finalizedOneMinuteCandles: readonly Candle[];
	finalizedFiveMinuteCandles: readonly Candle[];
	snapshot: RealtimeCandleStateSnapshot;
}

export class RealtimeCandleStateError extends Error {
	constructor(
		public readonly code: RealtimeCandleStateErrorCode,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = 'RealtimeCandleStateError';
	}
}

/**
 * Merges a closed REST bootstrap with mutable 1m WebSocket snapshots. Final candles are
 * released once, in contiguous chronological order. Derived closed 5m candles require all
 * five finalized source minutes; partial candles are kept separate for display/state only.
 */
export class RealtimeCandleState {
	readonly #symbol: RealtimeSymbol;
	readonly #closedOneMinuteByOpenTimestamp = new Map<number, Candle>();
	readonly #closedFiveMinuteByOpenTimestamp = new Map<number, Candle>();
	readonly #openOneMinuteByOpenTimestamp = new Map<number, Candle>();
	readonly #bufferedFinalOneMinuteByOpenTimestamp = new Map<number, Candle>();
	readonly #preBootstrapWebSocketUpdates: Candle[] = [];
	#phase: RealtimeCandleStatePhase = 'AWAITING_BOOTSTRAP';
	#nextExpectedOneMinuteOpenTimestamp: number | null = null;
	#restDeliveries = 0;
	#webSocketDeliveries = 0;
	#openCandleUpdates = 0;
	#duplicateCandleDeliveries = 0;

	constructor(options: RealtimeCandleStateOptions = {}) {
		this.#symbol = options.symbol ?? PRIMARY_MARKET_SYMBOL;
	}

	ingestRestBootstrap(
		candles: readonly Candle[],
		range?: RealtimeCandleBootstrapRange
	): RealtimeCandleIngestionResult {
		if (this.#phase !== 'AWAITING_BOOTSTRAP') {
			throw new RealtimeCandleStateError(
				'BOOTSTRAP_ALREADY_COMPLETED',
				'Realtime REST bootstrap may only be ingested once.'
			);
		}

		validateBootstrapRange(range);
		const unique = new Map<number, Candle>();
		for (const candle of candles) {
			this.#assertCanonicalCandle(candle, true);
			this.#restDeliveries += 1;
			const existing = unique.get(candle.openTimestamp);
			if (existing) {
				if (!sameCandle(existing, candle)) throw conflictingFinal(candle.openTimestamp);
				this.#duplicateCandleDeliveries += 1;
				continue;
			}
			unique.set(candle.openTimestamp, cloneCandle(candle));
		}

		const chronological = sortCandlesChronologically(unique.values());
		assertContinuousBootstrap(chronological, range);
		for (const candle of chronological) {
			this.#closedOneMinuteByOpenTimestamp.set(candle.openTimestamp, cloneCandle(candle));
		}
		this.#nextExpectedOneMinuteOpenTimestamp =
			chronological.at(-1)?.openTimestamp === undefined
				? (range?.startTimestamp ?? null)
				: chronological.at(-1)!.openTimestamp + CANONICAL_DURATION;

		const initialFiveMinute = aggregateOneMinuteCandlesToFiveMinutes(chronological).candles;
		for (const candle of initialFiveMinute) {
			this.#closedFiveMinuteByOpenTimestamp.set(candle.openTimestamp, cloneCandle(candle));
		}
		this.#phase = 'STREAMING';

		const finalizedOneMinuteCandles = chronological.map(cloneCandle);
		const finalizedFiveMinuteCandles = initialFiveMinute.map(cloneCandle);
		const pending = this.#preBootstrapWebSocketUpdates.splice(0);
		for (const candle of pending) {
			const result = this.#applyWebSocketUpdate(candle);
			finalizedOneMinuteCandles.push(...result.finalizedOneMinuteCandles);
			finalizedFiveMinuteCandles.push(...result.finalizedFiveMinuteCandles);
		}

		return this.#result(finalizedOneMinuteCandles, finalizedFiveMinuteCandles);
	}

	ingestWebSocketUpdate(candle: Candle): RealtimeCandleIngestionResult {
		this.#assertCanonicalCandle(candle, false);
		this.#webSocketDeliveries += 1;

		if (this.#phase === 'AWAITING_BOOTSTRAP') {
			this.#preBootstrapWebSocketUpdates.push(cloneCandle(candle));
			return this.#result([], []);
		}

		return this.#applyWebSocketUpdate(candle);
	}

	snapshot(): RealtimeCandleStateSnapshot {
		const currentOneMinuteCandle = latestCandle(this.#openOneMinuteByOpenTimestamp);
		return {
			phase: this.#phase,
			symbol: this.#symbol,
			nextExpectedOneMinuteOpenTimestamp: this.#nextExpectedOneMinuteOpenTimestamp,
			closedOneMinuteCandles: sortedClones(this.#closedOneMinuteByOpenTimestamp),
			currentOneMinuteCandle,
			closedFiveMinuteCandles: sortedClones(this.#closedFiveMinuteByOpenTimestamp),
			currentFiveMinuteCandle: this.#deriveCurrentFiveMinuteCandle(currentOneMinuteCandle),
			bufferedFinalOneMinuteCandles: sortedClones(this.#bufferedFinalOneMinuteByOpenTimestamp),
			bufferedWebSocketUpdates: this.#preBootstrapWebSocketUpdates.length,
			restDeliveries: this.#restDeliveries,
			webSocketDeliveries: this.#webSocketDeliveries,
			openCandleUpdates: this.#openCandleUpdates,
			duplicateCandleDeliveries: this.#duplicateCandleDeliveries
		};
	}

	#applyWebSocketUpdate(candle: Candle): RealtimeCandleIngestionResult {
		if (!candle.closed) {
			this.#openCandleUpdates += 1;
			if (
				this.#closedOneMinuteByOpenTimestamp.has(candle.openTimestamp) ||
				this.#bufferedFinalOneMinuteByOpenTimestamp.has(candle.openTimestamp) ||
				(this.#nextExpectedOneMinuteOpenTimestamp !== null &&
					candle.openTimestamp < this.#nextExpectedOneMinuteOpenTimestamp)
			) {
				this.#duplicateCandleDeliveries += 1;
				return this.#result([], []);
			}

			const existing = this.#openOneMinuteByOpenTimestamp.get(candle.openTimestamp);
			if (existing && sameCandle(existing, candle)) {
				this.#duplicateCandleDeliveries += 1;
				return this.#result([], []);
			}
			this.#nextExpectedOneMinuteOpenTimestamp ??= candle.openTimestamp;
			this.#openOneMinuteByOpenTimestamp.set(candle.openTimestamp, cloneCandle(candle));
			return this.#result([], []);
		}

		const finalized = this.#closedOneMinuteByOpenTimestamp.get(candle.openTimestamp);
		if (finalized) {
			if (!sameCandle(finalized, candle)) throw conflictingFinal(candle.openTimestamp);
			this.#duplicateCandleDeliveries += 1;
			return this.#result([], []);
		}
		const buffered = this.#bufferedFinalOneMinuteByOpenTimestamp.get(candle.openTimestamp);
		if (buffered) {
			if (!sameCandle(buffered, candle)) throw conflictingFinal(candle.openTimestamp);
			this.#duplicateCandleDeliveries += 1;
			return this.#result([], []);
		}

		this.#nextExpectedOneMinuteOpenTimestamp ??= candle.openTimestamp;
		if (candle.openTimestamp < this.#nextExpectedOneMinuteOpenTimestamp) {
			this.#duplicateCandleDeliveries += 1;
			return this.#result([], []);
		}
		this.#bufferedFinalOneMinuteByOpenTimestamp.set(candle.openTimestamp, cloneCandle(candle));
		this.#openOneMinuteByOpenTimestamp.delete(candle.openTimestamp);
		return this.#drainFinalCandles();
	}

	#drainFinalCandles(): RealtimeCandleIngestionResult {
		const finalizedOneMinuteCandles: Candle[] = [];
		const finalizedFiveMinuteCandles: Candle[] = [];

		while (this.#nextExpectedOneMinuteOpenTimestamp !== null) {
			const candle = this.#bufferedFinalOneMinuteByOpenTimestamp.get(
				this.#nextExpectedOneMinuteOpenTimestamp
			);
			if (!candle) break;

			this.#bufferedFinalOneMinuteByOpenTimestamp.delete(candle.openTimestamp);
			this.#openOneMinuteByOpenTimestamp.delete(candle.openTimestamp);
			this.#closedOneMinuteByOpenTimestamp.set(candle.openTimestamp, cloneCandle(candle));
			finalizedOneMinuteCandles.push(cloneCandle(candle));
			this.#nextExpectedOneMinuteOpenTimestamp += CANONICAL_DURATION;

			const fiveMinuteCandle = this.#deriveClosedFiveMinuteCandle(candle.openTimestamp);
			if (fiveMinuteCandle) {
				this.#closedFiveMinuteByOpenTimestamp.set(
					fiveMinuteCandle.openTimestamp,
					cloneCandle(fiveMinuteCandle)
				);
				finalizedFiveMinuteCandles.push(cloneCandle(fiveMinuteCandle));
			}
		}

		return this.#result(finalizedOneMinuteCandles, finalizedFiveMinuteCandles);
	}

	#deriveClosedFiveMinuteCandle(lastMinuteOpenTimestamp: number): Candle | null {
		const bucketOpenTimestamp = getBiasBucketOpenTimestamp(lastMinuteOpenTimestamp);
		if (lastMinuteOpenTimestamp !== bucketOpenTimestamp + BIAS_DURATION - CANONICAL_DURATION) {
			return null;
		}
		if (this.#closedFiveMinuteByOpenTimestamp.has(bucketOpenTimestamp)) return null;

		const source = sourceCandlesForBucket(
			bucketOpenTimestamp,
			this.#closedOneMinuteByOpenTimestamp
		);
		if (source.length !== BIAS_DURATION / CANONICAL_DURATION) return null;
		return aggregateOneMinuteCandlesToFiveMinutes(source).candles[0] ?? null;
	}

	#deriveCurrentFiveMinuteCandle(currentOneMinuteCandle: Candle | null): Candle | null {
		const latestClosed = latestCandle(this.#closedOneMinuteByOpenTimestamp);
		const latestObserved = laterCandle(currentOneMinuteCandle, latestClosed);
		if (!latestObserved) return null;

		const bucketOpenTimestamp = getBiasBucketOpenTimestamp(latestObserved.openTimestamp);
		if (this.#closedFiveMinuteByOpenTimestamp.has(bucketOpenTimestamp)) return null;

		const source: Candle[] = [];
		for (
			let timestamp = bucketOpenTimestamp;
			timestamp <= latestObserved.openTimestamp;
			timestamp += CANONICAL_DURATION
		) {
			const candle =
				this.#closedOneMinuteByOpenTimestamp.get(timestamp) ??
				this.#openOneMinuteByOpenTimestamp.get(timestamp);
			if (!candle || (timestamp < latestObserved.openTimestamp && !candle.closed)) return null;
			source.push(candle);
		}

		return source.length === 0 ? null : aggregatePartialFiveMinuteCandle(source);
	}

	#assertCanonicalCandle(candle: Candle, mustBeClosed: boolean): void {
		try {
			assertValidCandle(candle);
		} catch (cause) {
			throw new RealtimeCandleStateError(
				'INVALID_CANDLE',
				'Realtime candle state requires valid canonical candles.',
				{ cause }
			);
		}
		if (candle.symbol !== this.#symbol) {
			throw new RealtimeCandleStateError(
				'MIXED_SYMBOLS',
				`Realtime candle symbol ${candle.symbol} does not match ${this.#symbol}.`
			);
		}
		if (candle.timeframe !== CANONICAL_STRATEGY_TIMEFRAME || (mustBeClosed && !candle.closed)) {
			throw new RealtimeCandleStateError(
				'INVALID_CANDLE',
				'Only canonical 1m candles are valid; REST bootstrap candles must be finalized.'
			);
		}
	}

	#result(
		finalizedOneMinuteCandles: readonly Candle[],
		finalizedFiveMinuteCandles: readonly Candle[]
	): RealtimeCandleIngestionResult {
		return {
			finalizedOneMinuteCandles: finalizedOneMinuteCandles.map(cloneCandle),
			finalizedFiveMinuteCandles: finalizedFiveMinuteCandles.map(cloneCandle),
			snapshot: this.snapshot()
		};
	}
}

export async function bootstrapRealtimeCandleState(
	state: RealtimeCandleState,
	provider: HistoricalMarketDataProvider,
	request: RealtimeCandleBootstrapRequest
): Promise<RealtimeCandleIngestionResult> {
	const historicalRequest: HistoricalCandlesRequest = { ...request };
	const candles = await provider.getCandles(historicalRequest);
	return state.ingestRestBootstrap(candles, request);
}

function assertContinuousBootstrap(
	candles: readonly Candle[],
	range: RealtimeCandleBootstrapRange | undefined
): void {
	let expected = range?.startTimestamp ?? candles[0]?.openTimestamp ?? null;
	for (const candle of candles) {
		if (expected !== candle.openTimestamp) {
			throw dataGap(expected, candle.openTimestamp);
		}
		expected += CANONICAL_DURATION;
	}
	if (range && (candles.length === 0 || candles.at(-1)?.openTimestamp !== range.endTimestamp)) {
		throw dataGap(expected, range.endTimestamp);
	}
}

function validateBootstrapRange(range: RealtimeCandleBootstrapRange | undefined): void {
	if (!range) return;
	if (
		!Number.isSafeInteger(range.startTimestamp) ||
		!Number.isSafeInteger(range.endTimestamp) ||
		range.startTimestamp < 0 ||
		range.endTimestamp < range.startTimestamp ||
		range.startTimestamp % CANONICAL_DURATION !== 0 ||
		range.endTimestamp % CANONICAL_DURATION !== 0
	) {
		throw new RealtimeCandleStateError(
			'INVALID_CANDLE',
			'Realtime bootstrap range must use aligned non-negative 1m open timestamps.'
		);
	}
}

function aggregatePartialFiveMinuteCandle(source: readonly Candle[]): Candle {
	const first = source[0];
	const last = source.at(-1);
	if (!first || !last) {
		throw new RealtimeCandleStateError(
			'INVALID_CANDLE',
			'Cannot aggregate an empty current 5m candle.'
		);
	}
	const bucketOpenTimestamp = getBiasBucketOpenTimestamp(first.openTimestamp);
	return {
		symbol: first.symbol,
		timeframe: DERIVED_BIAS_TIMEFRAME,
		openTimestamp: bucketOpenTimestamp,
		closeTimestamp: bucketOpenTimestamp + BIAS_DURATION - 1,
		open: first.open,
		high: Math.max(...source.map(({ high }) => high)),
		low: Math.min(...source.map(({ low }) => low)),
		close: last.close,
		volume: source.reduce((total, { volume }) => total + volume, 0),
		closed: false
	};
}

function sourceCandlesForBucket(
	bucketOpenTimestamp: number,
	closedCandles: ReadonlyMap<number, Candle>
): Candle[] {
	const source: Candle[] = [];
	for (
		let timestamp = bucketOpenTimestamp;
		timestamp < bucketOpenTimestamp + BIAS_DURATION;
		timestamp += CANONICAL_DURATION
	) {
		const candle = closedCandles.get(timestamp);
		if (!candle) return [];
		source.push(candle);
	}
	return source;
}

function getBiasBucketOpenTimestamp(openTimestamp: number): number {
	return Math.floor(openTimestamp / BIAS_DURATION) * BIAS_DURATION;
}

function sortedClones(source: ReadonlyMap<number, Candle>): Candle[] {
	return sortCandlesChronologically(source.values()).map(cloneCandle);
}

function latestCandle(source: ReadonlyMap<number, Candle>): Candle | null {
	let latest: Candle | null = null;
	for (const candle of source.values()) {
		if (!latest || candle.openTimestamp > latest.openTimestamp) latest = candle;
	}
	return latest ? cloneCandle(latest) : null;
}

function laterCandle(left: Candle | null, right: Candle | null): Candle | null {
	if (!left) return right;
	if (!right) return left;
	return left.openTimestamp >= right.openTimestamp ? left : right;
}

function sameCandle(left: Candle, right: Candle): boolean {
	return (
		left.symbol === right.symbol &&
		left.timeframe === right.timeframe &&
		left.openTimestamp === right.openTimestamp &&
		left.closeTimestamp === right.closeTimestamp &&
		left.open === right.open &&
		left.high === right.high &&
		left.low === right.low &&
		left.close === right.close &&
		left.volume === right.volume &&
		left.closed === right.closed
	);
}

function cloneCandle(candle: Candle): Candle {
	return { ...candle };
}

function conflictingFinal(openTimestamp: number): RealtimeCandleStateError {
	return new RealtimeCandleStateError(
		'CONFLICTING_FINAL_CANDLE',
		`Conflicting finalized 1m candle received at ${openTimestamp}.`
	);
}

function dataGap(expected: number | null, received: number): RealtimeCandleStateError {
	return new RealtimeCandleStateError(
		'DATA_GAP',
		`Missing finalized 1m candle at ${String(expected)}; next candle opens at ${received}.`
	);
}
