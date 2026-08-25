import { assertValidCandle, type Candle, type Timeframe } from '../market/index.js';
import type { DisplacementEvent } from './displacement-engine.js';
import type { OrderBlock, StructureBreak } from './models.js';

export interface OrderBlockState {
	symbol: string | null;
	timeframe: Timeframe | null;
	blocks: readonly OrderBlock[];
	lastBullishCandle: Candle | null;
	lastBearishCandle: Candle | null;
	processedStructureBreakIds: readonly string[];
	lastProcessedTimestamp: number | null;
}

export interface OrderBlockProcessingResult {
	state: OrderBlockState;
	createdBlocks: readonly OrderBlock[];
	updatedBlocks: readonly OrderBlock[];
}

export class OrderBlockError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'OrderBlockError';
	}
}

export function createOrderBlockState(): OrderBlockState {
	return {
		symbol: null,
		timeframe: null,
		blocks: [],
		lastBullishCandle: null,
		lastBearishCandle: null,
		processedStructureBreakIds: [],
		lastProcessedTimestamp: null
	};
}

/**
 * Creates an Order Block only when this closed candle confirms both matching
 * displacement and a matching BOS/CHoCH. The source is the prior opposite candle.
 */
export function processOrderBlockCandle(
	state: OrderBlockState,
	candle: Candle,
	displacement: DisplacementEvent | null,
	structureBreaks: readonly StructureBreak[]
): OrderBlockProcessingResult {
	if (!candle.closed) {
		return { state, createdBlocks: [], updatedBlocks: [] };
	}

	assertValidCandle(candle);
	assertCompatibleInput(state, candle, displacement, structureBreaks);

	const updatedBlocks: OrderBlock[] = [];
	const existingBlocks = state.blocks.map((block) => {
		const updated = updateBlock(block, candle);
		if (updated !== block) updatedBlocks.push(updated);
		return updated;
	});
	const eligibleBreaks = displacement
		? structureBreaks.filter(
				(structureBreak) =>
					structureBreak.timestamp === candle.closeTimestamp &&
					structureBreak.direction === displacement.direction &&
					!state.processedStructureBreakIds.includes(structureBreak.id)
			)
		: [];
	const sourceCandle =
		displacement?.direction === 'BULLISH'
			? state.lastBearishCandle
			: displacement?.direction === 'BEARISH'
				? state.lastBullishCandle
				: null;
	const createdBlocks = sourceCandle
		? eligibleBreaks.map((structureBreak) =>
				createBlock(displacement!, sourceCandle, candle, structureBreak)
			)
		: [];
	const processedStructureBreakIds = [
		...state.processedStructureBreakIds,
		...eligibleBreaks.map(({ id }) => id)
	];

	return {
		state: {
			symbol: state.symbol ?? candle.symbol,
			timeframe: state.timeframe ?? candle.timeframe,
			blocks: [...existingBlocks, ...createdBlocks],
			lastBullishCandle: candle.close > candle.open ? candle : state.lastBullishCandle,
			lastBearishCandle: candle.close < candle.open ? candle : state.lastBearishCandle,
			processedStructureBreakIds,
			lastProcessedTimestamp: candle.closeTimestamp
		},
		createdBlocks,
		updatedBlocks
	};
}

function createBlock(
	displacement: DisplacementEvent,
	source: Candle,
	confirmation: Candle,
	structureBreak: StructureBreak
): OrderBlock {
	return {
		id: JSON.stringify([
			'ORDER_BLOCK',
			confirmation.symbol,
			confirmation.timeframe,
			confirmation.closeTimestamp,
			structureBreak.id
		]),
		type: displacement.direction,
		createdAt: confirmation.closeTimestamp,
		sourceCandleTimestamp: source.closeTimestamp,
		high: source.high,
		low: source.low,
		midpoint: (source.high + source.low) / 2,
		state: 'ACTIVE',
		causalStructureBreakId: structureBreak.id,
		causalDisplacementId: displacement.id,
		causalSequenceId: null
	};
}

function updateBlock(block: OrderBlock, candle: Candle): OrderBlock {
	if (block.state === 'INVALIDATED') return block;

	if (
		(block.type === 'BULLISH' && candle.close < block.low) ||
		(block.type === 'BEARISH' && candle.close > block.high)
	) {
		return { ...block, state: 'INVALIDATED' };
	}

	if (block.state === 'ACTIVE' && candle.low <= block.high && candle.high >= block.low) {
		return { ...block, state: 'MITIGATED' };
	}

	return block;
}

function assertCompatibleInput(
	state: OrderBlockState,
	candle: Candle,
	displacement: DisplacementEvent | null,
	structureBreaks: readonly StructureBreak[]
): void {
	if (state.symbol !== null && state.symbol !== candle.symbol) {
		throw new OrderBlockError(
			`Cannot process ${candle.symbol} candle in ${state.symbol} Order Block state.`
		);
	}
	if (state.timeframe !== null && state.timeframe !== candle.timeframe) {
		throw new OrderBlockError(
			`Cannot process ${candle.timeframe} candle in ${state.timeframe} Order Block state.`
		);
	}
	if (
		state.lastProcessedTimestamp !== null &&
		candle.closeTimestamp <= state.lastProcessedTimestamp
	) {
		throw new OrderBlockError('Closed candles must be processed once in chronological order.');
	}
	if (
		displacement &&
		(displacement.timestamp !== candle.closeTimestamp ||
			displacement.symbol !== candle.symbol ||
			displacement.timeframe !== candle.timeframe)
	) {
		throw new OrderBlockError('Displacement must be confirmed by the candle being processed.');
	}
	for (const structureBreak of structureBreaks) {
		if (structureBreak.timestamp > candle.closeTimestamp) {
			throw new OrderBlockError('Structure input contains a future-confirmed event.');
		}
	}
	if (
		state.blocks.some(
			(block) =>
				block.createdAt > candle.closeTimestamp ||
				block.sourceCandleTimestamp > candle.closeTimestamp
		) ||
		(state.lastBullishCandle?.closeTimestamp ?? 0) > candle.closeTimestamp ||
		(state.lastBearishCandle?.closeTimestamp ?? 0) > candle.closeTimestamp
	) {
		throw new OrderBlockError('Order Block state contains future-confirmed information.');
	}
}
