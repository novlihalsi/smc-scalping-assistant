import {
	aggregateOneMinuteCandlesToFiveMinutes,
	assertValidCandle,
	CANONICAL_STRATEGY_TIMEFRAME,
	DERIVED_BIAS_TIMEFRAME,
	TIMEFRAME_DURATION_MILLISECONDS,
	type Candle
} from '../market/index.js';
import type { SMCStrategyConfig, TradingSetup } from './models.js';
import {
	createSmcClosedCandleState,
	processSmcClosedCandle,
	type SMCClosedCandlePipelineState
} from './candle-pipeline.js';

export type CanonicalMinutePipelineErrorCode =
	| 'INVALID_TIMEFRAME'
	| 'UNCLOSED_CANDLE'
	| 'DUPLICATE_CANDLE'
	| 'OUT_OF_ORDER_CANDLE'
	| 'DATA_GAP'
	| 'MIXED_SYMBOLS';

export interface CanonicalMinutePipelineState {
	pipeline: SMCClosedCandlePipelineState;
	pendingFiveMinuteSource: readonly Candle[];
	processedOneMinuteCandles: number;
	derivedFiveMinuteCandles: number;
	lastProcessedMinuteTimestamp: number | null;
}

export interface CanonicalMinuteProcessingResult {
	state: CanonicalMinutePipelineState;
	setups: readonly TradingSetup[];
	processedCandles: readonly Candle[];
}

export class CanonicalMinutePipelineError extends Error {
	constructor(
		public readonly code: CanonicalMinutePipelineErrorCode,
		message: string
	) {
		super(message);
		this.name = 'CanonicalMinutePipelineError';
	}
}

export function createCanonicalMinutePipeline(config: SMCStrategyConfig) {
	return {
		createInitialState: (): CanonicalMinutePipelineState =>
			createCanonicalMinutePipelineState(config),
		processClosedCandle: (
			state: CanonicalMinutePipelineState,
			candle: Candle,
			processingConfig: SMCStrategyConfig
		) => processCanonicalMinute(state, candle, processingConfig)
	};
}

export function createCanonicalMinutePipelineState(
	config: SMCStrategyConfig
): CanonicalMinutePipelineState {
	return {
		pipeline: createSmcClosedCandleState(config),
		pendingFiveMinuteSource: [],
		processedOneMinuteCandles: 0,
		derivedFiveMinuteCandles: 0,
		lastProcessedMinuteTimestamp: null
	};
}

/**
 * Processes one chronological closed 1m candle. When that minute closes a complete
 * UTC-aligned 5m bucket, the derived 5m candle is processed before the source 1m candle.
 */
export function processCanonicalMinute(
	state: CanonicalMinutePipelineState,
	candle: Candle,
	config: SMCStrategyConfig
): CanonicalMinuteProcessingResult {
	assertCanonicalMinute(state, candle);

	const biasDuration = TIMEFRAME_DURATION_MILLISECONDS[DERIVED_BIAS_TIMEFRAME];
	const canonicalDuration = TIMEFRAME_DURATION_MILLISECONDS[CANONICAL_STRATEGY_TIMEFRAME];
	const bucketOpenTimestamp = Math.floor(candle.openTimestamp / biasDuration) * biasDuration;
	const existingBucketOpenTimestamp = state.pendingFiveMinuteSource[0]?.openTimestamp;
	const pendingFiveMinuteSource =
		existingBucketOpenTimestamp === undefined ||
		Math.floor(existingBucketOpenTimestamp / biasDuration) * biasDuration === bucketOpenTimestamp
			? [...state.pendingFiveMinuteSource, { ...candle }]
			: [{ ...candle }];
	const closesFiveMinuteBucket =
		candle.openTimestamp === bucketOpenTimestamp + biasDuration - canonicalDuration;
	const derivedFiveMinuteCandle = closesFiveMinuteBucket
		? aggregateCompleteBucket(pendingFiveMinuteSource)
		: null;

	let pipeline = state.pipeline;
	const setups: TradingSetup[] = [];
	const processedCandles: Candle[] = [];

	if (derivedFiveMinuteCandle) {
		const higherTimeframe = processSmcClosedCandle(pipeline, derivedFiveMinuteCandle, config);
		pipeline = higherTimeframe.state;
		setups.push(...higherTimeframe.setups);
		processedCandles.push(derivedFiveMinuteCandle);
	}

	const entryTimeframe = processSmcClosedCandle(pipeline, candle, config);
	pipeline = entryTimeframe.state;
	setups.push(...entryTimeframe.setups);
	processedCandles.push({ ...candle });

	return {
		state: {
			pipeline,
			pendingFiveMinuteSource: derivedFiveMinuteCandle ? [] : pendingFiveMinuteSource,
			processedOneMinuteCandles: state.processedOneMinuteCandles + 1,
			derivedFiveMinuteCandles:
				state.derivedFiveMinuteCandles + Number(derivedFiveMinuteCandle !== null),
			lastProcessedMinuteTimestamp: candle.closeTimestamp
		},
		setups,
		processedCandles
	};
}

function aggregateCompleteBucket(source: readonly Candle[]): Candle | null {
	const aggregation = aggregateOneMinuteCandlesToFiveMinutes(source);
	return aggregation.incompleteBuckets.length === 0 ? (aggregation.candles[0] ?? null) : null;
}

function assertCanonicalMinute(state: CanonicalMinutePipelineState, candle: Candle): void {
	assertValidCandle(candle);
	if (candle.timeframe !== CANONICAL_STRATEGY_TIMEFRAME) {
		throw new CanonicalMinutePipelineError(
			'INVALID_TIMEFRAME',
			'Canonical orchestration accepts only 1m candles.'
		);
	}
	if (!candle.closed) {
		throw new CanonicalMinutePipelineError(
			'UNCLOSED_CANDLE',
			'Canonical orchestration requires closed 1m candles.'
		);
	}
	if (state.lastProcessedMinuteTimestamp !== null) {
		const expectedOpenTimestamp = state.lastProcessedMinuteTimestamp + 1;
		if (candle.openTimestamp < expectedOpenTimestamp) {
			throw new CanonicalMinutePipelineError(
				candle.closeTimestamp === state.lastProcessedMinuteTimestamp
					? 'DUPLICATE_CANDLE'
					: 'OUT_OF_ORDER_CANDLE',
				'Canonical 1m candles must be processed once in chronological order.'
			);
		}
		if (candle.openTimestamp > expectedOpenTimestamp) {
			throw new CanonicalMinutePipelineError(
				'DATA_GAP',
				`Missing canonical 1m candle at ${expectedOpenTimestamp}; next candle opens at ${candle.openTimestamp}.`
			);
		}
	}
	const pendingSymbol = state.pendingFiveMinuteSource[0]?.symbol;
	if (pendingSymbol !== undefined && pendingSymbol !== candle.symbol) {
		throw new CanonicalMinutePipelineError(
			'MIXED_SYMBOLS',
			'Canonical aggregation cannot mix symbols.'
		);
	}
}
