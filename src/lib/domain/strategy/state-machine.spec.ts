import { describe, expect, it } from 'vitest';

import type { StrategySignal } from './state-machine.js';
import { createStrategyState, processStrategySignal, StrategyStateError } from './state-machine.js';

function signals(direction: 'LONG' | 'SHORT'): StrategySignal[] {
	const bullish = direction === 'LONG';
	const marketDirection = bullish ? 'BULLISH' : 'BEARISH';
	const sweepDirection = bullish ? 'SELL_SIDE' : 'BUY_SIDE';
	return [
		{ type: 'HTF_BIAS', id: 'bias', timestamp: 1, timeframe: '5m', bias: marketDirection },
		{
			type: 'LIQUIDITY_SWEEP',
			id: 'sweep',
			timestamp: 2,
			timeframe: '1m',
			sweep: {
				id: 'sweep',
				liquidityId: 'liq',
				timestamp: 2,
				direction: sweepDirection,
				liquidityPrice: 100,
				extremePrice: 99,
				closePrice: 101
			}
		},
		{
			type: 'CHOCH',
			id: 'choch',
			timestamp: 3,
			timeframe: '1m',
			structureBreak: {
				id: 'choch',
				timestamp: 3,
				direction: marketDirection,
				type: 'CHOCH',
				brokenSwingId: 'swing',
				brokenLevel: 101,
				closePrice: 102
			}
		},
		{
			type: 'DISPLACEMENT',
			id: 'displacement',
			timestamp: 4,
			timeframe: '1m',
			displacement: {
				id: 'displacement',
				symbol: 'BTCUSDT',
				timeframe: '1m',
				timestamp: 4,
				direction: marketDirection,
				bodySize: 3,
				atr: 2,
				threshold: 2.4
			}
		},
		{
			type: 'FVG',
			id: 'fvg-signal',
			timestamp: 5,
			timeframe: '1m',
			gap: {
				id: 'fvg',
				type: marketDirection,
				createdAt: 5,
				sourceCandleTimestamps: [3, 4, 5],
				bottom: 100,
				top: 102,
				midpoint: 101,
				state: 'UNTOUCHED',
				lastUpdatedAt: 5,
				causalSequenceId: 'sequence',
				causalStructureBreakId: 'choch',
				causalDisplacementId: 'displacement'
			}
		},
		{
			type: 'RETRACEMENT',
			id: 'retracement',
			timestamp: 6,
			timeframe: '1m',
			fvg: {
				id: 'fvg',
				type: marketDirection,
				createdAt: 5,
				sourceCandleTimestamps: [3, 4, 5],
				bottom: 100,
				top: 102,
				midpoint: 101,
				state: 'PARTIALLY_FILLED',
				lastUpdatedAt: 6,
				causalSequenceId: 'sequence',
				causalStructureBreakId: 'choch',
				causalDisplacementId: 'displacement'
			},
			price: 101
		}
	];
}

function replay(source: readonly StrategySignal[]) {
	return source.reduce(
		(state, signal) => processStrategySignal(state, signal).state,
		createStrategyState()
	);
}

describe('SMC strategy state machine', () => {
	it.each(['LONG', 'SHORT'] as const)('reaches READY for the ordered %s sequence', (direction) => {
		let state = createStrategyState();
		const transitions = signals(direction).map((signal) => {
			const result = processStrategySignal(state, signal);
			state = result.state;
			return result.transition;
		});
		expect(state.stage).toBe('READY');
		expect(state.direction).toBe(direction);
		expect(state.sourceEventIds).toEqual([
			'bias',
			'sweep',
			'choch',
			'displacement',
			'fvg-signal',
			'retracement'
		]);
		expect(transitions.every(Boolean)).toBe(true);
	});

	it('keeps only FVG provenance and rejects a retracement against its latest FILLED state', () => {
		const source = signals('LONG');
		const waiting = replay(source.slice(0, 5));
		const retracement = source[5] as Extract<StrategySignal, { type: 'RETRACEMENT' }>;

		expect(waiting.activeFvgId).toBe('fvg');
		expect(waiting).not.toHaveProperty('activeFvg');

		const result = processStrategySignal(waiting, {
			...retracement,
			fvg: { ...retracement.fvg, state: 'FILLED' }
		});

		expect(result.state.stage).toBe('WAITING_FOR_RETRACEMENT');
		expect(result.transition).toBeNull();
	});

	it('does not advance on an out-of-order sequence event', () => {
		const source = signals('LONG');
		const earlyDisplacement = {
			...source[3]!,
			id: 'early-displacement',
			timestamp: 2,
			displacement: {
				...(source[3] as Extract<StrategySignal, { type: 'DISPLACEMENT' }>).displacement,
				id: 'early-displacement',
				timestamp: 2
			}
		} as StrategySignal;
		const sweep = {
			...source[1]!,
			timestamp: 3,
			sweep: {
				...(source[1] as Extract<StrategySignal, { type: 'LIQUIDITY_SWEEP' }>).sweep,
				timestamp: 3
			}
		} as StrategySignal;
		const choch = {
			...source[2]!,
			timestamp: 4,
			structureBreak: {
				...(source[2] as Extract<StrategySignal, { type: 'CHOCH' }>).structureBreak,
				timestamp: 4
			}
		} as StrategySignal;
		const state = replay([source[0]!, earlyDisplacement, sweep, choch, source[4]!, source[5]!]);
		expect(state.stage).toBe('WAITING_FOR_DISPLACEMENT');
		expect(state.sourceEventIds).toEqual(['bias', 'sweep', 'choch']);
	});

	it('invalidates an active sequence when HTF bias becomes neutral and allows a later restart', () => {
		let state = replay(signals('LONG').slice(0, 2));
		const invalidated = processStrategySignal(state, {
			type: 'HTF_BIAS',
			id: 'neutral',
			timestamp: 3,
			timeframe: '5m',
			bias: 'NEUTRAL'
		});
		expect(invalidated.state).toMatchObject({
			stage: 'INVALIDATED',
			invalidationReason: 'Higher-timeframe bias became neutral'
		});
		expect(invalidated.transition?.to).toBe('INVALIDATED');

		state = processStrategySignal(invalidated.state, {
			type: 'HTF_BIAS',
			id: 'new-bias',
			timestamp: 4,
			timeframe: '5m',
			bias: 'BEARISH'
		}).state;
		expect(state).toMatchObject({
			stage: 'WAITING_FOR_SWEEP',
			direction: 'SHORT',
			invalidationReason: null
		});
	});

	it('rejects duplicate and reverse-time signals', () => {
		const first = signals('LONG')[0]!;
		const state = processStrategySignal(createStrategyState(), first).state;
		expect(() => processStrategySignal(state, first)).toThrow(StrategyStateError);
		expect(() => processStrategySignal(state, { ...signals('LONG')[1]!, timestamp: 0 })).toThrow(
			StrategyStateError
		);
	});
});
