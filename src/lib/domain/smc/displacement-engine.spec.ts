import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import { detectDisplacement, DisplacementError } from './displacement-engine.js';

function candle(open: number, close: number, closed = true): Candle {
	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp: 0,
		closeTimestamp: 59_999,
		open,
		high: Math.max(open, close) + 1,
		low: Math.min(open, close) - 1,
		close,
		volume: 1,
		closed
	};
}

describe('displacement engine', () => {
	it('detects bullish and bearish bodies above the configured ATR threshold', () => {
		expect(detectDisplacement(candle(100, 113), 10, { atrMultiplier: 1.2 })).toMatchObject({
			direction: 'BULLISH',
			bodySize: 13,
			threshold: 12
		});
		expect(detectDisplacement(candle(113, 100), 10, { atrMultiplier: 1.2 })).toMatchObject({
			direction: 'BEARISH',
			bodySize: 13,
			threshold: 12
		});
	});

	it('uses a strict greater-than threshold at the boundary', () => {
		expect(detectDisplacement(candle(100, 112), 10, { atrMultiplier: 1.2 })).toBeNull();
		expect(detectDisplacement(candle(100, 112.000_001), 10, { atrMultiplier: 1.2 })).not.toBeNull();
	});

	it('uses the supplied multiplier rather than a hidden default', () => {
		const source = candle(100, 111);

		expect(detectDisplacement(source, 10, { atrMultiplier: 1 })).not.toBeNull();
		expect(detectDisplacement(source, 10, { atrMultiplier: 1.2 })).toBeNull();
	});

	it('ignores open candles and unavailable ATR values', () => {
		expect(detectDisplacement(candle(100, 120, false), 10, { atrMultiplier: 1.2 })).toBeNull();
		expect(detectDisplacement(candle(100, 120), null, { atrMultiplier: 1.2 })).toBeNull();
	});

	it('rejects invalid configuration and invalid available ATR values', () => {
		expect(() => detectDisplacement(candle(100, 120), 10, { atrMultiplier: 0 })).toThrow(
			RangeError
		);
		expect(() => detectDisplacement(candle(100, 120), 0, { atrMultiplier: 1.2 })).toThrow(
			DisplacementError
		);
	});
});
