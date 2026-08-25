import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import { DEFAULT_SMC_STRATEGY_CONFIG } from './config.js';
import * as publicStrategy from './index.js';
import {
	CanonicalMinutePipelineError,
	createCanonicalMinutePipelineState,
	processCanonicalMinute
} from './canonical-minute-pipeline.js';

function minuteCandle(
	minute: number,
	values: Partial<Pick<Candle, 'open' | 'high' | 'low' | 'close' | 'volume'>> = {}
): Candle {
	const openTimestamp = minute * 60_000;
	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + 59_999,
		open: 100,
		high: 101,
		low: 99,
		close: 100,
		volume: 1,
		closed: true,
		...values
	};
}

describe('canonical 1m orchestration', () => {
	it('exposes only canonical orchestration as the public strategy candle path', () => {
		expect(publicStrategy).toHaveProperty('processCanonicalMinute');
		expect(publicStrategy).not.toHaveProperty('processSmcClosedCandle');
		expect(publicStrategy).not.toHaveProperty('createSmcClosedCandleState');
		expect(publicStrategy).not.toHaveProperty('processStrategySignal');
	});

	it('derives exact 5m OHLCV and processes it before the same-close 1m candle', () => {
		const source = [
			minuteCandle(0, { open: 100, high: 102, low: 99, close: 101, volume: 1 }),
			minuteCandle(1, { open: 101, high: 104, low: 100, close: 103, volume: 2 }),
			minuteCandle(2, { open: 103, high: 105, low: 98, close: 99, volume: 3 }),
			minuteCandle(3, { open: 99, high: 100, low: 97, close: 98, volume: 4 }),
			minuteCandle(4, { open: 98, high: 103, low: 96, close: 102, volume: 5 })
		];
		let state = createCanonicalMinutePipelineState(DEFAULT_SMC_STRATEGY_CONFIG);
		let processed: readonly Candle[] = [];

		for (const candle of source) {
			const result = processCanonicalMinute(state, candle, DEFAULT_SMC_STRATEGY_CONFIG);
			state = result.state;
			processed = result.processedCandles;
		}

		expect(processed).toEqual([
			{
				symbol: 'BTCUSDT',
				timeframe: '5m',
				openTimestamp: 0,
				closeTimestamp: 299_999,
				open: 100,
				high: 105,
				low: 96,
				close: 102,
				volume: 15,
				closed: true
			},
			source[4]
		]);
		expect(state.pipeline.timeframes['5m'].processedCandles).toBe(1);
		expect(state.pipeline.timeframes['1m'].processedCandles).toBe(5);
		expect(state.pipeline.processedCandles).toBe(6);
		expect(state.derivedFiveMinuteCandles).toBe(1);
		expect(state.pendingFiveMinuteSource).toEqual([]);
	});

	it('rejects non-1m, open, duplicate, and reverse-time direct input', () => {
		const initial = createCanonicalMinutePipelineState(DEFAULT_SMC_STRATEGY_CONFIG);
		const first = minuteCandle(0);
		const afterFirst = processCanonicalMinute(initial, first, DEFAULT_SMC_STRATEGY_CONFIG).state;
		const state = processCanonicalMinute(
			afterFirst,
			minuteCandle(1),
			DEFAULT_SMC_STRATEGY_CONFIG
		).state;

		expect(() =>
			processCanonicalMinute(
				initial,
				{ ...first, timeframe: '5m', closeTimestamp: 299_999 },
				DEFAULT_SMC_STRATEGY_CONFIG
			)
		).toThrow(CanonicalMinutePipelineError);
		expect(() =>
			processCanonicalMinute(initial, { ...first, closed: false }, DEFAULT_SMC_STRATEGY_CONFIG)
		).toThrow(CanonicalMinutePipelineError);
		expect(() =>
			processCanonicalMinute(afterFirst, first, DEFAULT_SMC_STRATEGY_CONFIG)
		).toThrowError(
			expect.objectContaining<Partial<CanonicalMinutePipelineError>>({
				code: 'DUPLICATE_CANDLE'
			})
		);
		expect(() =>
			processCanonicalMinute(state, minuteCandle(0), DEFAULT_SMC_STRATEGY_CONFIG)
		).toThrowError(
			expect.objectContaining<Partial<CanonicalMinutePipelineError>>({
				code: 'OUT_OF_ORDER_CANDLE'
			})
		);
	});

	it('fails before strategy mutation when an expected minute is missing', () => {
		const initial = createCanonicalMinutePipelineState(DEFAULT_SMC_STRATEGY_CONFIG);
		const state = processCanonicalMinute(
			initial,
			minuteCandle(0),
			DEFAULT_SMC_STRATEGY_CONFIG
		).state;
		const beforeGap = structuredClone(state);

		expect(() =>
			processCanonicalMinute(state, minuteCandle(2), DEFAULT_SMC_STRATEGY_CONFIG)
		).toThrowError(
			expect.objectContaining<Partial<CanonicalMinutePipelineError>>({ code: 'DATA_GAP' })
		);
		expect(state).toEqual(beforeGap);
		expect(state.pipeline.timeframes['1m'].processedCandles).toBe(1);
	});
});
