import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import {
	AtrError,
	calculateTrueRange,
	createAtrState,
	processAtrCandle,
	type AtrState
} from './atr-engine.js';

function candle(
	minute: number,
	values: { open: number; high: number; low: number; close: number; closed?: boolean }
): Candle {
	const openTimestamp = minute * 60_000;

	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + 59_999,
		open: values.open,
		high: values.high,
		low: values.low,
		close: values.close,
		volume: 1,
		closed: values.closed ?? true
	};
}

function replay(candles: readonly Candle[], period: number): AtrState {
	return candles.reduce(
		(state, currentCandle) => processAtrCandle(state, currentCandle).state,
		createAtrState({ period })
	);
}

describe('ATR engine', () => {
	it.each([
		{ name: 'first candle', high: 12, low: 9, previousClose: null, expected: 3 },
		{ name: 'intrabar range', high: 12, low: 9, previousClose: 10, expected: 3 },
		{ name: 'gap up', high: 15, low: 13, previousClose: 10, expected: 5 },
		{ name: 'gap down', high: 9, low: 7, previousClose: 12, expected: 5 }
	])('calculates True Range for $name', ({ high, low, previousClose, expected }) => {
		expect(calculateTrueRange({ high, low }, previousClose)).toBe(expected);
	});

	it('returns no ATR before the configured seed period is complete', () => {
		const first = processAtrCandle(
			createAtrState({ period: 3 }),
			candle(0, { open: 9, high: 10, low: 8, close: 9 })
		);
		const second = processAtrCandle(
			first.state,
			candle(1, { open: 10, high: 12, low: 9, close: 11 })
		);

		expect(first.value).toEqual({ timestamp: 59_999, trueRange: 2, atr: null });
		expect(second.value).toEqual({ timestamp: 119_999, trueRange: 3, atr: null });
		expect(second.state.atr).toBeNull();
		expect(second.state.seedTrueRanges).toEqual([2, 3]);
	});

	it('seeds with SMA and then applies Wilder smoothing', () => {
		const candles = [
			candle(0, { open: 9, high: 10, low: 8, close: 9 }),
			candle(1, { open: 10, high: 12, low: 9, close: 11 }),
			candle(2, { open: 13, high: 15, low: 12, close: 14 }),
			candle(3, { open: 15, high: 19, low: 14, close: 18 }),
			candle(4, { open: 17, high: 18, low: 16, close: 17 })
		];
		let state = createAtrState({ period: 3 });
		const values = candles.map((currentCandle) => {
			const result = processAtrCandle(state, currentCandle);
			state = result.state;
			return result.value;
		});

		expect(values.map((value) => value?.trueRange)).toEqual([2, 3, 4, 5, 2]);
		expect(values[2]?.atr).toBe(3);
		expect(values[3]?.atr).toBeCloseTo(11 / 3, 12);
		expect(values[4]?.atr).toBeCloseTo(28 / 9, 12);
		expect(state.seedTrueRanges).toEqual([2, 3, 4]);
	});

	it('uses the configured period, including period one', () => {
		const source = [
			candle(0, { open: 9, high: 10, low: 8, close: 9 }),
			candle(1, { open: 10, high: 12, low: 9, close: 11 })
		];
		const periodOne = replay(source, 1);
		const periodTwo = replay(source, 2);

		expect(periodOne.atr).toBe(3);
		expect(periodTwo.atr).toBe(2.5);
	});

	it('ignores unclosed candles without changing the previous-close chain', () => {
		const initial = createAtrState({ period: 2 });
		const openCandle = candle(0, { open: 9, high: 10, low: 8, close: 9, closed: false });
		const ignored = processAtrCandle(initial, openCandle);
		const firstClosed = processAtrCandle(
			ignored.state,
			candle(1, { open: 10, high: 12, low: 9, close: 11 })
		);

		expect(ignored).toEqual({ state: initial, value: null });
		expect(firstClosed.value?.trueRange).toBe(3);
		expect(firstClosed.state.processedCandles).toBe(1);
		expect(firstClosed.state.atr).toBeNull();
	});

	it('rejects invalid periods, duplicate candles, and cross-market input', () => {
		expect(() => createAtrState({ period: 0 })).toThrow(RangeError);
		expect(() => createAtrState({ period: 1.5 })).toThrow(RangeError);

		const firstCandle = candle(0, { open: 9, high: 10, low: 8, close: 9 });
		const first = processAtrCandle(createAtrState({ period: 2 }), firstCandle);
		expect(() => processAtrCandle(first.state, firstCandle)).toThrow(AtrError);

		const otherSymbol = {
			...candle(1, { open: 10, high: 12, low: 9, close: 11 }),
			symbol: 'ETHUSDT'
		};
		expect(() => processAtrCandle(first.state, otherSymbol)).toThrow(AtrError);
	});
});
