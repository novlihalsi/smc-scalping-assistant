import {
	DERIVED_BIAS_TIMEFRAME,
	prepareContinuousOneMinuteCandles,
	type Candle
} from '../market/index.js';
import {
	createCanonicalMinutePipeline,
	createCanonicalMinutePipelineState,
	processCanonicalMinute,
	terminalizeCanonicalMinuteAtEndOfRange,
	type CanonicalMinutePipelineState,
	type SMCStrategyConfig,
	type TradingSetup
} from '../strategy/index.js';
import {
	runBacktest,
	type BacktestExecutionConfig,
	type BacktestRunResult,
	type CensoredOpenBacktestTrade,
	type ClosedCandlePipeline,
	type ExpiredPendingBacktestTrade
} from './engine.js';
import type { BacktestInput, BacktestTrade } from './models.js';
import {
	InMemoryRealtimeIngestionAdapter,
	type RealtimeIngestionSnapshot
} from './realtime-ingestion-adapter.js';

export type CanonicalReplayEventType = 'DERIVED_BIAS_CANDLE' | 'CANONICAL_MINUTE_CANDLE';

export interface CanonicalReplayEvent {
	sequence: number;
	type: CanonicalReplayEventType;
	sourceMinuteCloseTimestamp: number;
	candle: Candle;
}

export interface CanonicalReplayObservation {
	normalizedEvents: readonly CanonicalReplayEvent[];
	setupLifecycle: readonly TradingSetup[];
	finalState: CanonicalMinutePipelineState;
	trades: readonly BacktestTrade[];
	expiredPendingTrades: readonly ExpiredPendingBacktestTrade[];
	censoredOpenTrades: readonly CensoredOpenBacktestTrade[];
}

export interface CanonicalReplayParityComparison {
	normalizedEvents: boolean;
	setupLifecycle: boolean;
	finalState: boolean;
	trades: boolean;
	endOfRangeStates: boolean;
	matches: boolean;
}

export interface CanonicalReplayParityResult {
	historical: CanonicalReplayObservation;
	realtimeStyle: CanonicalReplayObservation;
	realtimeIngestion: RealtimeIngestionSnapshot;
	comparison: CanonicalReplayParityComparison;
}

export interface RealtimeParityDeliveryOptions {
	/** Number of chronological candles delivered by the REST bootstrap. */
	bootstrapCandles?: number;
	/** Reverse finalized WS delivery to exercise out-of-order buffering. Defaults to true. */
	reverseFinalizedWebSocketDelivery?: boolean;
	/** Redeliver every finalized WS candle once. Defaults to true. */
	duplicateFinalizedWebSocketDelivery?: boolean;
}

export interface RunCanonicalReplayParityOptions {
	input: BacktestInput;
	candles: readonly Candle[];
	executionConfig?: BacktestExecutionConfig;
	/** A deterministic replay checkpoint, useful for comparing continuation behavior after warm-up. */
	initialState?: CanonicalMinutePipelineState;
	realtimeDelivery?: RealtimeParityDeliveryOptions;
}

interface ObservedCanonicalState {
	canonical: CanonicalMinutePipelineState;
	normalizedEvents: readonly CanonicalReplayEvent[];
}

/**
 * Compares historical replay with a distinct in-memory realtime ingestion path. The
 * realtime path models REST bootstrap, open WS snapshots, finalization, duplicate delivery,
 * and out-of-order delivery before both paths enter the shared canonical strategy engine.
 */
export function runCanonicalReplayParity(
	options: RunCanonicalReplayParityOptions
): CanonicalReplayParityResult {
	const candles = prepareContinuousOneMinuteCandles(options.candles);
	const historicalRun = runObservedReplay(
		options,
		candles,
		createHistoricalObservedPipeline(options.input.config, options.initialState)
	);
	const realtime = ingestRealtimeCandles(options, candles);
	const realtimeStyleRun = runObservedReplay(
		options,
		realtime.candles,
		createRealtimeStyleObservedPipeline(options.input.config, options.initialState)
	);
	const historical = observe(historicalRun);
	const realtimeStyle = observe(realtimeStyleRun);
	const comparison = compareObservations(historical, realtimeStyle);

	return {
		historical,
		realtimeStyle,
		realtimeIngestion: realtime.snapshot,
		comparison
	};
}

function ingestRealtimeCandles(
	options: RunCanonicalReplayParityOptions,
	candles: readonly Candle[]
): { candles: readonly Candle[]; snapshot: RealtimeIngestionSnapshot } {
	const requestedBootstrapCount =
		options.realtimeDelivery?.bootstrapCandles ?? Math.floor(candles.length / 2);
	if (
		!Number.isSafeInteger(requestedBootstrapCount) ||
		requestedBootstrapCount < 0 ||
		requestedBootstrapCount > candles.length
	) {
		throw new RangeError('Realtime parity bootstrap count must fit the canonical candle range.');
	}

	const expectedStartTimestamp =
		options.initialState?.lastProcessedMinuteTimestamp !== null &&
		options.initialState?.lastProcessedMinuteTimestamp !== undefined
			? options.initialState.lastProcessedMinuteTimestamp + 1
			: candles[0]?.openTimestamp;
	const adapter = new InMemoryRealtimeIngestionAdapter({
		symbol: options.input.symbol,
		...(expectedStartTimestamp === undefined ? {} : { expectedStartTimestamp })
	});
	const bootstrap = candles.slice(0, requestedBootstrapCount);
	const emitted: Candle[] = [...adapter.ingestRestBootstrap([...bootstrap].reverse())];
	const webSocketCandles = candles.slice(requestedBootstrapCount);

	for (const candle of [...webSocketCandles].reverse()) {
		adapter.ingestWebSocketUpdate(createOpenSnapshot(candle));
	}

	const finalizedDelivery =
		options.realtimeDelivery?.reverseFinalizedWebSocketDelivery === false
			? webSocketCandles
			: [...webSocketCandles].reverse();
	for (const candle of finalizedDelivery) {
		emitted.push(...adapter.ingestWebSocketUpdate(candle));
		if (options.realtimeDelivery?.duplicateFinalizedWebSocketDelivery !== false) {
			emitted.push(...adapter.ingestWebSocketUpdate({ ...candle }));
		}
	}

	adapter.complete();
	return { candles: emitted, snapshot: adapter.snapshot() };
}

function createOpenSnapshot(candle: Candle): Candle {
	return {
		...candle,
		high: candle.open,
		low: candle.open,
		close: candle.open,
		volume: 0,
		closed: false
	};
}

function runObservedReplay(
	options: RunCanonicalReplayParityOptions,
	candles: readonly Candle[],
	pipeline: ClosedCandlePipeline<ObservedCanonicalState>
): BacktestRunResult<ObservedCanonicalState> {
	return runBacktest({
		input: options.input,
		candles,
		pipeline,
		...(options.executionConfig ? { executionConfig: options.executionConfig } : {})
	});
}

function createHistoricalObservedPipeline(
	config: SMCStrategyConfig,
	initialState?: CanonicalMinutePipelineState
): ClosedCandlePipeline<ObservedCanonicalState> {
	const historical = createCanonicalMinutePipeline(config);
	return {
		createInitialState: () => ({
			canonical: cloneInitialState(initialState, config),
			normalizedEvents: []
		}),
		processClosedCandle: (state, candle, processingConfig) => {
			const result = historical.processClosedCandle(state.canonical, candle, processingConfig);
			return recordCanonicalResult(state, candle, result);
		},
		terminalizeEndOfRange: (state, terminalization) =>
			recordCanonicalTerminalization(
				state,
				historical.terminalizeEndOfRange(state.canonical, terminalization)
			)
	};
}

function createRealtimeStyleObservedPipeline(
	config: SMCStrategyConfig,
	initialState?: CanonicalMinutePipelineState
): ClosedCandlePipeline<ObservedCanonicalState> {
	return {
		createInitialState: () => ({
			canonical: cloneInitialState(initialState, config),
			normalizedEvents: []
		}),
		processClosedCandle: (state, candle, processingConfig) =>
			recordCanonicalResult(
				state,
				candle,
				processCanonicalMinute(state.canonical, candle, processingConfig)
			),
		terminalizeEndOfRange: (state, terminalization) =>
			recordCanonicalTerminalization(
				state,
				terminalizeCanonicalMinuteAtEndOfRange(state.canonical, terminalization)
			)
	};
}

function cloneInitialState(
	initialState: CanonicalMinutePipelineState | undefined,
	config: SMCStrategyConfig
): CanonicalMinutePipelineState {
	return structuredClone(initialState ?? createCanonicalMinutePipelineState(config));
}

function recordCanonicalResult(
	state: ObservedCanonicalState,
	sourceMinute: Candle,
	result: {
		state: CanonicalMinutePipelineState;
		setups: readonly TradingSetup[];
		processedCandles: readonly Candle[];
	}
): { state: ObservedCanonicalState; setups: readonly TradingSetup[] } {
	const nextEvents = result.processedCandles.map((candle, index): CanonicalReplayEvent => ({
		sequence: state.normalizedEvents.length + index,
		type:
			candle.timeframe === DERIVED_BIAS_TIMEFRAME
				? 'DERIVED_BIAS_CANDLE'
				: 'CANONICAL_MINUTE_CANDLE',
		sourceMinuteCloseTimestamp: sourceMinute.closeTimestamp,
		candle: { ...candle }
	}));
	return {
		state: {
			canonical: result.state,
			normalizedEvents: [...state.normalizedEvents, ...nextEvents]
		},
		setups: result.setups
	};
}

function recordCanonicalTerminalization(
	state: ObservedCanonicalState,
	result: {
		state: CanonicalMinutePipelineState;
		setups: readonly TradingSetup[];
	}
): { state: ObservedCanonicalState; setups: readonly TradingSetup[] } {
	return {
		state: { canonical: result.state, normalizedEvents: state.normalizedEvents },
		setups: result.setups
	};
}

function observe(run: BacktestRunResult<ObservedCanonicalState>): CanonicalReplayObservation {
	return {
		normalizedEvents: run.finalState.normalizedEvents,
		setupLifecycle: run.setupEvents,
		finalState: run.finalState.canonical,
		trades: run.trades,
		expiredPendingTrades: run.expiredPendingTrades,
		censoredOpenTrades: run.censoredOpenTrades
	};
}

function compareObservations(
	historical: CanonicalReplayObservation,
	realtimeStyle: CanonicalReplayObservation
): CanonicalReplayParityComparison {
	const normalizedEvents = structurallyEqual(
		historical.normalizedEvents,
		realtimeStyle.normalizedEvents
	);
	const setupLifecycle = structurallyEqual(historical.setupLifecycle, realtimeStyle.setupLifecycle);
	const finalState = structurallyEqual(historical.finalState, realtimeStyle.finalState);
	const trades = structurallyEqual(historical.trades, realtimeStyle.trades);
	const endOfRangeStates = structurallyEqual(
		[historical.expiredPendingTrades, historical.censoredOpenTrades],
		[realtimeStyle.expiredPendingTrades, realtimeStyle.censoredOpenTrades]
	);

	return {
		normalizedEvents,
		setupLifecycle,
		finalState,
		trades,
		endOfRangeStates,
		matches: normalizedEvents && setupLifecycle && finalState && trades && endOfRangeStates
	};
}

function structurallyEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}
