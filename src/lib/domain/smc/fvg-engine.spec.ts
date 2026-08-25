import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import { createFvgState, FvgError, processFvgCandle, type FvgState } from './fvg-engine.js';

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
		...values,
		volume: 1,
		closed: values.closed ?? true
	};
}

function replay(candles: readonly Candle[]): FvgState {
	return candles.reduce(
		(state, current) => processFvgCandle(state, current).state,
		createFvgState()
	);
}

describe('FVG engine', () => {
	it('creates a bullish gap only when the third closed candle confirms it', () => {
		const first = candle(0, { open: 100, high: 105, low: 99, close: 104 });
		const second = candle(1, { open: 104, high: 112, low: 103, close: 111 });
		const third = candle(2, { open: 108, high: 114, low: 107, close: 113 });
		const beforeConfirmation = replay([first, second]);
		const result = processFvgCandle(beforeConfirmation, third);

		expect(beforeConfirmation.gaps).toHaveLength(0);
		expect(result.createdGap).toMatchObject({
			type: 'BULLISH',
			sourceCandleTimestamps: [59_999, 119_999, 179_999],
			bottom: 105,
			top: 107,
			midpoint: 106,
			state: 'UNTOUCHED',
			createdAt: third.closeTimestamp,
			causalSequenceId: null,
			causalStructureBreakId: null,
			causalDisplacementId: null
		});
	});

	it('creates bearish gaps and rejects overlapping three-candle patterns', () => {
		const bearish = replay([
			candle(0, { open: 110, high: 112, low: 108, close: 109 }),
			candle(1, { open: 109, high: 110, low: 99, close: 100 }),
			candle(2, { open: 101, high: 106, low: 98, close: 99 })
		]);
		const noGap = replay([
			candle(0, { open: 100, high: 105, low: 99, close: 104 }),
			candle(1, { open: 104, high: 108, low: 102, close: 107 }),
			candle(2, { open: 107, high: 109, low: 105, close: 106 })
		]);

		expect(bearish.gaps[0]).toMatchObject({ type: 'BEARISH', bottom: 106, top: 108 });
		expect(noGap.gaps).toHaveLength(0);
	});

	it('updates mitigation sequentially without applying the creation candle', () => {
		let state = replay([
			candle(0, { open: 100, high: 105, low: 99, close: 104 }),
			candle(1, { open: 104, high: 112, low: 103, close: 111 }),
			candle(2, { open: 108, high: 114, low: 107, close: 113 })
		]);
		expect(state.gaps[0]?.state).toBe('UNTOUCHED');

		const partial = processFvgCandle(
			state,
			candle(3, { open: 110, high: 111, low: 106, close: 108 })
		);
		expect(partial.updatedGaps[0]?.state).toBe('PARTIALLY_FILLED');
		state = partial.state;

		const filled = processFvgCandle(
			state,
			candle(4, { open: 107, high: 108, low: 104, close: 105 })
		);
		expect(filled.updatedGaps[0]?.state).toBe('FILLED');
	});

	it('ignores open candles and enforces chronological, single-market input', () => {
		const initial = createFvgState();
		const open = candle(0, { open: 100, high: 105, low: 99, close: 104, closed: false });
		expect(processFvgCandle(initial, open).state).toBe(initial);

		const first = candle(1, { open: 100, high: 105, low: 99, close: 104 });
		const state = processFvgCandle(initial, first).state;
		expect(() => processFvgCandle(state, first)).toThrow(FvgError);
		expect(() =>
			processFvgCandle(state, {
				...candle(2, { open: 1, high: 2, low: 1, close: 2 }),
				symbol: 'ETHUSDT'
			})
		).toThrow(FvgError);
	});
});
