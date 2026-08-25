import { describe, expect, it } from 'vitest';

import type { SwingPoint } from './models.js';
import {
	createMarketStructureState,
	MarketStructureError,
	processConfirmedSwing,
	type MarketStructureState
} from './market-structure-engine.js';

function swing(
	id: string,
	type: SwingPoint['type'],
	price: number,
	confirmedMinute: number
): SwingPoint {
	return {
		id,
		symbol: 'BTCUSDT',
		timeframe: '5m',
		sourceIndex: confirmedMinute - 2,
		sourceTimestamp: (confirmedMinute - 2) * 300_000,
		confirmedTimestamp: confirmedMinute * 300_000 - 1,
		price,
		type,
		strength: 2
	};
}

function replay(swings: readonly SwingPoint[]): MarketStructureState {
	return swings.reduce(processConfirmedSwing, createMarketStructureState());
}

describe('market structure engine', () => {
	it('starts neutral and does not classify the first high or low', () => {
		const initial = createMarketStructureState();
		const state = replay([swing('high-1', 'HIGH', 100, 2), swing('low-1', 'LOW', 90, 3)]);

		expect(initial).toEqual({
			symbol: null,
			timeframe: null,
			bias: 'NEUTRAL',
			sequence: [],
			lastHigh: null,
			lastLow: null,
			latestHighStructure: null,
			latestLowStructure: null,
			lastProcessedTimestamp: null
		});
		expect(state.bias).toBe('NEUTRAL');
		expect(state.sequence).toEqual([]);
	});

	it('classifies HH and HL and establishes bullish bias', () => {
		const state = replay([
			swing('high-1', 'HIGH', 100, 2),
			swing('low-1', 'LOW', 90, 3),
			swing('high-2', 'HIGH', 110, 4),
			swing('low-2', 'LOW', 95, 5)
		]);

		expect(state.bias).toBe('BULLISH');
		expect(state.sequence).toEqual([
			{ swingId: 'high-2', timestamp: 1_199_999, price: 110, structure: 'HH' },
			{ swingId: 'low-2', timestamp: 1_499_999, price: 95, structure: 'HL' }
		]);
	});

	it('classifies LH and LL and establishes bearish bias', () => {
		const state = replay([
			swing('high-1', 'HIGH', 110, 2),
			swing('low-1', 'LOW', 100, 3),
			swing('high-2', 'HIGH', 105, 4),
			swing('low-2', 'LOW', 90, 5)
		]);

		expect(state.bias).toBe('BEARISH');
		expect(state.sequence.map(({ structure }) => structure)).toEqual(['LH', 'LL']);
	});

	it('returns to neutral when the latest high and low structure are mixed', () => {
		const bullish = replay([
			swing('high-1', 'HIGH', 100, 2),
			swing('low-1', 'LOW', 90, 3),
			swing('high-2', 'HIGH', 110, 4),
			swing('low-2', 'LOW', 95, 5)
		]);

		const mixed = processConfirmedSwing(bullish, swing('high-3', 'HIGH', 105, 6));

		expect(mixed.latestHighStructure).toBe('LH');
		expect(mixed.latestLowStructure).toBe('HL');
		expect(mixed.bias).toBe('NEUTRAL');
	});

	it('does not classify equal prices and compares the next swing with the equal swing', () => {
		const state = replay([
			swing('high-1', 'HIGH', 100, 2),
			swing('high-equal', 'HIGH', 100, 3),
			swing('high-2', 'HIGH', 101, 4)
		]);

		expect(state.sequence).toEqual([
			{ swingId: 'high-2', timestamp: 1_199_999, price: 101, structure: 'HH' }
		]);
		expect(state.bias).toBe('NEUTRAL');
	});

	it('timestamps structure at swing confirmation rather than the source candle', () => {
		const first = swing('high-1', 'HIGH', 100, 2);
		const confirmed = swing('high-2', 'HIGH', 110, 4);
		const state = replay([first, confirmed]);

		expect(confirmed.sourceTimestamp).toBe(600_000);
		expect(state.sequence[0]?.timestamp).toBe(confirmed.confirmedTimestamp);
		expect(state.sequence[0]?.timestamp).toBe(1_199_999);
	});

	it('rejects out-of-order or cross-market swing events', () => {
		const state = processConfirmedSwing(
			createMarketStructureState(),
			swing('high-1', 'HIGH', 100, 3)
		);
		const earlier = swing('high-earlier', 'HIGH', 99, 2);
		const otherSymbol = { ...swing('other', 'HIGH', 101, 4), symbol: 'ETHUSDT' };

		expect(() => processConfirmedSwing(state, earlier)).toThrow(MarketStructureError);
		expect(() => processConfirmedSwing(state, otherSymbol)).toThrow(MarketStructureError);
	});
});
