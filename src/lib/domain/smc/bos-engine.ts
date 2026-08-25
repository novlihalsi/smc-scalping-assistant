import type { Candle, Timeframe } from '../market/index.js';
import type { MarketStructureState } from './market-structure-engine.js';
import type { MarketStructurePoint, StructureBreak } from './models.js';

export interface BosState {
	symbol: string | null;
	timeframe: Timeframe | null;
	consumedSwingIds: readonly string[];
	lastProcessedTimestamp: number | null;
}

export interface BosProcessingResult {
	state: BosState;
	structureBreak: StructureBreak | null;
}

export class BosError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BosError';
	}
}

export function createBosState(): BosState {
	return {
		symbol: null,
		timeframe: null,
		consumedSwingIds: [],
		lastProcessedTimestamp: null
	};
}

/** Processes one closed candle against structure known by that candle's close. */
export function processBosCandle(
	state: BosState,
	candle: Candle,
	marketStructure: MarketStructureState
): BosProcessingResult {
	if (!candle.closed) {
		return { state, structureBreak: null };
	}

	assertCompatibleInput(state, candle, marketStructure);

	const relevantLevel = findRelevantLevel(marketStructure);
	const nextBaseState: BosState = {
		symbol: state.symbol ?? candle.symbol,
		timeframe: state.timeframe ?? candle.timeframe,
		consumedSwingIds: state.consumedSwingIds,
		lastProcessedTimestamp: candle.closeTimestamp
	};

	if (
		!relevantLevel ||
		state.consumedSwingIds.includes(relevantLevel.swingId) ||
		!isCloseBeyondLevel(candle.close, relevantLevel, marketStructure.bias)
	) {
		return { state: nextBaseState, structureBreak: null };
	}

	const direction = marketStructure.bias;

	if (direction !== 'BULLISH' && direction !== 'BEARISH') {
		return { state: nextBaseState, structureBreak: null };
	}

	const structureBreak: StructureBreak = {
		id: JSON.stringify([
			'BOS',
			candle.symbol,
			candle.timeframe,
			candle.closeTimestamp,
			relevantLevel.swingId,
			direction
		]),
		timestamp: candle.closeTimestamp,
		direction,
		type: 'BOS',
		brokenSwingId: relevantLevel.swingId,
		brokenLevel: relevantLevel.price,
		closePrice: candle.close
	};

	return {
		state: {
			...nextBaseState,
			consumedSwingIds: [...state.consumedSwingIds, relevantLevel.swingId]
		},
		structureBreak
	};
}

function findRelevantLevel(marketStructure: MarketStructureState): MarketStructurePoint | null {
	const relevantStructure =
		marketStructure.bias === 'BULLISH' ? 'HH' : marketStructure.bias === 'BEARISH' ? 'LL' : null;

	if (!relevantStructure) {
		return null;
	}

	for (let index = marketStructure.sequence.length - 1; index >= 0; index -= 1) {
		const point = marketStructure.sequence[index];

		if (point?.structure === relevantStructure) {
			return point;
		}
	}

	return null;
}

function isCloseBeyondLevel(
	closePrice: number,
	level: MarketStructurePoint,
	bias: MarketStructureState['bias']
): boolean {
	if (bias === 'BULLISH') {
		return closePrice > level.price;
	}

	if (bias === 'BEARISH') {
		return closePrice < level.price;
	}

	return false;
}

function assertCompatibleInput(
	state: BosState,
	candle: Candle,
	marketStructure: MarketStructureState
): void {
	if (state.symbol !== null && state.symbol !== candle.symbol) {
		throw new BosError(`Cannot process ${candle.symbol} candle in ${state.symbol} BOS state.`);
	}

	if (state.timeframe !== null && state.timeframe !== candle.timeframe) {
		throw new BosError(
			`Cannot process ${candle.timeframe} candle in ${state.timeframe} BOS state.`
		);
	}

	if (marketStructure.symbol !== null && marketStructure.symbol !== candle.symbol) {
		throw new BosError(
			`Candle symbol ${candle.symbol} does not match structure symbol ${marketStructure.symbol}.`
		);
	}

	if (marketStructure.timeframe !== null && marketStructure.timeframe !== candle.timeframe) {
		throw new BosError(
			`Candle timeframe ${candle.timeframe} does not match structure timeframe ${marketStructure.timeframe}.`
		);
	}

	if (
		state.lastProcessedTimestamp !== null &&
		candle.closeTimestamp <= state.lastProcessedTimestamp
	) {
		throw new BosError('Closed candles must be processed once in chronological order.');
	}

	if (
		marketStructure.lastProcessedTimestamp !== null &&
		marketStructure.lastProcessedTimestamp > candle.closeTimestamp
	) {
		throw new BosError('Market structure contains a swing not yet confirmed by this candle.');
	}
}
