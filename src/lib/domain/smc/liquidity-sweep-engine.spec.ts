import { describe, expect, it } from 'vitest';

import type { Candle } from '../market/index.js';
import {
	createLiquidityState,
	processLiquiditySwing,
	type LiquidityState
} from './liquidity-engine.js';
import type { SwingPoint } from './models.js';
import { LiquiditySweepError, processLiquiditySweepCandle } from './liquidity-sweep-engine.js';

const DEFAULT_CONFIG = { tolerancePercent: 0.1 } as const;

function swing(id: string, type: SwingPoint['type'], price: number): SwingPoint {
	return {
		id,
		symbol: 'BTCUSDT',
		timeframe: '1m',
		sourceIndex: 0,
		sourceTimestamp: 0,
		confirmedTimestamp: 119_999,
		price,
		type,
		strength: 2
	};
}

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

function stateWithLevel(type: SwingPoint['type'], price: number): LiquidityState {
	return processLiquiditySwing(
		createLiquidityState(),
		swing(type === 'HIGH' ? 'high-1' : 'low-1', type, price),
		DEFAULT_CONFIG
	).state;
}

describe('liquidity sweep engine', () => {
	it('emits a buy-side sweep and records its extreme and close', () => {
		const state = stateWithLevel('HIGH', 100);
		const result = processLiquiditySweepCandle(
			state,
			candle(2, { open: 99, high: 101, low: 98, close: 99.5 })
		);

		expect(result.sweeps).toEqual([
			{
				id: '["LIQUIDITY_SWEEP","BTCUSDT","1m",179999,"[\\"LIQUIDITY\\",\\"BTCUSDT\\",\\"1m\\",\\"high-1\\"]"]',
				liquidityId: '["LIQUIDITY","BTCUSDT","1m","high-1"]',
				timestamp: 179_999,
				direction: 'BUY_SIDE',
				liquidityPrice: 100,
				extremePrice: 101,
				closePrice: 99.5
			}
		]);
		expect(result.interactions[0]?.type).toBe('SWEEP');
		expect(result.state.levels[0]).toEqual(
			expect.objectContaining({ status: 'SWEPT', sweptAt: 179_999 })
		);
	});

	it('emits the mirrored sell-side sweep', () => {
		const state = stateWithLevel('LOW', 90);
		const result = processLiquiditySweepCandle(
			state,
			candle(2, { open: 91, high: 92, low: 89, close: 90.5 })
		);

		expect(result.sweeps).toEqual([
			expect.objectContaining({
				direction: 'SELL_SIDE',
				liquidityPrice: 90,
				extremePrice: 89,
				closePrice: 90.5
			})
		]);
		expect(result.state.levels[0]?.status).toBe('SWEPT');
	});

	it('classifies exact contact and a close-at-level rejection as touches', () => {
		const exactState = stateWithLevel('HIGH', 100);
		const exact = processLiquiditySweepCandle(
			exactState,
			candle(2, { open: 99, high: 100, low: 98, close: 99 })
		);
		const rejectionState = stateWithLevel('HIGH', 100);
		const closeAtLevel = processLiquiditySweepCandle(
			rejectionState,
			candle(2, { open: 99, high: 101, low: 98, close: 100 })
		);

		expect(exact.interactions[0]?.type).toBe('TOUCH');
		expect(closeAtLevel.interactions[0]?.type).toBe('TOUCH');
		expect(exact.sweeps).toEqual([]);
		expect(closeAtLevel.sweeps).toEqual([]);
		expect(exact.state.levels[0]?.status).toBe('ACTIVE');
		expect(closeAtLevel.state.levels[0]?.status).toBe('ACTIVE');
	});

	it('classifies close-through moves as breakouts and invalidates the levels', () => {
		const buySide = processLiquiditySweepCandle(
			stateWithLevel('HIGH', 100),
			candle(2, { open: 99, high: 102, low: 98, close: 101 })
		);
		const sellSide = processLiquiditySweepCandle(
			stateWithLevel('LOW', 90),
			candle(2, { open: 91, high: 92, low: 88, close: 89 })
		);

		expect(buySide.interactions[0]?.type).toBe('BREAKOUT');
		expect(sellSide.interactions[0]?.type).toBe('BREAKOUT');
		expect(buySide.sweeps).toEqual([]);
		expect(sellSide.sweeps).toEqual([]);
		expect(buySide.state.levels[0]?.status).toBe('INVALIDATED');
		expect(sellSide.state.levels[0]?.status).toBe('INVALIDATED');
	});

	it('marks a swept level once and prevents repeated sweep events', () => {
		const first = processLiquiditySweepCandle(
			stateWithLevel('HIGH', 100),
			candle(2, { open: 99, high: 101, low: 98, close: 99 })
		);
		const repeated = processLiquiditySweepCandle(
			first.state,
			candle(3, { open: 99, high: 102, low: 98, close: 99 })
		);

		expect(first.sweeps).toHaveLength(1);
		expect(repeated.sweeps).toEqual([]);
		expect(repeated.interactions).toEqual([]);
		expect(repeated.state.levels[0]?.sweptAt).toBe(179_999);
	});

	it('can sweep buy-side and sell-side levels on the same closed candle', () => {
		const high = processLiquiditySwing(
			createLiquidityState(),
			swing('high-1', 'HIGH', 100),
			DEFAULT_CONFIG
		);
		const lowSwing = { ...swing('low-1', 'LOW', 90), confirmedTimestamp: 119_999 };
		const both = processLiquiditySwing(high.state, lowSwing, DEFAULT_CONFIG);
		const result = processLiquiditySweepCandle(
			both.state,
			candle(2, { open: 95, high: 101, low: 89, close: 95 })
		);

		expect(result.sweeps.map(({ direction }) => direction)).toEqual(['BUY_SIDE', 'SELL_SIDE']);
		expect(result.state.levels.every(({ status }) => status === 'SWEPT')).toBe(true);
	});

	it('ignores unclosed candles without advancing state', () => {
		const state = stateWithLevel('HIGH', 100);
		const result = processLiquiditySweepCandle(
			state,
			candle(2, { open: 99, high: 101, low: 98, close: 99, closed: false })
		);

		expect(result).toEqual({ state, interactions: [], sweeps: [] });
	});

	it('rejects duplicate candles, future levels, and swings added after candle processing', () => {
		const state = stateWithLevel('HIGH', 100);
		const firstCandle = candle(2, { open: 99, high: 99.5, low: 98, close: 99 });
		const first = processLiquiditySweepCandle(state, firstCandle);

		expect(() => processLiquiditySweepCandle(first.state, firstCandle)).toThrow(
			LiquiditySweepError
		);

		const futureLevelState = {
			...state,
			levels: state.levels.map((level) => ({ ...level, createdAt: 240_000 }))
		};
		expect(() => processLiquiditySweepCandle(futureLevelState, firstCandle)).toThrow(
			LiquiditySweepError
		);

		expect(() =>
			processLiquiditySwing(
				first.state,
				{ ...swing('late-high', 'HIGH', 105), confirmedTimestamp: 179_999 },
				DEFAULT_CONFIG
			)
		).toThrow();
	});
});
