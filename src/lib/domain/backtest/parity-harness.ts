import {
	DERIVED_BIAS_TIMEFRAME,
	prepareContinuousOneMinuteCandles,
	type Candle
} from '../market/index.js';
import {
	createCanonicalMinutePipeline,
	createCanonicalMinutePipelineState,
	processCanonicalMinute,
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
	comparison: CanonicalReplayParityComparison;
}

export interface RunCanonicalReplayParityOptions {
	input: BacktestInput;
	candles: readonly Candle[];
	executionConfig?: BacktestExecutionConfig;
	/** A deterministic replay checkpoint, useful for comparing continuation behavior after warm-up. */
	initialState?: CanonicalMinutePipelineState;
}

interface ObservedCanonicalState {
	canonical: CanonicalMinutePipelineState;
	normalizedEvents: readonly CanonicalReplayEvent[];
}

/**
 * Compares historical replay with an in-memory realtime-style adapter that accepts one
 * already-closed canonical minute at a time. This is a parity test utility only; it opens
 * no sockets and implements no realtime market-data service.
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
	const realtimeStyleRun = runObservedReplay(
		options,
		candles,
		createRealtimeStyleObservedPipeline(options.input.config, options.initialState)
	);
	const historical = observe(historicalRun);
	const realtimeStyle = observe(realtimeStyleRun);
	const comparison = compareObservations(historical, realtimeStyle);

	return { historical, realtimeStyle, comparison };
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
		}
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
