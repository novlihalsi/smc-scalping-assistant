import type {
	CANONICAL_STRATEGY_TIMEFRAME,
	DERIVED_BIAS_TIMEFRAME,
	Timeframe
} from '../market/index.js';
import type { FairValueGap, LiquiditySweep, MarketBias, StructureBreak } from '../smc/models.js';
import type { DisplacementEvent } from '../smc/displacement-engine.js';

export type StrategyDirection = 'LONG' | 'SHORT';
export type StrategyStage =
	| 'WAITING_FOR_BIAS'
	| 'WAITING_FOR_SWEEP'
	| 'WAITING_FOR_CHOCH'
	| 'WAITING_FOR_DISPLACEMENT'
	| 'WAITING_FOR_FVG'
	| 'WAITING_FOR_RETRACEMENT'
	| 'READY'
	| 'INVALIDATED';

interface BaseStrategySignal {
	id: string;
	timestamp: number;
	timeframe: Timeframe;
}

export interface HtfBiasSignal extends BaseStrategySignal {
	type: 'HTF_BIAS';
	timeframe: typeof DERIVED_BIAS_TIMEFRAME;
	bias: MarketBias;
}

export interface LiquiditySweepSignal extends BaseStrategySignal {
	type: 'LIQUIDITY_SWEEP';
	timeframe: typeof CANONICAL_STRATEGY_TIMEFRAME;
	sweep: LiquiditySweep;
}

export interface ChochSignal extends BaseStrategySignal {
	type: 'CHOCH';
	timeframe: typeof CANONICAL_STRATEGY_TIMEFRAME;
	structureBreak: StructureBreak;
}

export interface DisplacementSignal extends BaseStrategySignal {
	type: 'DISPLACEMENT';
	timeframe: typeof CANONICAL_STRATEGY_TIMEFRAME;
	displacement: DisplacementEvent;
}

export interface FvgSignal extends BaseStrategySignal {
	type: 'FVG';
	timeframe: typeof CANONICAL_STRATEGY_TIMEFRAME;
	gap: FairValueGap;
}

export interface RetracementSignal extends BaseStrategySignal {
	type: 'RETRACEMENT';
	timeframe: typeof CANONICAL_STRATEGY_TIMEFRAME;
	fvg: FairValueGap;
	price: number;
}

export interface InvalidationSignal extends BaseStrategySignal {
	type: 'INVALIDATE';
	reason: string;
}

export type StrategySignal =
	| HtfBiasSignal
	| LiquiditySweepSignal
	| ChochSignal
	| DisplacementSignal
	| FvgSignal
	| RetracementSignal
	| InvalidationSignal;

export interface StrategyState {
	stage: StrategyStage;
	direction: StrategyDirection | null;
	bias: MarketBias;
	activeFvgId: string | null;
	sourceEventIds: readonly string[];
	processedEventIds: readonly string[];
	startedAt: number | null;
	lastProcessedTimestamp: number | null;
	invalidationReason: string | null;
}

export interface StrategyTransition {
	id: string;
	timestamp: number;
	from: StrategyStage;
	to: StrategyStage;
	direction: StrategyDirection | null;
	sourceEventId: string;
	reason: string | null;
}

export interface StrategyProcessingResult {
	state: StrategyState;
	transition: StrategyTransition | null;
}

export class StrategyStateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'StrategyStateError';
	}
}

export function createStrategyState(): StrategyState {
	return {
		stage: 'WAITING_FOR_BIAS',
		direction: null,
		bias: 'NEUTRAL',
		activeFvgId: null,
		sourceEventIds: [],
		processedEventIds: [],
		startedAt: null,
		lastProcessedTimestamp: null,
		invalidationReason: null
	};
}

export function processStrategySignal(
	state: StrategyState,
	signal: StrategySignal
): StrategyProcessingResult {
	assertSignalOrder(state, signal);

	if (signal.type === 'HTF_BIAS') return processBias(state, signal);
	if (signal.type === 'INVALIDATE') return invalidate(state, signal, signal.reason);

	const baseState = recordProcessedSignal(state, signal);
	if (state.stage === 'INVALIDATED' || state.stage === 'READY' || state.direction === null) {
		return { state: baseState, transition: null };
	}

	if (signal.type === 'LIQUIDITY_SWEEP' && state.stage === 'WAITING_FOR_SWEEP') {
		const expected = state.direction === 'LONG' ? 'SELL_SIDE' : 'BUY_SIDE';
		if (signal.sweep.direction === expected && signal.sweep.timestamp === signal.timestamp) {
			return transition(baseState, signal, 'WAITING_FOR_CHOCH');
		}
	}

	if (signal.type === 'CHOCH' && state.stage === 'WAITING_FOR_CHOCH') {
		const expected = state.direction === 'LONG' ? 'BULLISH' : 'BEARISH';
		if (
			signal.structureBreak.type === 'CHOCH' &&
			signal.structureBreak.direction === expected &&
			signal.structureBreak.timestamp === signal.timestamp
		) {
			return transition(baseState, signal, 'WAITING_FOR_DISPLACEMENT');
		}
	}

	if (signal.type === 'DISPLACEMENT' && state.stage === 'WAITING_FOR_DISPLACEMENT') {
		const expected = state.direction === 'LONG' ? 'BULLISH' : 'BEARISH';
		if (
			signal.displacement.direction === expected &&
			signal.displacement.timestamp === signal.timestamp
		) {
			return transition(baseState, signal, 'WAITING_FOR_FVG');
		}
	}

	if (signal.type === 'FVG' && state.stage === 'WAITING_FOR_FVG') {
		const expected = state.direction === 'LONG' ? 'BULLISH' : 'BEARISH';
		if (
			signal.gap.type === expected &&
			signal.gap.state === 'UNTOUCHED' &&
			signal.gap.createdAt === signal.timestamp &&
			signal.gap.lastUpdatedAt === signal.timestamp
		) {
			const next = transition(baseState, signal, 'WAITING_FOR_RETRACEMENT');
			return { ...next, state: { ...next.state, activeFvgId: signal.gap.id } };
		}
	}

	if (signal.type === 'RETRACEMENT' && state.stage === 'WAITING_FOR_RETRACEMENT') {
		if (
			state.activeFvgId === signal.fvg.id &&
			signal.fvg.state !== 'FILLED' &&
			signal.fvg.createdAt < signal.timestamp &&
			signal.fvg.lastUpdatedAt <= signal.timestamp &&
			Number.isFinite(signal.price) &&
			signal.price >= signal.fvg.bottom &&
			signal.price <= signal.fvg.top
		) {
			return transition(baseState, signal, 'READY');
		}
	}

	return { state: baseState, transition: null };
}

function processBias(state: StrategyState, signal: HtfBiasSignal): StrategyProcessingResult {
	const recorded = recordProcessedSignal(state, signal);
	if (signal.bias === 'NEUTRAL') {
		return state.direction === null
			? { state: { ...recorded, bias: 'NEUTRAL' }, transition: null }
			: invalidate(recorded, signal, 'Higher-timeframe bias became neutral', true);
	}

	const direction: StrategyDirection = signal.bias === 'BULLISH' ? 'LONG' : 'SHORT';
	if (state.direction === direction && state.stage !== 'INVALIDATED') {
		return { state: { ...recorded, bias: signal.bias }, transition: null };
	}

	const nextState: StrategyState = {
		...recorded,
		stage: 'WAITING_FOR_SWEEP',
		direction,
		bias: signal.bias,
		activeFvgId: null,
		sourceEventIds: [signal.id],
		startedAt: signal.timestamp,
		invalidationReason: null
	};
	return {
		state: nextState,
		transition: createTransition(
			state.stage,
			nextState.stage,
			direction,
			signal,
			state.direction ? 'Higher-timeframe bias changed' : null
		)
	};
}

function invalidate(
	state: StrategyState,
	signal: StrategySignal,
	reason: string,
	alreadyRecorded = false
): StrategyProcessingResult {
	const recorded = alreadyRecorded ? state : recordProcessedSignal(state, signal);
	if (state.stage === 'INVALIDATED') return { state: recorded, transition: null };
	const nextState = { ...recorded, stage: 'INVALIDATED' as const, invalidationReason: reason };
	return {
		state: nextState,
		transition: createTransition(state.stage, 'INVALIDATED', state.direction, signal, reason)
	};
}

function transition(
	state: StrategyState,
	signal: StrategySignal,
	to: StrategyStage
): StrategyProcessingResult {
	const nextState = { ...state, stage: to, sourceEventIds: [...state.sourceEventIds, signal.id] };
	return {
		state: nextState,
		transition: createTransition(state.stage, to, state.direction, signal, null)
	};
}

function recordProcessedSignal(state: StrategyState, signal: StrategySignal): StrategyState {
	return {
		...state,
		processedEventIds: [...state.processedEventIds, signal.id],
		lastProcessedTimestamp: signal.timestamp
	};
}

function createTransition(
	from: StrategyStage,
	to: StrategyStage,
	direction: StrategyDirection | null,
	signal: StrategySignal,
	reason: string | null
): StrategyTransition {
	return {
		id: JSON.stringify(['STRATEGY_TRANSITION', signal.timestamp, signal.id, from, to]),
		timestamp: signal.timestamp,
		from,
		to,
		direction,
		sourceEventId: signal.id,
		reason
	};
}

function assertSignalOrder(state: StrategyState, signal: StrategySignal): void {
	if (!signal.id || !Number.isFinite(signal.timestamp)) {
		throw new StrategyStateError('Strategy signals require an ID and finite timestamp.');
	}
	if (state.processedEventIds.includes(signal.id)) {
		throw new StrategyStateError(`Strategy signal ${signal.id} has already been processed.`);
	}
	if (state.lastProcessedTimestamp !== null && signal.timestamp < state.lastProcessedTimestamp) {
		throw new StrategyStateError('Strategy signals must be processed chronologically.');
	}
	if (signal.type !== 'HTF_BIAS' && signal.type !== 'INVALIDATE' && signal.timeframe !== '1m') {
		throw new StrategyStateError('Entry-sequence signals must use the 1m timeframe.');
	}
}
