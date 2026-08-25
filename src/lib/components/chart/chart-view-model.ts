import {
	createCanonicalMinutePipelineState,
	DEFAULT_SMC_STRATEGY_CONFIG,
	getTimeframeDurationMilliseconds,
	processCanonicalMinute,
	type Candle,
	type CanonicalMinutePipelineState,
	type FairValueGap,
	type LiquidityLevel,
	type LiquiditySweep,
	type MarketStructurePoint,
	type OrderBlock,
	type SMCStrategyConfig,
	type StructureBreak,
	type SwingPoint,
	type Timeframe,
	type TradingSetup
} from '$lib/domain/index.js';

export type TradingChartTimeframe = '1m' | '5m';
export type ChartOverlayCategory =
	'swings' | 'structure' | 'breaks' | 'liquidity' | 'sweeps' | 'fvg' | 'orderBlocks' | 'risk';

export type ChartOverlayVisibility = Record<ChartOverlayCategory, boolean>;

export interface TradingChartOverlaySource {
	swings: readonly SwingPoint[];
	structure: readonly MarketStructurePoint[];
	structureBreaks: readonly StructureBreak[];
	liquidityLevels: readonly LiquidityLevel[];
	liquiditySweeps: readonly LiquiditySweep[];
	fairValueGaps: readonly FairValueGap[];
	orderBlocks: readonly OrderBlock[];
	setups: readonly TradingSetup[];
}

export interface ChartCandlePoint {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
}

export interface ChartMarker {
	id: string;
	category: ChartOverlayCategory;
	time: number;
	price: number;
	position: 'atPriceTop' | 'atPriceBottom' | 'atPriceMiddle';
	shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
	color: string;
	text: string;
}

export interface ChartLevel {
	id: string;
	category: ChartOverlayCategory;
	startTime: number;
	endTime: number;
	price: number;
	color: string;
	style: 'solid' | 'dashed' | 'dotted';
	label: string;
}

export interface ChartZone {
	id: string;
	category: ChartOverlayCategory;
	startTime: number;
	endTime: number;
	top: number;
	bottom: number;
	fillColor: string;
	borderColor: string;
	label: string;
}

export interface TradingChartViewModel {
	timeframe: TradingChartTimeframe;
	candles: readonly ChartCandlePoint[];
	markers: readonly ChartMarker[];
	levels: readonly ChartLevel[];
	zones: readonly ChartZone[];
}

export interface BuildTradingChartViewModelInput {
	timeframe: TradingChartTimeframe;
	historicalCandles: readonly Candle[];
	realtimeCandles?: readonly Candle[];
	overlays: TradingChartOverlaySource;
	visibility: ChartOverlayVisibility;
}

export const DEFAULT_CHART_OVERLAY_VISIBILITY: ChartOverlayVisibility = {
	swings: true,
	structure: true,
	breaks: true,
	liquidity: true,
	sweeps: true,
	fvg: true,
	orderBlocks: true,
	risk: true
};

export function replayCanonicalChartCandles(
	candles: readonly Candle[],
	config: SMCStrategyConfig = DEFAULT_SMC_STRATEGY_CONFIG
): CanonicalMinutePipelineState {
	return appendCanonicalChartCandles(createCanonicalMinutePipelineState(config), candles, config);
}

export function appendCanonicalChartCandles(
	initialState: CanonicalMinutePipelineState,
	candles: readonly Candle[],
	config: SMCStrategyConfig = DEFAULT_SMC_STRATEGY_CONFIG
): CanonicalMinutePipelineState {
	let state = initialState;
	for (const candle of candles) {
		state = processCanonicalMinute(state, candle, config).state;
	}
	return state;
}

const COLORS = {
	bullish: '#2dd4bf',
	bearish: '#fb7185',
	structure: '#c4b5fd',
	liquidity: '#38bdf8',
	fvgBullish: 'rgba(45, 212, 191, 0.14)',
	fvgBearish: 'rgba(251, 113, 133, 0.14)',
	obBullish: 'rgba(250, 204, 21, 0.12)',
	obBearish: 'rgba(249, 115, 22, 0.12)',
	orderBlock: '#fbbf24',
	entry: '#a78bfa',
	stop: '#fb7185',
	target: '#34d399'
} as const;

export function overlaySourceFromCanonicalState(
	state: CanonicalMinutePipelineState,
	timeframe: TradingChartTimeframe
): TradingChartOverlaySource {
	const source = state.pipeline.timeframes[timeframe];
	return {
		swings: source.confirmedSwings,
		structure: source.marketStructure.sequence,
		structureBreaks: source.structureBreaks,
		liquidityLevels: source.liquidity.levels,
		liquiditySweeps: source.liquiditySweeps,
		fairValueGaps: source.fvg.gaps,
		orderBlocks: source.orderBlocks.blocks,
		setups: state.pipeline.setupRegistry
	};
}

export function buildTradingChartViewModel(
	input: BuildTradingChartViewModelInput
): TradingChartViewModel {
	const sourceCandles = mergeChartCandles(
		input.timeframe,
		input.historicalCandles,
		input.realtimeCandles ?? []
	);
	const candles = sourceCandles.map(({ openTimestamp, open, high, low, close }) => ({
		time: toChartTime(openTimestamp),
		open,
		high,
		low,
		close
	}));
	const candleTimes = new Set(candles.map(({ time }) => time));
	const firstTime = candles[0]?.time ?? null;
	const lastTime = candles.at(-1)?.time ?? null;

	if (firstTime === null || lastTime === null) {
		return { timeframe: input.timeframe, candles, markers: [], levels: [], zones: [] };
	}

	const markers = buildMarkers(input, candleTimes);
	const levels = buildLevels(input, firstTime, lastTime);
	const zones = buildZones(input, firstTime, lastTime);
	return {
		timeframe: input.timeframe,
		candles,
		markers: markers.sort(compareTimedOverlays),
		levels: levels.sort(compareTimedOverlays),
		zones: zones.sort(compareTimedOverlays)
	};
}

function mergeChartCandles(
	timeframe: TradingChartTimeframe,
	historicalCandles: readonly Candle[],
	realtimeCandles: readonly Candle[]
): Candle[] {
	const candles = new Map<number, Candle>();
	for (const candle of [...historicalCandles, ...realtimeCandles]) {
		if (candle.timeframe !== timeframe) continue;
		candles.set(candle.openTimestamp, { ...candle });
	}
	return [...candles.values()].sort((left, right) => left.openTimestamp - right.openTimestamp);
}

function buildMarkers(
	input: BuildTradingChartViewModelInput,
	candleTimes: ReadonlySet<number>
): ChartMarker[] {
	const markers: ChartMarker[] = [];
	if (input.visibility.swings) {
		for (const swing of input.overlays.swings) {
			markers.push({
				id: swing.id,
				category: 'swings',
				time: alignEventTime(swing.confirmedTimestamp, input.timeframe),
				price: swing.price,
				position: swing.type === 'HIGH' ? 'atPriceTop' : 'atPriceBottom',
				shape: swing.type === 'HIGH' ? 'arrowDown' : 'arrowUp',
				color: swing.type === 'HIGH' ? COLORS.bearish : COLORS.bullish,
				text: swing.type === 'HIGH' ? 'SH' : 'SL'
			});
		}
	}
	if (input.visibility.structure) {
		for (const point of input.overlays.structure) {
			const high = point.structure === 'HH' || point.structure === 'LH';
			markers.push({
				id: `structure:${point.swingId}:${point.structure}`,
				category: 'structure',
				time: alignEventTime(point.timestamp, input.timeframe),
				price: point.price,
				position: high ? 'atPriceTop' : 'atPriceBottom',
				shape: 'square',
				color: COLORS.structure,
				text: point.structure
			});
		}
	}
	if (input.visibility.breaks) {
		for (const event of input.overlays.structureBreaks) {
			const bullish = event.direction === 'BULLISH';
			markers.push({
				id: event.id,
				category: 'breaks',
				time: alignEventTime(event.timestamp, input.timeframe),
				price: event.brokenLevel,
				position: bullish ? 'atPriceBottom' : 'atPriceTop',
				shape: bullish ? 'arrowUp' : 'arrowDown',
				color: bullish ? COLORS.bullish : COLORS.bearish,
				text: event.type
			});
		}
	}
	if (input.visibility.sweeps) {
		for (const sweep of input.overlays.liquiditySweeps) {
			const sellSide = sweep.direction === 'SELL_SIDE';
			markers.push({
				id: sweep.id,
				category: 'sweeps',
				time: alignEventTime(sweep.timestamp, input.timeframe),
				price: sweep.extremePrice,
				position: sellSide ? 'atPriceBottom' : 'atPriceTop',
				shape: 'circle',
				color: COLORS.liquidity,
				text: 'SWEEP'
			});
		}
	}

	return dedupeById(markers).filter(({ time }) => candleTimes.has(time));
}

function buildLevels(
	input: BuildTradingChartViewModelInput,
	firstTime: number,
	lastTime: number
): ChartLevel[] {
	const levels: ChartLevel[] = [];
	if (input.visibility.breaks) {
		for (const event of input.overlays.structureBreaks) {
			levels.push({
				id: `break:${event.id}`,
				category: 'breaks',
				startTime: clampTime(alignEventTime(event.timestamp, input.timeframe), firstTime, lastTime),
				endTime: lastTime,
				price: event.brokenLevel,
				color: event.direction === 'BULLISH' ? COLORS.bullish : COLORS.bearish,
				style: 'dashed',
				label: event.type
			});
		}
	}
	if (input.visibility.liquidity) {
		for (const level of input.overlays.liquidityLevels) {
			levels.push({
				id: level.id,
				category: 'liquidity',
				startTime: clampTime(alignEventTime(level.createdAt, input.timeframe), firstTime, lastTime),
				endTime: clampTime(
					alignEventTime(level.sweptAt ?? lastTime * 1_000, input.timeframe),
					firstTime,
					lastTime
				),
				price: level.price,
				color: COLORS.liquidity,
				style: level.source.startsWith('EQUAL') ? 'dashed' : 'dotted',
				label: level.source.startsWith('EQUAL') ? 'EQL' : level.type === 'BUY_SIDE' ? 'BSL' : 'SSL'
			});
		}
	}
	if (input.visibility.risk) {
		for (const setup of input.overlays.setups) {
			const startTime = clampTime(
				alignEventTime(setup.createdAt, input.timeframe),
				firstTime,
				lastTime
			);
			const endTime = isLiveSetup(setup)
				? lastTime
				: clampTime(alignEventTime(setup.updatedAt, input.timeframe), firstTime, lastTime);
			levels.push(
				{
					id: `${setup.id}:entry`,
					category: 'risk',
					startTime,
					endTime,
					price: setup.entryPrice,
					color: COLORS.entry,
					style: 'solid',
					label: 'ENTRY'
				},
				{
					id: `${setup.id}:sl`,
					category: 'risk',
					startTime,
					endTime,
					price: setup.stopLoss,
					color: COLORS.stop,
					style: 'dashed',
					label: 'SL'
				},
				{
					id: `${setup.id}:tp`,
					category: 'risk',
					startTime,
					endTime,
					price: setup.takeProfit,
					color: COLORS.target,
					style: 'dashed',
					label: 'TP'
				}
			);
		}
	}
	return dedupeById(levels).filter(({ startTime, endTime }) => endTime >= startTime);
}

function buildZones(
	input: BuildTradingChartViewModelInput,
	firstTime: number,
	lastTime: number
): ChartZone[] {
	const zones: ChartZone[] = [];
	if (input.visibility.fvg) {
		for (const gap of input.overlays.fairValueGaps) {
			zones.push({
				id: gap.id,
				category: 'fvg',
				startTime: clampTime(alignEventTime(gap.createdAt, input.timeframe), firstTime, lastTime),
				endTime:
					gap.state === 'FILLED'
						? clampTime(alignEventTime(gap.lastUpdatedAt, input.timeframe), firstTime, lastTime)
						: lastTime,
				top: gap.top,
				bottom: gap.bottom,
				fillColor: gap.type === 'BULLISH' ? COLORS.fvgBullish : COLORS.fvgBearish,
				borderColor: gap.type === 'BULLISH' ? COLORS.bullish : COLORS.bearish,
				label: `${gap.type === 'BULLISH' ? 'Bull' : 'Bear'} FVG`
			});
		}
	}
	if (input.visibility.orderBlocks) {
		for (const block of input.overlays.orderBlocks) {
			zones.push({
				id: block.id,
				category: 'orderBlocks',
				startTime: clampTime(alignEventTime(block.createdAt, input.timeframe), firstTime, lastTime),
				endTime: lastTime,
				top: block.high,
				bottom: block.low,
				fillColor: block.type === 'BULLISH' ? COLORS.obBullish : COLORS.obBearish,
				borderColor: COLORS.orderBlock,
				label: 'OB'
			});
		}
	}
	if (input.visibility.risk) {
		for (const setup of input.overlays.setups) {
			const startTime = clampTime(
				alignEventTime(setup.createdAt, input.timeframe),
				firstTime,
				lastTime
			);
			zones.push({
				id: `${setup.id}:entry-zone`,
				category: 'risk',
				startTime,
				endTime: isLiveSetup(setup)
					? lastTime
					: clampTime(alignEventTime(setup.updatedAt, input.timeframe), firstTime, lastTime),
				top: setup.entryZone.max,
				bottom: setup.entryZone.min,
				fillColor: 'rgba(167, 139, 250, 0.12)',
				borderColor: COLORS.entry,
				label: 'ENTRY ZONE'
			});
		}
	}
	return dedupeById(zones).filter(({ startTime, endTime }) => endTime >= startTime);
}

function alignEventTime(timestamp: number, timeframe: Timeframe): number {
	const duration = getTimeframeDurationMilliseconds(timeframe);
	return toChartTime(Math.floor(timestamp / duration) * duration);
}

function toChartTime(timestamp: number): number {
	return Math.floor(timestamp / 1_000);
}

function clampTime(time: number, firstTime: number, lastTime: number): number {
	return Math.min(Math.max(time, firstTime), lastTime);
}

function isLiveSetup(setup: TradingSetup): boolean {
	return setup.status === 'FORMING' || setup.status === 'VALID' || setup.status === 'TRIGGERED';
}

function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
	return [...new Map(items.map((item) => [item.id, item])).values()];
}

function compareTimedOverlays(
	left: ChartMarker | ChartLevel | ChartZone,
	right: ChartMarker | ChartLevel | ChartZone
): number {
	const leftTime = 'time' in left ? left.time : left.startTime;
	const rightTime = 'time' in right ? right.time : right.startTime;
	return leftTime - rightTime || left.id.localeCompare(right.id);
}
