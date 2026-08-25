import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import type { DisplacementEvent } from './displacement-engine.js';
import type { StructureBreak } from './models.js';
import {
	createOrderBlockState,
	OrderBlockError,
	processOrderBlockCandle,
	type OrderBlockState
} from './order-block-engine.js';

function candle(minute: number, open: number, high: number, low: number, close: number): Candle {
	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp: minute * 60_000,
		closeTimestamp: minute * 60_000 + 59_999,
		open,
		high,
		low,
		close,
		volume: 1,
		closed: true
	};
}

function displacement(source: Candle, direction: 'BULLISH' | 'BEARISH'): DisplacementEvent {
	return {
		id: `d-${source.closeTimestamp}`,
		symbol: source.symbol,
		timeframe: source.timeframe,
		timestamp: source.closeTimestamp,
		direction,
		bodySize: Math.abs(source.close - source.open),
		atr: 2,
		threshold: 2.4
	};
}

function structureBreak(
	source: Candle,
	direction: 'BULLISH' | 'BEARISH',
	id = 'break-1'
): StructureBreak {
	return {
		id,
		timestamp: source.closeTimestamp,
		direction,
		type: 'BOS',
		brokenSwingId: 'swing',
		brokenLevel: 105,
		closePrice: source.close
	};
}

function seed(source: Candle): OrderBlockState {
	return processOrderBlockCandle(createOrderBlockState(), source, null, []).state;
}

describe('Order Block engine', () => {
	it('creates a bullish full-range block from the last bearish candle with a causal break', () => {
		const opposite = candle(0, 103, 105, 99, 100);
		const confirmation = candle(1, 100, 112, 100, 111);
		const result = processOrderBlockCandle(
			seed(opposite),
			confirmation,
			displacement(confirmation, 'BULLISH'),
			[structureBreak(confirmation, 'BULLISH')]
		);

		expect(result.createdBlocks[0]).toMatchObject({
			type: 'BULLISH',
			low: 99,
			high: 105,
			midpoint: 102,
			sourceCandleTimestamp: opposite.closeTimestamp,
			causalStructureBreakId: 'break-1',
			causalDisplacementId: `d-${confirmation.closeTimestamp}`,
			causalSequenceId: null,
			state: 'ACTIVE'
		});
	});

	it('does not label a random opposite candle without both matching causal events', () => {
		const opposite = candle(0, 103, 105, 99, 100);
		const confirmation = candle(1, 100, 112, 100, 111);
		const state = seed(opposite);

		expect(
			processOrderBlockCandle(state, confirmation, null, [structureBreak(confirmation, 'BULLISH')])
				.createdBlocks
		).toHaveLength(0);
		expect(
			processOrderBlockCandle(state, confirmation, displacement(confirmation, 'BULLISH'), [])
				.createdBlocks
		).toHaveLength(0);
		expect(
			processOrderBlockCandle(state, confirmation, displacement(confirmation, 'BULLISH'), [
				structureBreak(confirmation, 'BEARISH')
			]).createdBlocks
		).toHaveLength(0);
	});

	it('creates bearish blocks and applies mitigation then close-based invalidation', () => {
		const opposite = candle(0, 100, 106, 99, 105);
		const confirmation = candle(1, 105, 105, 92, 93);
		let state = processOrderBlockCandle(
			seed(opposite),
			confirmation,
			displacement(confirmation, 'BEARISH'),
			[structureBreak(confirmation, 'BEARISH')]
		).state;

		state = processOrderBlockCandle(state, candle(2, 95, 101, 94, 100), null, []).state;
		expect(state.blocks[0]?.state).toBe('MITIGATED');
		state = processOrderBlockCandle(state, candle(3, 104, 108, 103, 107), null, []).state;
		expect(state.blocks[0]?.state).toBe('INVALIDATED');
	});

	it('rejects future or non-chronological causal input', () => {
		const first = candle(0, 103, 105, 99, 100);
		const state = seed(first);
		expect(() => processOrderBlockCandle(state, first, null, [])).toThrow(OrderBlockError);
		const second = candle(1, 100, 112, 100, 111);
		expect(() =>
			processOrderBlockCandle(
				state,
				second,
				{ ...displacement(second, 'BULLISH'), timestamp: second.closeTimestamp + 1 },
				[]
			)
		).toThrow(OrderBlockError);
	});
});
