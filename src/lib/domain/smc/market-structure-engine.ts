import type { Timeframe } from '../market/index.js';
import type { MarketBias, MarketStructurePoint, StructureType, SwingPoint } from './models.js';

export interface MarketStructureState {
	symbol: string | null;
	timeframe: Timeframe | null;
	bias: MarketBias;
	sequence: readonly MarketStructurePoint[];
	lastHigh: SwingPoint | null;
	lastLow: SwingPoint | null;
	latestHighStructure: 'HH' | 'LH' | null;
	latestLowStructure: 'HL' | 'LL' | null;
	lastProcessedTimestamp: number | null;
}

export class MarketStructureError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MarketStructureError';
	}
}

export function createMarketStructureState(): MarketStructureState {
	return {
		symbol: null,
		timeframe: null,
		bias: 'NEUTRAL',
		sequence: [],
		lastHigh: null,
		lastLow: null,
		latestHighStructure: null,
		latestLowStructure: null,
		lastProcessedTimestamp: null
	};
}

/**
 * Advances structure using one already-confirmed swing. The structure point is
 * timestamped at confirmation, never at the earlier source candle.
 */
export function processConfirmedSwing(
	state: MarketStructureState,
	swing: SwingPoint
): MarketStructureState {
	assertCompatibleSwing(state, swing);

	const previousSwing = swing.type === 'HIGH' ? state.lastHigh : state.lastLow;
	const structure = previousSwing ? classifySwing(previousSwing, swing) : null;
	const structurePoint = structure ? createStructurePoint(swing, structure) : null;
	const latestHighStructure =
		swing.type === 'HIGH' && structure ? asHighStructure(structure) : state.latestHighStructure;
	const latestLowStructure =
		swing.type === 'LOW' && structure ? asLowStructure(structure) : state.latestLowStructure;

	return {
		symbol: state.symbol ?? swing.symbol,
		timeframe: state.timeframe ?? swing.timeframe,
		bias: deriveMarketBias(latestHighStructure, latestLowStructure),
		sequence: structurePoint ? [...state.sequence, structurePoint] : state.sequence,
		lastHigh: swing.type === 'HIGH' ? swing : state.lastHigh,
		lastLow: swing.type === 'LOW' ? swing : state.lastLow,
		latestHighStructure,
		latestLowStructure,
		lastProcessedTimestamp: swing.confirmedTimestamp
	};
}

function classifySwing(previousSwing: SwingPoint, currentSwing: SwingPoint): StructureType | null {
	if (currentSwing.price > previousSwing.price) {
		return currentSwing.type === 'HIGH' ? 'HH' : 'HL';
	}

	if (currentSwing.price < previousSwing.price) {
		return currentSwing.type === 'HIGH' ? 'LH' : 'LL';
	}

	return null;
}

function createStructurePoint(swing: SwingPoint, structure: StructureType): MarketStructurePoint {
	return {
		swingId: swing.id,
		timestamp: swing.confirmedTimestamp,
		price: swing.price,
		structure
	};
}

function deriveMarketBias(
	highStructure: MarketStructureState['latestHighStructure'],
	lowStructure: MarketStructureState['latestLowStructure']
): MarketBias {
	if (highStructure === 'HH' && lowStructure === 'HL') {
		return 'BULLISH';
	}

	if (highStructure === 'LH' && lowStructure === 'LL') {
		return 'BEARISH';
	}

	return 'NEUTRAL';
}

function asHighStructure(structure: StructureType): 'HH' | 'LH' {
	if (structure !== 'HH' && structure !== 'LH') {
		throw new MarketStructureError(`Expected high structure, received ${structure}.`);
	}

	return structure;
}

function asLowStructure(structure: StructureType): 'HL' | 'LL' {
	if (structure !== 'HL' && structure !== 'LL') {
		throw new MarketStructureError(`Expected low structure, received ${structure}.`);
	}

	return structure;
}

function assertCompatibleSwing(state: MarketStructureState, swing: SwingPoint): void {
	if (state.symbol !== null && state.symbol !== swing.symbol) {
		throw new MarketStructureError(
			`Cannot process ${swing.symbol} swing in ${state.symbol} structure state.`
		);
	}

	if (state.timeframe !== null && state.timeframe !== swing.timeframe) {
		throw new MarketStructureError(
			`Cannot process ${swing.timeframe} swing in ${state.timeframe} structure state.`
		);
	}

	if (
		state.lastProcessedTimestamp !== null &&
		swing.confirmedTimestamp < state.lastProcessedTimestamp
	) {
		throw new MarketStructureError('Confirmed swings must be processed chronologically.');
	}

	if (swing.confirmedTimestamp < swing.sourceTimestamp) {
		throw new MarketStructureError('Swing confirmation cannot precede its source timestamp.');
	}
}
