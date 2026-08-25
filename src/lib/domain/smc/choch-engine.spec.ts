import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import { createBosState, processBosCandle } from './bos-engine.js';
import { ChochError, createChochState, processChochCandle } from './choch-engine.js';
import {
	createMarketStructureState,
	processConfirmedSwing,
	type MarketStructureState
} from './market-structure-engine.js';
import type { SwingPoint } from './models.js';

function swing(
	id: string,
	type: SwingPoint['type'],
	price: number,
	confirmedBucket: number
): SwingPoint {
	return {
		id,
		symbol: 'BTCUSDT',
		timeframe: '5m',
		sourceIndex: confirmedBucket - 2,
		sourceTimestamp: (confirmedBucket - 2) * 300_000,
		confirmedTimestamp: confirmedBucket * 300_000 - 1,
		price,
		type,
		strength: 2
	};
}

function candle(
	bucket: number,
	values: { open: number; high: number; low: number; close: number; closed?: boolean }
): Candle {
	const openTimestamp = bucket * 300_000;

	return {
		symbol: 'BTCUSDT',
		timeframe: '5m',
		openTimestamp,
		closeTimestamp: openTimestamp + 299_999,
		open: values.open,
		high: values.high,
		low: values.low,
		close: values.close,
		volume: 1,
		closed: values.closed ?? true
	};
}

function bullishStructure(): MarketStructureState {
	return [
		swing('high-1', 'HIGH', 100, 2),
		swing('low-1', 'LOW', 90, 3),
		swing('high-2', 'HIGH', 110, 4),
		swing('low-2', 'LOW', 95, 5)
	].reduce(processConfirmedSwing, createMarketStructureState());
}

function bearishStructure(): MarketStructureState {
	return [
		swing('high-1', 'HIGH', 110, 2),
		swing('low-1', 'LOW', 100, 3),
		swing('high-2', 'HIGH', 105, 4),
		swing('low-2', 'LOW', 90, 5)
	].reduce(processConfirmedSwing, createMarketStructureState());
}

describe('CHoCH engine', () => {
	it('emits bullish CHoCH above the latest LH only under prior bearish bias', () => {
		const structure = bearishStructure();
		const breakingCandle = candle(5, { open: 104, high: 108, low: 103, close: 106 });
		const choch = processChochCandle(createChochState(), breakingCandle, structure);
		const bos = processBosCandle(createBosState(), breakingCandle, structure);

		expect(choch.structureBreak).toEqual({
			id: '["CHOCH","BTCUSDT","5m",1799999,"high-2","BULLISH"]',
			timestamp: 1_799_999,
			direction: 'BULLISH',
			type: 'CHOCH',
			brokenSwingId: 'high-2',
			brokenLevel: 105,
			closePrice: 106
		});
		expect(choch.marketStructure.bias).toBe('BULLISH');
		expect(bos.structureBreak).toBeNull();
	});

	it('emits bearish CHoCH below the latest HL only under prior bullish bias', () => {
		const structure = bullishStructure();
		const breakingCandle = candle(5, { open: 96, high: 97, low: 92, close: 94 });
		const choch = processChochCandle(createChochState(), breakingCandle, structure);
		const bos = processBosCandle(createBosState(), breakingCandle, structure);

		expect(choch.structureBreak).toEqual(
			expect.objectContaining({
				direction: 'BEARISH',
				type: 'CHOCH',
				brokenSwingId: 'low-2',
				brokenLevel: 95,
				closePrice: 94
			})
		);
		expect(choch.marketStructure.bias).toBe('BEARISH');
		expect(bos.structureBreak).toBeNull();
	});

	it('keeps continuation breaks classified as BOS rather than CHoCH', () => {
		const bullish = bullishStructure();
		const continuation = candle(5, { open: 109, high: 113, low: 108, close: 111 });
		const bos = processBosCandle(createBosState(), continuation, bullish);
		const choch = processChochCandle(createChochState(), continuation, bullish);

		expect(bos.structureBreak?.type).toBe('BOS');
		expect(bos.structureBreak?.brokenSwingId).toBe('high-2');
		expect(choch.structureBreak).toBeNull();
		expect(choch.marketStructure).toBe(bullish);
	});

	it('rejects wick-only penetration and close equality', () => {
		const structure = bearishStructure();
		const wickOnly = processChochCandle(
			createChochState(),
			candle(5, { open: 103, high: 107, low: 102, close: 104 }),
			structure
		);
		const equalClose = processChochCandle(
			wickOnly.state,
			candle(6, { open: 104, high: 107, low: 103, close: 105 }),
			structure
		);

		expect(wickOnly.structureBreak).toBeNull();
		expect(equalClose.structureBreak).toBeNull();
		expect(equalClose.marketStructure.bias).toBe('BEARISH');
	});

	it('requires an opposite bias and ignores unclosed candles', () => {
		const neutral = createMarketStructureState();
		const neutralResult = processChochCandle(
			createChochState(),
			candle(5, { open: 100, high: 110, low: 90, close: 109 }),
			neutral
		);
		const structure = bearishStructure();
		const openResult = processChochCandle(
			createChochState(),
			candle(5, { open: 104, high: 108, low: 103, close: 106, closed: false }),
			structure
		);

		expect(neutralResult.structureBreak).toBeNull();
		expect(neutralResult.marketStructure.bias).toBe('NEUTRAL');
		expect(openResult).toEqual({
			state: createChochState(),
			marketStructure: structure,
			structureBreak: null
		});
	});

	it('consumes a CHoCH level and does not emit it repeatedly', () => {
		const structure = bearishStructure();
		const first = processChochCandle(
			createChochState(),
			candle(5, { open: 104, high: 108, low: 103, close: 106 }),
			structure
		);
		const repeated = processChochCandle(
			first.state,
			candle(6, { open: 106, high: 109, low: 105, close: 108 }),
			structure
		);

		expect(first.state.consumedSwingIds).toEqual(['high-2']);
		expect(repeated.structureBreak).toBeNull();
		expect(repeated.state.consumedSwingIds).toEqual(['high-2']);
	});

	it('rejects future structure and duplicate or out-of-order closed candles', () => {
		const structure = bearishStructure();
		const firstCandle = candle(5, { open: 103, high: 104, low: 102, close: 103 });
		const first = processChochCandle(createChochState(), firstCandle, structure);
		const futureStructure = processConfirmedSwing(structure, swing('future-high', 'HIGH', 108, 8));

		expect(() => processChochCandle(first.state, firstCandle, structure)).toThrow(ChochError);
		expect(() =>
			processChochCandle(
				createChochState(),
				candle(6, { open: 103, high: 104, low: 102, close: 103 }),
				futureStructure
			)
		).toThrow(ChochError);
	});
});
