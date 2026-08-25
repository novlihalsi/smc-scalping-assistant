import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import {
	createMarketStructureState,
	processConfirmedSwing,
	type MarketStructureState
} from './market-structure-engine.js';
import type { SwingPoint } from './models.js';
import { BosError, createBosState, processBosCandle } from './bos-engine.js';

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

describe('BOS engine', () => {
	it('emits bullish BOS only when a closed candle closes above the latest HH', () => {
		const structure = bullishStructure();
		const wickOnly = candle(5, { open: 108, high: 112, low: 107, close: 109 });
		const closeBeyond = candle(6, { open: 109, high: 113, low: 108, close: 111 });
		const wickResult = processBosCandle(createBosState(), wickOnly, structure);
		const result = processBosCandle(wickResult.state, closeBeyond, structure);

		expect(wickResult.structureBreak).toBeNull();
		expect(result.structureBreak).toEqual({
			id: '["BOS","BTCUSDT","5m",2099999,"high-2","BULLISH"]',
			timestamp: 2_099_999,
			direction: 'BULLISH',
			type: 'BOS',
			brokenSwingId: 'high-2',
			brokenLevel: 110,
			closePrice: 111
		});
	});

	it('emits bearish BOS only when a closed candle closes below the latest LL', () => {
		const structure = bearishStructure();
		const wickOnly = candle(5, { open: 92, high: 93, low: 88, close: 91 });
		const closeBeyond = candle(6, { open: 91, high: 92, low: 87, close: 89 });
		const wickResult = processBosCandle(createBosState(), wickOnly, structure);
		const result = processBosCandle(wickResult.state, closeBeyond, structure);

		expect(wickResult.structureBreak).toBeNull();
		expect(result.structureBreak).toEqual(
			expect.objectContaining({
				direction: 'BEARISH',
				type: 'BOS',
				brokenSwingId: 'low-2',
				brokenLevel: 90,
				closePrice: 89
			})
		);
	});

	it('does not emit the same structural level more than once', () => {
		const structure = bullishStructure();
		const first = processBosCandle(
			createBosState(),
			candle(5, { open: 109, high: 112, low: 108, close: 111 }),
			structure
		);
		const repeated = processBosCandle(
			first.state,
			candle(6, { open: 111, high: 114, low: 110, close: 113 }),
			structure
		);

		expect(first.structureBreak).not.toBeNull();
		expect(first.state.consumedSwingIds).toEqual(['high-2']);
		expect(repeated.structureBreak).toBeNull();
		expect(repeated.state.consumedSwingIds).toEqual(['high-2']);
	});

	it('uses the latest relevant structural level', () => {
		const initial = bullishStructure();
		const withNewHigh = processConfirmedSwing(initial, swing('high-3', 'HIGH', 120, 6));
		const stillBelowLatest = candle(6, { open: 112, high: 119, low: 111, close: 115 });

		const result = processBosCandle(createBosState(), stillBelowLatest, withNewHigh);

		expect(withNewHigh.bias).toBe('BULLISH');
		expect(result.structureBreak).toBeNull();
	});

	it('rejects close equality, neutral bias, and unclosed candles', () => {
		const structure = bullishStructure();
		const equalClose = processBosCandle(
			createBosState(),
			candle(5, { open: 109, high: 111, low: 108, close: 110 }),
			structure
		);
		const neutralStructure = createMarketStructureState();
		const neutral = processBosCandle(
			createBosState(),
			candle(5, { open: 110, high: 120, low: 109, close: 119 }),
			neutralStructure
		);
		const openCandle = processBosCandle(
			createBosState(),
			candle(5, { open: 109, high: 113, low: 108, close: 112, closed: false }),
			structure
		);

		expect(equalClose.structureBreak).toBeNull();
		expect(neutral.structureBreak).toBeNull();
		expect(openCandle).toEqual({ state: createBosState(), structureBreak: null });
	});

	it('can emit for a newly confirmed level after consuming an earlier level', () => {
		const initial = bullishStructure();
		const first = processBosCandle(
			createBosState(),
			candle(5, { open: 109, high: 112, low: 108, close: 111 }),
			initial
		);
		const withNewHigh = processConfirmedSwing(initial, swing('high-3', 'HIGH', 120, 7));
		const second = processBosCandle(
			first.state,
			candle(8, { open: 119, high: 122, low: 118, close: 121 }),
			withNewHigh
		);

		expect(second.structureBreak).toEqual(
			expect.objectContaining({ brokenSwingId: 'high-3', brokenLevel: 120 })
		);
		expect(second.state.consumedSwingIds).toEqual(['high-2', 'high-3']);
	});

	it('rejects future structure and duplicate or out-of-order closed candles', () => {
		const structure = bullishStructure();
		const firstCandle = candle(5, { open: 108, high: 109, low: 107, close: 108 });
		const first = processBosCandle(createBosState(), firstCandle, structure);
		const futureStructure = processConfirmedSwing(structure, swing('future-high', 'HIGH', 120, 8));

		expect(() => processBosCandle(first.state, firstCandle, structure)).toThrow(BosError);
		expect(() =>
			processBosCandle(
				createBosState(),
				candle(6, { open: 108, high: 109, low: 107, close: 108 }),
				futureStructure
			)
		).toThrow(BosError);
	});
});
