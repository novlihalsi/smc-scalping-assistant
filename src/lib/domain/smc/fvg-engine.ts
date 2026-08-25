import { assertValidCandle, type Candle, type Timeframe } from '../market/index.js';
import type { FairValueGap } from './models.js';

export interface FvgState {
	symbol: string | null;
	timeframe: Timeframe | null;
	recentCandles: readonly Candle[];
	gaps: readonly FairValueGap[];
	lastProcessedTimestamp: number | null;
}

export interface FvgProcessingResult {
	state: FvgState;
	createdGap: FairValueGap | null;
	updatedGaps: readonly FairValueGap[];
}

export class FvgError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FvgError';
	}
}

export function createFvgState(): FvgState {
	return {
		symbol: null,
		timeframe: null,
		recentCandles: [],
		gaps: [],
		lastProcessedTimestamp: null
	};
}

/** Processes one closed candle; gap creation uses only this candle and the prior two. */
export function processFvgCandle(state: FvgState, candle: Candle): FvgProcessingResult {
	if (!candle.closed) {
		return { state, createdGap: null, updatedGaps: [] };
	}

	assertValidCandle(candle);
	assertCompatibleCandle(state, candle);

	const updatedGaps: FairValueGap[] = [];
	const mitigatedGaps = state.gaps.map((gap) => {
		const updated = updateGap(gap, candle);

		if (updated !== gap) {
			updatedGaps.push(updated);
		}

		return updated;
	});
	const createdGap = detectGap(state.recentCandles, candle);
	const recentCandles = [...state.recentCandles, candle].slice(-2);

	return {
		state: {
			symbol: state.symbol ?? candle.symbol,
			timeframe: state.timeframe ?? candle.timeframe,
			recentCandles,
			gaps: createdGap ? [...mitigatedGaps, createdGap] : mitigatedGaps,
			lastProcessedTimestamp: candle.closeTimestamp
		},
		createdGap,
		updatedGaps
	};
}

function detectGap(recentCandles: readonly Candle[], third: Candle): FairValueGap | null {
	if (recentCandles.length < 2) {
		return null;
	}

	const first = recentCandles[recentCandles.length - 2];
	if (!first) {
		return null;
	}

	if (third.low > first.high) {
		return createGap('BULLISH', first.high, third.low, third);
	}

	if (third.high < first.low) {
		return createGap('BEARISH', third.high, first.low, third);
	}

	return null;
}

function createGap(
	type: FairValueGap['type'],
	bottom: number,
	top: number,
	candle: Candle
): FairValueGap {
	return {
		id: JSON.stringify(['FVG', candle.symbol, candle.timeframe, candle.closeTimestamp, type]),
		type,
		createdAt: candle.closeTimestamp,
		bottom,
		top,
		midpoint: (bottom + top) / 2,
		state: 'UNTOUCHED',
		lastUpdatedAt: candle.closeTimestamp
	};
}

function updateGap(gap: FairValueGap, candle: Candle): FairValueGap {
	if (gap.state === 'FILLED') {
		return gap;
	}

	let nextState: FairValueGap['state'] = gap.state;

	if (gap.type === 'BULLISH') {
		if (candle.low <= gap.bottom) {
			nextState = 'FILLED';
		} else if (candle.low <= gap.top) {
			nextState = 'PARTIALLY_FILLED';
		}
	} else if (candle.high >= gap.top) {
		nextState = 'FILLED';
	} else if (candle.high >= gap.bottom) {
		nextState = 'PARTIALLY_FILLED';
	}

	return nextState === gap.state
		? gap
		: { ...gap, state: nextState, lastUpdatedAt: candle.closeTimestamp };
}

function assertCompatibleCandle(state: FvgState, candle: Candle): void {
	if (state.symbol !== null && state.symbol !== candle.symbol) {
		throw new FvgError(`Cannot process ${candle.symbol} candle in ${state.symbol} FVG state.`);
	}

	if (state.timeframe !== null && state.timeframe !== candle.timeframe) {
		throw new FvgError(
			`Cannot process ${candle.timeframe} candle in ${state.timeframe} FVG state.`
		);
	}

	if (
		state.lastProcessedTimestamp !== null &&
		candle.closeTimestamp <= state.lastProcessedTimestamp
	) {
		throw new FvgError('Closed candles must be processed once in chronological order.');
	}

	for (const gap of state.gaps) {
		if (gap.createdAt > candle.closeTimestamp || gap.lastUpdatedAt > candle.closeTimestamp) {
			throw new FvgError('FVG state contains future-confirmed information.');
		}
	}
}
