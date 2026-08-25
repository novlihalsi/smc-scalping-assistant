import type { Candle, Timeframe } from '../market/index.js';
import type { MarketStructureState } from './market-structure-engine.js';
import type { MarketBias, MarketStructurePoint, StructureBreak } from './models.js';

export interface ChochState {
	symbol: string | null;
	timeframe: Timeframe | null;
	consumedSwingIds: readonly string[];
	lastProcessedTimestamp: number | null;
}

export interface ChochProcessingResult {
	state: ChochState;
	marketStructure: MarketStructureState;
	structureBreak: StructureBreak | null;
}

export class ChochError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ChochError';
	}
}

export function createChochState(): ChochState {
	return {
		symbol: null,
		timeframe: null,
		consumedSwingIds: [],
		lastProcessedTimestamp: null
	};
}

/** Processes one closed candle against the opposite-bias structure known at its close. */
export function processChochCandle(
	state: ChochState,
	candle: Candle,
	marketStructure: MarketStructureState
): ChochProcessingResult {
	if (!candle.closed) {
		return { state, marketStructure, structureBreak: null };
	}

	assertCompatibleInput(state, candle, marketStructure);

	const relevantLevel = findRelevantLevel(marketStructure);
	const direction = getChochDirection(marketStructure.bias);
	const nextBaseState: ChochState = {
		symbol: state.symbol ?? candle.symbol,
		timeframe: state.timeframe ?? candle.timeframe,
		consumedSwingIds: state.consumedSwingIds,
		lastProcessedTimestamp: candle.closeTimestamp
	};

	if (
		!relevantLevel ||
		!direction ||
		state.consumedSwingIds.includes(relevantLevel.swingId) ||
		!isCloseBeyondLevel(candle.close, relevantLevel, direction)
	) {
		return { state: nextBaseState, marketStructure, structureBreak: null };
	}

	const structureBreak: StructureBreak = {
		id: JSON.stringify([
			'CHOCH',
			candle.symbol,
			candle.timeframe,
			candle.closeTimestamp,
			relevantLevel.swingId,
			direction
		]),
		timestamp: candle.closeTimestamp,
		direction,
		type: 'CHOCH',
		brokenSwingId: relevantLevel.swingId,
		brokenLevel: relevantLevel.price,
		closePrice: candle.close
	};

	return {
		state: {
			...nextBaseState,
			consumedSwingIds: [...state.consumedSwingIds, relevantLevel.swingId]
		},
		marketStructure: { ...marketStructure, bias: direction },
		structureBreak
	};
}

function findRelevantLevel(marketStructure: MarketStructureState): MarketStructurePoint | null {
	const relevantStructure =
		marketStructure.bias === 'BEARISH' ? 'LH' : marketStructure.bias === 'BULLISH' ? 'HL' : null;

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

function getChochDirection(bias: MarketBias): Exclude<MarketBias, 'NEUTRAL'> | null {
	if (bias === 'BEARISH') {
		return 'BULLISH';
	}

	if (bias === 'BULLISH') {
		return 'BEARISH';
	}

	return null;
}

function isCloseBeyondLevel(
	closePrice: number,
	level: MarketStructurePoint,
	direction: Exclude<MarketBias, 'NEUTRAL'>
): boolean {
	return direction === 'BULLISH' ? closePrice > level.price : closePrice < level.price;
}

function assertCompatibleInput(
	state: ChochState,
	candle: Candle,
	marketStructure: MarketStructureState
): void {
	if (state.symbol !== null && state.symbol !== candle.symbol) {
		throw new ChochError(`Cannot process ${candle.symbol} candle in ${state.symbol} CHoCH state.`);
	}

	if (state.timeframe !== null && state.timeframe !== candle.timeframe) {
		throw new ChochError(
			`Cannot process ${candle.timeframe} candle in ${state.timeframe} CHoCH state.`
		);
	}

	if (marketStructure.symbol !== null && marketStructure.symbol !== candle.symbol) {
		throw new ChochError(
			`Candle symbol ${candle.symbol} does not match structure symbol ${marketStructure.symbol}.`
		);
	}

	if (marketStructure.timeframe !== null && marketStructure.timeframe !== candle.timeframe) {
		throw new ChochError(
			`Candle timeframe ${candle.timeframe} does not match structure timeframe ${marketStructure.timeframe}.`
		);
	}

	if (
		state.lastProcessedTimestamp !== null &&
		candle.closeTimestamp <= state.lastProcessedTimestamp
	) {
		throw new ChochError('Closed candles must be processed once in chronological order.');
	}

	if (
		marketStructure.lastProcessedTimestamp !== null &&
		marketStructure.lastProcessedTimestamp > candle.closeTimestamp
	) {
		throw new ChochError('Market structure contains a swing not yet confirmed by this candle.');
	}
}
