import { describe, expect, it } from 'vitest';

import {
	createCanonicalMinutePipelineState,
	DEFAULT_SMC_STRATEGY_CONFIG,
	type Candle,
	type FairValueGap,
	type LiquidityLevel,
	type LiquiditySweep,
	type MarketStructurePoint,
	type OrderBlock,
	type StructureBreak,
	type SwingPoint,
	type TradingSetup
} from '$lib/domain/index.js';

import {
	appendCanonicalChartCandles,
	buildTradingChartViewModel,
	DEFAULT_CHART_OVERLAY_VISIBILITY,
	type ChartOverlayVisibility,
	type TradingChartOverlaySource
} from './chart-view-model.js';

const minute = 60_000;

function candle(index: number, overrides: Partial<Candle> = {}): Candle {
	const openTimestamp = index * minute;
	return {
		symbol: 'BTCUSDT',
		timeframe: '1m',
		openTimestamp,
		closeTimestamp: openTimestamp + minute - 1,
		open: 100,
		high: 102,
		low: 98,
		close: 101,
		volume: 1,
		closed: true,
		...overrides
	};
}

const emptyOverlays: TradingChartOverlaySource = {
	swings: [],
	structure: [],
	structureBreaks: [],
	liquidityLevels: [],
	liquiditySweeps: [],
	fairValueGaps: [],
	orderBlocks: [],
	setups: []
};

function model(overlays: TradingChartOverlaySource, visibility = DEFAULT_CHART_OVERLAY_VISIBILITY) {
	return buildTradingChartViewModel({
		timeframe: '1m',
		historicalCandles: Array.from({ length: 8 }, (_, index) => candle(index)),
		overlays,
		visibility
	});
}

describe('trading chart view model', () => {
	it('sorts candles and lets the latest realtime snapshot replace a historical timestamp', () => {
		const result = buildTradingChartViewModel({
			timeframe: '1m',
			historicalCandles: [candle(1), candle(0), candle(2, { close: 101 })],
			realtimeCandles: [candle(2, { close: 109, closed: false }), candle(3, { closed: false })],
			overlays: emptyOverlays,
			visibility: DEFAULT_CHART_OVERLAY_VISIBILITY
		});

		expect(result.candles.map(({ time }) => time)).toEqual([0, 60, 120, 180]);
		expect(result.candles[2]?.close).toBe(109);
	});

	it('places causal annotations on their confirmation candle, never their source candle', () => {
		const swing: SwingPoint = {
			id: 'swing-high',
			symbol: 'BTCUSDT',
			timeframe: '1m',
			sourceIndex: 0,
			sourceTimestamp: 0,
			confirmedTimestamp: 179_999,
			price: 102,
			type: 'HIGH',
			strength: 2
		};
		const structure: MarketStructurePoint = {
			swingId: swing.id,
			timestamp: swing.confirmedTimestamp,
			price: swing.price,
			structure: 'HH'
		};
		const structureBreak: StructureBreak = {
			id: 'bos',
			timestamp: 239_999,
			direction: 'BULLISH',
			type: 'BOS',
			brokenSwingId: swing.id,
			brokenLevel: swing.price,
			closePrice: 103
		};
		const sweep: LiquiditySweep = {
			id: 'sweep',
			liquidityId: 'bsl',
			timestamp: 299_999,
			direction: 'BUY_SIDE',
			liquidityPrice: 102,
			extremePrice: 104,
			closePrice: 101
		};

		const result = model({
			...emptyOverlays,
			swings: [swing],
			structure: [structure],
			structureBreaks: [structureBreak],
			liquiditySweeps: [sweep]
		});

		expect(result.markers.map(({ id, time }) => [id, time])).toEqual([
			['structure:swing-high:HH', 120],
			['swing-high', 120],
			['bos', 180],
			['sweep', 240]
		]);
		expect(result.markers.find(({ id }) => id === swing.id)?.time).not.toBe(0);
	});

	it('maps every zone and level category and honors overlay visibility', () => {
		const liquidity: LiquidityLevel = {
			id: 'liquidity',
			type: 'BUY_SIDE',
			price: 104,
			createdAt: 59_999,
			source: 'SWING_HIGH',
			sourceSwingIds: ['swing-high'],
			status: 'ACTIVE'
		};
		const gap: FairValueGap = {
			id: 'fvg',
			type: 'BULLISH',
			createdAt: 119_999,
			sourceCandleTimestamps: [0, 59_999, 119_999],
			bottom: 100,
			top: 101,
			midpoint: 100.5,
			state: 'UNTOUCHED',
			lastUpdatedAt: 119_999,
			causalSequenceId: 'sequence',
			causalStructureBreakId: 'bos',
			causalDisplacementId: 'displacement'
		};
		const block: OrderBlock = {
			id: 'ob',
			type: 'BULLISH',
			createdAt: 179_999,
			sourceCandleTimestamp: 119_999,
			high: 101,
			low: 99,
			midpoint: 100,
			state: 'ACTIVE',
			causalStructureBreakId: 'bos',
			causalDisplacementId: 'displacement',
			causalSequenceId: 'sequence'
		};
		const setup: TradingSetup = {
			id: 'setup',
			symbol: 'BTCUSDT',
			createdAt: 239_999,
			updatedAt: 239_999,
			direction: 'LONG',
			status: 'VALID',
			eligibility: { eligible: true, failures: [] },
			score: 75,
			classification: 'VALID',
			entryZone: { min: 100, max: 101 },
			entryPrice: 101,
			stopLoss: 98,
			takeProfit: 107,
			riskReward: 2,
			reasons: [],
			sourceEventIds: ['sweep', 'bos', gap.id],
			dependencies: {
				sequenceId: 'sequence',
				fvgId: gap.id,
				orderBlockId: block.id,
				sweepId: 'sweep',
				structureBreakId: 'bos',
				displacementId: 'displacement',
				protectedSwingId: 'protected-low',
				protectedSwingPrice: 98,
				protectedBosId: 'protecting-bos'
			},
			pendingEntryBars: 0
		};
		const overlays = {
			...emptyOverlays,
			liquidityLevels: [liquidity],
			fairValueGaps: [gap],
			orderBlocks: [block],
			setups: [setup]
		};

		const visible = model(overlays);
		expect(visible.levels.map(({ category }) => category)).toEqual([
			'liquidity',
			'risk',
			'risk',
			'risk'
		]);
		expect(visible.zones.map(({ category }) => category)).toEqual(['fvg', 'orderBlocks', 'risk']);

		const hidden: ChartOverlayVisibility = {
			...DEFAULT_CHART_OVERLAY_VISIBILITY,
			liquidity: false,
			fvg: false,
			orderBlocks: false,
			risk: false
		};
		const filtered = model(overlays, hidden);
		expect(filtered.levels).toEqual([]);
		expect(filtered.zones).toEqual([]);
	});

	it('refuses to feed an in-progress candle into canonical analysis', () => {
		const state = createCanonicalMinutePipelineState(DEFAULT_SMC_STRATEGY_CONFIG);

		expect(() => appendCanonicalChartCandles(state, [candle(0, { closed: false })])).toThrow(
			/requires closed 1m candles/
		);
		expect(state.pipeline.processedCandles).toBe(0);
	});
});
