import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import { detectConfirmedSwings } from './swing-engine.js';
import type { LiquidityLevel, SwingPoint } from './models.js';
import {
	createLiquidityState,
	LiquidityDetectionError,
	processLiquiditySwing
} from './liquidity-engine.js';

const DEFAULT_CONFIG = { tolerancePercent: 0.1 } as const;

function swing(
	id: string,
	type: SwingPoint['type'],
	price: number,
	confirmedMinute: number
): SwingPoint {
	return {
		id,
		symbol: 'BTCUSDT',
		timeframe: '1m',
		sourceIndex: confirmedMinute - 2,
		sourceTimestamp: (confirmedMinute - 2) * 60_000,
		confirmedTimestamp: confirmedMinute * 60_000 - 1,
		price,
		type,
		strength: 2
	};
}

function minuteCandle(minute: number, high: number, low: number): Candle {
	const openTimestamp = minute * 60_000;
	const midpoint = (high + low) / 2;

	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + 59_999,
		open: midpoint,
		high,
		low,
		close: midpoint,
		volume: 1,
		closed: true
	};
}

describe('liquidity detection', () => {
	it('creates active buy-side and sell-side levels from confirmed swings', () => {
		const high = processLiquiditySwing(
			createLiquidityState(),
			swing('high-1', 'HIGH', 110, 2),
			DEFAULT_CONFIG
		);
		const low = processLiquiditySwing(high.state, swing('low-1', 'LOW', 90, 3), DEFAULT_CONFIG);

		expect(low.state.levels).toEqual([
			{
				id: '["LIQUIDITY","BTCUSDT","1m","high-1"]',
				type: 'BUY_SIDE',
				price: 110,
				createdAt: 119_999,
				source: 'SWING_HIGH',
				sourceSwingIds: ['high-1'],
				status: 'ACTIVE'
			},
			{
				id: '["LIQUIDITY","BTCUSDT","1m","low-1"]',
				type: 'SELL_SIDE',
				price: 90,
				createdAt: 179_999,
				source: 'SWING_LOW',
				sourceSwingIds: ['low-1'],
				status: 'ACTIVE'
			}
		]);
	});

	it('clusters equal highs within tolerance using the outer buy-side extreme', () => {
		const first = processLiquiditySwing(
			createLiquidityState(),
			swing('high-1', 'HIGH', 100, 2),
			DEFAULT_CONFIG
		);
		const equal = processLiquiditySwing(
			first.state,
			swing('high-2', 'HIGH', 100.09, 3),
			DEFAULT_CONFIG
		);

		expect(equal.state.levels).toEqual([
			{
				id: '["LIQUIDITY","BTCUSDT","1m","high-1"]',
				type: 'BUY_SIDE',
				price: 100.09,
				createdAt: 179_999,
				source: 'EQUAL_HIGH',
				sourceSwingIds: ['high-1', 'high-2'],
				status: 'ACTIVE'
			}
		]);
	});

	it('clusters equal lows within tolerance using the outer sell-side extreme', () => {
		const first = processLiquiditySwing(
			createLiquidityState(),
			swing('low-1', 'LOW', 100, 2),
			DEFAULT_CONFIG
		);
		const equal = processLiquiditySwing(
			first.state,
			swing('low-2', 'LOW', 99.91, 3),
			DEFAULT_CONFIG
		);

		expect(equal.liquidityLevel).toEqual(
			expect.objectContaining({
				type: 'SELL_SIDE',
				price: 99.91,
				source: 'EQUAL_LOW',
				sourceSwingIds: ['low-1', 'low-2']
			})
		);
	});

	it('uses an inclusive configurable percentage tolerance', () => {
		const firstSwing = swing('high-1', 'HIGH', 100, 2);
		const boundarySwing = swing('high-2', 'HIGH', 100.1, 3);
		const base = processLiquiditySwing(createLiquidityState(), firstSwing, DEFAULT_CONFIG);
		const inside = processLiquiditySwing(base.state, boundarySwing, DEFAULT_CONFIG);
		const strictBase = processLiquiditySwing(createLiquidityState(), firstSwing, {
			tolerancePercent: 0.05
		});
		const outside = processLiquiditySwing(strictBase.state, boundarySwing, {
			tolerancePercent: 0.05
		});

		expect(inside.state.levels).toHaveLength(1);
		expect(inside.state.levels[0]?.source).toBe('EQUAL_HIGH');
		expect(outside.state.levels).toHaveLength(2);
		expect(outside.state.levels.every(({ source }) => source === 'SWING_HIGH')).toBe(true);
	});

	it('extends one equal cluster without duplicate cluster spam', () => {
		const first = processLiquiditySwing(
			createLiquidityState(),
			swing('high-1', 'HIGH', 100, 2),
			DEFAULT_CONFIG
		);
		const second = processLiquiditySwing(
			first.state,
			swing('high-2', 'HIGH', 100.05, 3),
			DEFAULT_CONFIG
		);
		const thirdSwing = swing('high-3', 'HIGH', 100.08, 4);
		const third = processLiquiditySwing(second.state, thirdSwing, DEFAULT_CONFIG);
		const duplicate = processLiquiditySwing(third.state, thirdSwing, DEFAULT_CONFIG);

		expect(third.state.levels).toHaveLength(1);
		expect(third.state.levels[0]).toEqual(
			expect.objectContaining({
				id: second.state.levels[0]?.id,
				createdAt: 179_999,
				sourceSwingIds: ['high-1', 'high-2', 'high-3']
			})
		);
		expect(duplicate).toEqual({ state: third.state, liquidityLevel: null });
	});

	it('does not merge outside-tolerance or opposite-side levels', () => {
		const high = processLiquiditySwing(
			createLiquidityState(),
			swing('high-1', 'HIGH', 100, 2),
			DEFAULT_CONFIG
		);
		const distantHigh = processLiquiditySwing(
			high.state,
			swing('high-2', 'HIGH', 101, 3),
			DEFAULT_CONFIG
		);
		const samePriceLow = processLiquiditySwing(
			distantHigh.state,
			swing('low-1', 'LOW', 100, 4),
			DEFAULT_CONFIG
		);

		expect(samePriceLow.state.levels).toHaveLength(3);
		expect(samePriceLow.state.levels.map(({ source }) => source)).toEqual([
			'SWING_HIGH',
			'SWING_HIGH',
			'SWING_LOW'
		]);
	});

	it('preserves swept levels and creates a new active level at the same price', () => {
		const first = processLiquiditySwing(
			createLiquidityState(),
			swing('high-1', 'HIGH', 100, 2),
			DEFAULT_CONFIG
		);
		const sweptLevel: LiquidityLevel = {
			...(first.state.levels[0] as LiquidityLevel),
			status: 'SWEPT',
			sweptAt: 150_000
		};
		const sweptState = { ...first.state, levels: [sweptLevel] };
		const next = processLiquiditySwing(
			sweptState,
			swing('high-2', 'HIGH', 100.05, 3),
			DEFAULT_CONFIG
		);

		expect(next.state.levels).toHaveLength(2);
		expect(next.state.levels.map(({ status }) => status)).toEqual(['SWEPT', 'ACTIVE']);
		expect(next.state.levels[1]?.source).toBe('SWING_HIGH');
	});

	it('creates no liquidity before the source swing is confirmed', () => {
		const history = [
			minuteCandle(0, 103, 98),
			minuteCandle(1, 105, 97),
			minuteCandle(2, 110, 99),
			minuteCandle(3, 106, 96),
			minuteCandle(4, 104, 95)
		];
		const beforeConfirmation = detectConfirmedSwings(history.slice(0, 4), {
			leftBars: 2,
			rightBars: 2
		});
		const onConfirmation = detectConfirmedSwings(history, { leftBars: 2, rightBars: 2 });
		const initial = createLiquidityState();
		const result = onConfirmation.reduce(
			(state, confirmedSwing) => processLiquiditySwing(state, confirmedSwing, DEFAULT_CONFIG).state,
			initial
		);

		expect(beforeConfirmation).toEqual([]);
		expect(initial.levels).toEqual([]);
		expect(result.levels).toEqual([
			expect.objectContaining({
				sourceSwingIds: [onConfirmation[0]?.id],
				createdAt: 299_999,
				status: 'ACTIVE'
			})
		]);
	});

	it('rejects invalid tolerance, future-invalid confirmation, and out-of-order swings', () => {
		expect(() =>
			processLiquiditySwing(createLiquidityState(), swing('high-1', 'HIGH', 100, 2), {
				tolerancePercent: -0.1
			})
		).toThrow(RangeError);

		const invalidConfirmation = {
			...swing('invalid', 'HIGH', 100, 2),
			sourceTimestamp: 120_000,
			confirmedTimestamp: 119_999
		};
		expect(() =>
			processLiquiditySwing(createLiquidityState(), invalidConfirmation, DEFAULT_CONFIG)
		).toThrow(LiquidityDetectionError);

		const later = processLiquiditySwing(
			createLiquidityState(),
			swing('high-later', 'HIGH', 100, 4),
			DEFAULT_CONFIG
		);
		expect(() =>
			processLiquiditySwing(later.state, swing('high-earlier', 'HIGH', 101, 3), DEFAULT_CONFIG)
		).toThrow(LiquidityDetectionError);
	});
});
