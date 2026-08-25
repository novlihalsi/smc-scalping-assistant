import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import { DEFAULT_SMC_STRATEGY_CONFIG } from './config.js';
import { createSmcClosedCandlePipeline, processSmcClosedCandle } from './candle-pipeline.js';

function candle(openTimestamp: number, timeframe: '1m' | '5m', high: number): Candle {
	const duration = timeframe === '1m' ? 60_000 : 300_000;
	return {
		symbol: 'BTCUSDT',
		timeframe,
		openTimestamp,
		closeTimestamp: openTimestamp + duration - 1,
		open: 100,
		high,
		low: 95,
		close: 100,
		volume: 10,
		closed: true
	};
}

describe('shared closed-candle SMC pipeline', () => {
	it('processes chronological 1m and 5m candles through isolated timeframe state', () => {
		const pipeline = createSmcClosedCandlePipeline(DEFAULT_SMC_STRATEGY_CONFIG);
		let state = pipeline.createInitialState();
		state = pipeline.processClosedCandle(
			state,
			candle(0, '1m', 101),
			DEFAULT_SMC_STRATEGY_CONFIG
		).state;
		state = pipeline.processClosedCandle(
			state,
			candle(0, '5m', 102),
			DEFAULT_SMC_STRATEGY_CONFIG
		).state;

		expect(state.processedCandles).toBe(2);
		expect(state.timeframes['1m'].recentCandles).toHaveLength(1);
		expect(state.timeframes['5m'].recentCandles).toHaveLength(1);
		expect(state.timeframes['1m'].processedCandles).toBe(1);
		expect(state.timeframes['1m'].atr.processedCandles).toBe(1);
		expect(state.timeframes['5m'].atr.processedCandles).toBe(1);
	});

	it('confirms a rightBars swing only on the fifth closed candle', () => {
		const pipeline = createSmcClosedCandlePipeline(DEFAULT_SMC_STRATEGY_CONFIG);
		let state = pipeline.createInitialState();
		const highs = [101, 102, 110, 103, 102];

		for (let index = 0; index < highs.length; index += 1) {
			state = processSmcClosedCandle(
				state,
				candle(index * 60_000, '1m', highs[index]!),
				DEFAULT_SMC_STRATEGY_CONFIG
			).state;
			if (index < 4) expect(state.timeframes['1m'].marketStructure.lastHigh).toBeNull();
		}

		expect(state.timeframes['1m'].marketStructure.lastHigh).toMatchObject({
			sourceIndex: 2,
			confirmedTimestamp: 299_999
		});
	});

	it('rejects reverse-time candles before any domain state can be contaminated', () => {
		const pipeline = createSmcClosedCandlePipeline(DEFAULT_SMC_STRATEGY_CONFIG);
		const state = pipeline.processClosedCandle(
			pipeline.createInitialState(),
			candle(60_000, '1m', 102),
			DEFAULT_SMC_STRATEGY_CONFIG
		).state;

		expect(() =>
			pipeline.processClosedCandle(state, candle(0, '1m', 101), DEFAULT_SMC_STRATEGY_CONFIG)
		).toThrow(/non-decreasing close time/);
	});
});
