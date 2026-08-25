import { describe, expect, it } from 'vitest';

import {
	createCanonicalMinutePipelineState,
	DEFAULT_SMC_STRATEGY_CONFIG,
	type CanonicalMinutePipelineState,
	type TradingSetup
} from '$lib/domain/index.js';

import { buildLiveSetupPanelViewModel } from './setup-panel-view-model.js';

function initialState(): CanonicalMinutePipelineState {
	return createCanonicalMinutePipelineState(DEFAULT_SMC_STRATEGY_CONFIG);
}

function setup(id: string, overrides: Partial<TradingSetup> = {}): TradingSetup {
	return {
		id,
		symbol: 'BTCUSDT',
		createdAt: 300_000,
		updatedAt: 300_000,
		direction: 'LONG',
		status: 'VALID',
		eligibility: { eligible: true, failures: [] },
		score: 65,
		classification: 'VALID',
		entryZone: { min: 100, max: 101 },
		entryPrice: 101,
		stopLoss: 98,
		takeProfit: 107,
		riskReward: 2,
		reasons: [
			{
				key: 'orderBlockOverlap',
				label: 'Order Block overlap quality',
				score: 25,
				valid: true,
				description: 'Order Block overlap quality confirmed; awarded 25 points.'
			},
			{
				key: 'sessionReady',
				label: 'Reserved / session-ready',
				score: 0,
				valid: false,
				description: 'Reserved / session-ready not confirmed; awarded 0 of 5 points.'
			}
		],
		sourceEventIds: ['bias', 'sweep', 'choch', 'displacement', 'fvg'],
		dependencies: {
			sequenceId: 'sequence',
			fvgId: 'fvg',
			orderBlockId: 'ob',
			sweepId: 'sweep',
			structureBreakId: 'choch',
			displacementId: 'displacement',
			protectedSwingId: 'protected-low',
			protectedSwingPrice: 98,
			protectedBosId: 'protecting-bos'
		},
		pendingEntryBars: 0,
		...overrides
	};
}

describe('live setup panel view model', () => {
	it('shows the initial neutral state without inventing a setup', () => {
		const model = buildLiveSetupPanelViewModel(initialState());

		expect(model).toMatchObject({
			symbol: 'BTCUSDT',
			bias: 'NEUTRAL',
			biasLabel: 'Neutral',
			stage: 'WAITING_FOR_BIAS',
			stageLabel: 'Waiting for bias',
			setup: null,
			lastUpdatedAt: null
		});
		expect(model.structures.map(({ value }) => value)).toEqual(['—', '—']);
		expect(model.conditions[0]).toMatchObject({ key: 'bias', state: 'current' });
		expect(model.conditions.slice(1).every(({ state }) => state === 'waiting')).toBe(true);
	});

	it('translates canonical sequence progress and confirmed structures', () => {
		const initial = initialState();
		const state: CanonicalMinutePipelineState = {
			...initial,
			pipeline: {
				...initial.pipeline,
				htfBias: 'BULLISH',
				lastProcessedTimestamp: 359_999,
				strategy: {
					...initial.pipeline.strategy,
					stage: 'WAITING_FOR_DISPLACEMENT',
					direction: 'LONG',
					bias: 'BULLISH'
				},
				timeframes: {
					...initial.pipeline.timeframes,
					'5m': {
						...initial.pipeline.timeframes['5m'],
						marketStructure: {
							...initial.pipeline.timeframes['5m'].marketStructure,
							latestHighStructure: 'HH',
							latestLowStructure: 'HL',
							sequence: [
								{ swingId: 'high', timestamp: 299_999, price: 105, structure: 'HH' },
								{ swingId: 'low', timestamp: 299_999, price: 100, structure: 'HL' }
							]
						}
					}
				}
			}
		};

		const model = buildLiveSetupPanelViewModel(state);

		expect(model.biasLabel).toBe('Bullish');
		expect(model.stageLabel).toBe('Waiting for displacement');
		expect(model.structures[0]).toMatchObject({ timeframe: '5m', value: 'HH · HL' });
		expect(model.conditions.map(({ state }) => state)).toEqual([
			'complete',
			'complete',
			'complete',
			'current',
			'waiting',
			'waiting'
		]);
	});

	it('uses the active canonical setup and preserves domain score reasons and risk values', () => {
		const initial = initialState();
		const active = setup('active');
		const newerTerminal = setup('newer-terminal', {
			updatedAt: 420_000,
			status: 'INVALIDATED',
			invalidationReason: 'PENDING_EXPIRED'
		});
		const state: CanonicalMinutePipelineState = {
			...initial,
			pipeline: {
				...initial.pipeline,
				setupRegistry: [active, newerTerminal],
				activeSetupId: active.id,
				strategy: {
					...initial.pipeline.strategy,
					stage: 'WAITING_FOR_RETRACEMENT',
					direction: 'LONG',
					bias: 'BULLISH'
				}
			}
		};

		const model = buildLiveSetupPanelViewModel(state);

		expect(model.setup).toMatchObject({
			id: active.id,
			displayMode: 'CURRENT',
			statusLabel: 'Valid setup',
			score: 65,
			entryZone: { min: 100, max: 101 },
			entryPrice: 101,
			stopLoss: 98,
			takeProfit: 107,
			riskReward: 2,
			invalidationLevel: 98,
			invalidationRule: 'Closed candle below protected low',
			invalidation: null
		});
		expect(model.setup?.reasons).toEqual(active.reasons);
		expect(model.setup?.reasons).not.toBe(active.reasons);
	});

	it('falls back to the latest terminal setup and explains canonical invalidation', () => {
		const initial = initialState();
		const older = setup('older', { updatedAt: 300_000, status: 'TRIGGERED' });
		const invalidated = setup('invalidated', {
			updatedAt: 480_000,
			status: 'INVALIDATED',
			invalidationReason: 'PROTECTED_LOW_BREACHED'
		});
		const state: CanonicalMinutePipelineState = {
			...initial,
			pipeline: {
				...initial.pipeline,
				setupRegistry: [invalidated, older],
				activeSetupId: null
			}
		};

		const model = buildLiveSetupPanelViewModel(state);

		expect(model.setup).toMatchObject({
			id: invalidated.id,
			displayMode: 'LATEST',
			statusLabel: 'Invalidated',
			invalidation: {
				code: 'PROTECTED_LOW_BREACHED',
				label: 'A candle closed below the protected low'
			}
		});
	});
});
