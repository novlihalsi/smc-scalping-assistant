import {
	assertValidCandle,
	CANONICAL_STRATEGY_TIMEFRAME,
	TIMEFRAME_DURATION_MILLISECONDS,
	type Candle
} from '../market/index.js';

export type RealtimeIngestionErrorCode =
	| 'BOOTSTRAP_ALREADY_COMPLETED'
	| 'BOOTSTRAP_REQUIRED'
	| 'INVALID_CANDLE'
	| 'MIXED_SYMBOLS'
	| 'CONFLICTING_FINAL_CANDLE'
	| 'DATA_GAP';

export interface InMemoryRealtimeIngestionOptions {
	symbol?: string;
	expectedStartTimestamp?: number;
}

export interface RealtimeIngestionSnapshot {
	phase: 'AWAITING_BOOTSTRAP' | 'STREAMING';
	symbol: string | null;
	nextExpectedOpenTimestamp: number | null;
	finalizedCandles: readonly Candle[];
	bufferedFinalCandles: readonly Candle[];
	openCandles: readonly Candle[];
	restDeliveries: number;
	webSocketDeliveries: number;
	openCandleUpdates: number;
	duplicateFinalDeliveries: number;
}

export class RealtimeIngestionError extends Error {
	constructor(
		public readonly code: RealtimeIngestionErrorCode,
		message: string
	) {
		super(message);
		this.name = 'RealtimeIngestionError';
	}
}

const CANONICAL_DURATION = TIMEFRAME_DURATION_MILLISECONDS[CANONICAL_STRATEGY_TIMEFRAME];

/**
 * Test-only realtime ingestion boundary. It models a REST bootstrap followed by
 * mutable WebSocket candle snapshots and emits each finalized 1m candle exactly once.
 * It opens no socket and has no production transport responsibilities.
 */
export class InMemoryRealtimeIngestionAdapter {
	readonly #configuredSymbol: string | null;
	readonly #finalizedByOpenTimestamp = new Map<number, Candle>();
	readonly #bufferedFinals = new Map<number, Candle>();
	readonly #openCandles = new Map<number, Candle>();
	#phase: RealtimeIngestionSnapshot['phase'] = 'AWAITING_BOOTSTRAP';
	#symbol: string | null;
	#nextExpectedOpenTimestamp: number | null;
	#restDeliveries = 0;
	#webSocketDeliveries = 0;
	#openCandleUpdates = 0;
	#duplicateFinalDeliveries = 0;

	constructor(options: InMemoryRealtimeIngestionOptions = {}) {
		if (options.symbol !== undefined && options.symbol.trim().length === 0) {
			throw new RealtimeIngestionError('INVALID_CANDLE', 'Realtime symbol must not be empty.');
		}
		if (
			options.expectedStartTimestamp !== undefined &&
			(!Number.isSafeInteger(options.expectedStartTimestamp) ||
				options.expectedStartTimestamp < 0 ||
				options.expectedStartTimestamp % CANONICAL_DURATION !== 0)
		) {
			throw new RealtimeIngestionError(
				'INVALID_CANDLE',
				'Realtime expected start must be a UTC-aligned non-negative 1m timestamp.'
			);
		}

		this.#configuredSymbol = options.symbol ?? null;
		this.#symbol = this.#configuredSymbol;
		this.#nextExpectedOpenTimestamp = options.expectedStartTimestamp ?? null;
	}

	ingestRestBootstrap(candles: readonly Candle[]): readonly Candle[] {
		if (this.#phase !== 'AWAITING_BOOTSTRAP') {
			throw new RealtimeIngestionError(
				'BOOTSTRAP_ALREADY_COMPLETED',
				'Realtime REST bootstrap may only be ingested once.'
			);
		}

		const unique = new Map<number, Candle>();
		for (const candle of candles) {
			this.#assertCanonicalCandle(candle, true);
			this.#assertSymbol(candle);
			this.#restDeliveries += 1;
			const existing = unique.get(candle.openTimestamp);
			if (existing && !sameCandle(existing, candle)) {
				throw conflictingFinal(candle.openTimestamp);
			}
			unique.set(candle.openTimestamp, { ...candle });
		}

		const chronological = [...unique.values()].sort(
			(left, right) => left.openTimestamp - right.openTimestamp
		);
		let expected = this.#nextExpectedOpenTimestamp ?? chronological[0]?.openTimestamp ?? null;
		for (const candle of chronological) {
			if (expected !== candle.openTimestamp) {
				throw dataGap(expected, candle.openTimestamp);
			}
			expected += CANONICAL_DURATION;
		}

		for (const candle of chronological) {
			this.#finalizedByOpenTimestamp.set(candle.openTimestamp, { ...candle });
		}
		this.#nextExpectedOpenTimestamp = expected;
		this.#phase = 'STREAMING';
		return chronological.map((candle) => ({ ...candle }));
	}

	ingestWebSocketUpdate(candle: Candle): readonly Candle[] {
		if (this.#phase !== 'STREAMING') {
			throw new RealtimeIngestionError(
				'BOOTSTRAP_REQUIRED',
				'Realtime WebSocket updates require REST bootstrap to complete first.'
			);
		}

		this.#assertCanonicalCandle(candle, false);
		this.#assertSymbol(candle);
		this.#webSocketDeliveries += 1;

		if (!candle.closed) {
			this.#openCandleUpdates += 1;
			if (
				(this.#nextExpectedOpenTimestamp === null ||
					candle.openTimestamp >= this.#nextExpectedOpenTimestamp) &&
				!this.#finalizedByOpenTimestamp.has(candle.openTimestamp) &&
				!this.#bufferedFinals.has(candle.openTimestamp)
			) {
				this.#openCandles.set(candle.openTimestamp, { ...candle });
			}
			return [];
		}

		const finalized = this.#finalizedByOpenTimestamp.get(candle.openTimestamp);
		if (finalized) {
			if (!sameCandle(finalized, candle)) throw conflictingFinal(candle.openTimestamp);
			this.#duplicateFinalDeliveries += 1;
			return [];
		}

		const buffered = this.#bufferedFinals.get(candle.openTimestamp);
		if (buffered) {
			if (!sameCandle(buffered, candle)) throw conflictingFinal(candle.openTimestamp);
			this.#duplicateFinalDeliveries += 1;
			return [];
		}
		if (
			this.#nextExpectedOpenTimestamp !== null &&
			candle.openTimestamp < this.#nextExpectedOpenTimestamp
		) {
			this.#duplicateFinalDeliveries += 1;
			return [];
		}

		this.#bufferedFinals.set(candle.openTimestamp, { ...candle });
		this.#openCandles.delete(candle.openTimestamp);
		this.#nextExpectedOpenTimestamp ??= candle.openTimestamp;
		return this.#drainFinalizedCandles();
	}

	complete(): readonly Candle[] {
		if (this.#bufferedFinals.size > 0) {
			const nextBuffered = Math.min(...this.#bufferedFinals.keys());
			throw dataGap(this.#nextExpectedOpenTimestamp, nextBuffered);
		}
		return this.snapshot().finalizedCandles;
	}

	snapshot(): RealtimeIngestionSnapshot {
		return {
			phase: this.#phase,
			symbol: this.#symbol,
			nextExpectedOpenTimestamp: this.#nextExpectedOpenTimestamp,
			finalizedCandles: sortedClones(this.#finalizedByOpenTimestamp),
			bufferedFinalCandles: sortedClones(this.#bufferedFinals),
			openCandles: sortedClones(this.#openCandles),
			restDeliveries: this.#restDeliveries,
			webSocketDeliveries: this.#webSocketDeliveries,
			openCandleUpdates: this.#openCandleUpdates,
			duplicateFinalDeliveries: this.#duplicateFinalDeliveries
		};
	}

	#drainFinalizedCandles(): Candle[] {
		const emitted: Candle[] = [];
		while (this.#nextExpectedOpenTimestamp !== null) {
			const candle = this.#bufferedFinals.get(this.#nextExpectedOpenTimestamp);
			if (!candle) break;
			this.#bufferedFinals.delete(candle.openTimestamp);
			this.#finalizedByOpenTimestamp.set(candle.openTimestamp, { ...candle });
			emitted.push({ ...candle });
			this.#nextExpectedOpenTimestamp += CANONICAL_DURATION;
		}
		return emitted;
	}

	#assertCanonicalCandle(candle: Candle, mustBeClosed: boolean): void {
		try {
			assertValidCandle(candle);
		} catch {
			throw new RealtimeIngestionError(
				'INVALID_CANDLE',
				'Realtime ingestion requires a valid canonical candle.'
			);
		}
		if (candle.timeframe !== CANONICAL_STRATEGY_TIMEFRAME || (mustBeClosed && !candle.closed)) {
			throw new RealtimeIngestionError(
				'INVALID_CANDLE',
				'Only canonical 1m candles are valid; REST bootstrap candles must be finalized.'
			);
		}
	}

	#assertSymbol(candle: Candle): void {
		const expected = this.#configuredSymbol ?? this.#symbol;
		if (expected !== null && candle.symbol !== expected) {
			throw new RealtimeIngestionError(
				'MIXED_SYMBOLS',
				`Realtime candle symbol ${candle.symbol} does not match ${expected}.`
			);
		}
		this.#symbol ??= candle.symbol;
	}
}

function sortedClones(source: ReadonlyMap<number, Candle>): Candle[] {
	return [...source.values()]
		.sort((left, right) => left.openTimestamp - right.openTimestamp)
		.map((candle) => ({ ...candle }));
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

function conflictingFinal(openTimestamp: number): RealtimeIngestionError {
	return new RealtimeIngestionError(
		'CONFLICTING_FINAL_CANDLE',
		`Conflicting finalized 1m candle received at ${openTimestamp}.`
	);
}

function dataGap(expected: number | null, received: number): RealtimeIngestionError {
	return new RealtimeIngestionError(
		'DATA_GAP',
		`Missing finalized 1m candle at ${String(expected)}; next buffered candle opens at ${received}.`
	);
}
