<script lang="ts">
	import { onMount } from 'svelte';
	import {
		CandlestickSeries,
		ColorType,
		CrosshairMode,
		createChart,
		createSeriesMarkers,
		type CandlestickData,
		type IChartApi,
		type ISeriesApi,
		type ISeriesMarkersPluginApi,
		type SeriesMarker,
		type Time,
		type UTCTimestamp
	} from 'lightweight-charts';

	import type { ChartLevel, ChartZone, TradingChartViewModel } from './chart-view-model.js';

	interface PixelLevel extends ChartLevel {
		x1: number;
		x2: number;
		y: number;
	}

	interface PixelZone extends ChartZone {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	let {
		model,
		ariaLabel = 'BTCUSDT candlestick chart with Smart Money Concept overlays'
	}: { model: TradingChartViewModel; ariaLabel?: string } = $props();

	let container: HTMLDivElement;
	let chart: IChartApi | null = null;
	let candleSeries: ISeriesApi<'Candlestick'> | null = null;
	let markerPlugin: ISeriesMarkersPluginApi<Time> | null = null;
	let pixelLevels = $state<PixelLevel[]>([]);
	let pixelZones = $state<PixelZone[]>([]);
	let chartWidth = $state(0);
	let chartHeight = $state(0);
	let renderedTimeframe: TradingChartViewModel['timeframe'] | null = null;

	$effect(() => {
		const nextModel = model;
		if (chart && candleSeries && markerPlugin) applyModel(nextModel);
	});

	onMount(() => {
		chartWidth = Math.max(container.clientWidth, 320);
		chartHeight = Math.max(container.clientHeight, 420);
		chart = createChart(container, {
			width: chartWidth,
			height: chartHeight,
			layout: {
				background: { type: ColorType.Solid, color: '#090f1c' },
				textColor: '#8090aa',
				fontFamily: 'Inter Variable, Inter, sans-serif',
				fontSize: 11,
				attributionLogo: false
			},
			grid: {
				vertLines: { color: 'rgba(148, 163, 184, 0.055)' },
				horzLines: { color: 'rgba(148, 163, 184, 0.055)' }
			},
			crosshair: {
				mode: CrosshairMode.Normal,
				vertLine: { color: 'rgba(148, 163, 184, 0.35)', labelBackgroundColor: '#182238' },
				horzLine: { color: 'rgba(148, 163, 184, 0.35)', labelBackgroundColor: '#182238' }
			},
			rightPriceScale: {
				borderColor: 'rgba(148, 163, 184, 0.14)',
				scaleMargins: { top: 0.1, bottom: 0.08 }
			},
			timeScale: {
				borderColor: 'rgba(148, 163, 184, 0.14)',
				timeVisible: true,
				secondsVisible: false,
				rightOffset: 5,
				barSpacing: 7,
				minBarSpacing: 3
			},
			localization: {
				timeFormatter: (time: Time) =>
					new Intl.DateTimeFormat('en-GB', {
						timeZone: 'UTC',
						day: '2-digit',
						month: 'short',
						hour: '2-digit',
						minute: '2-digit',
						hour12: false
					}).format(Number(time) * 1_000)
			}
		});
		candleSeries = chart.addSeries(CandlestickSeries, {
			upColor: '#2dd4bf',
			downColor: '#fb7185',
			borderVisible: false,
			wickUpColor: '#2dd4bf',
			wickDownColor: '#fb7185',
			priceLineVisible: true,
			priceLineColor: 'rgba(255, 255, 255, 0.28)',
			lastValueVisible: true
		});
		markerPlugin = createSeriesMarkers(candleSeries, []);
		applyModel(model);

		const rangeHandler = () => refreshPixelOverlays();
		chart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);
		const resizeObserver = new ResizeObserver(([entry]) => {
			if (!entry || !chart) return;
			chartWidth = Math.max(Math.floor(entry.contentRect.width), 320);
			chartHeight = Math.max(Math.floor(entry.contentRect.height), 420);
			chart.applyOptions({ width: chartWidth, height: chartHeight });
			requestAnimationFrame(refreshPixelOverlays);
		});
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
			chart?.timeScale().unsubscribeVisibleLogicalRangeChange(rangeHandler);
			markerPlugin?.detach();
			chart?.remove();
			chart = null;
			candleSeries = null;
			markerPlugin = null;
		};
	});

	function applyModel(nextModel: TradingChartViewModel): void {
		if (!chart || !candleSeries || !markerPlugin) return;
		const data: CandlestickData<UTCTimestamp>[] = nextModel.candles.map((candle) => ({
			time: candle.time as UTCTimestamp,
			open: candle.open,
			high: candle.high,
			low: candle.low,
			close: candle.close
		}));
		const markers: SeriesMarker<Time>[] = nextModel.markers.map((marker) => ({
			id: marker.id,
			time: marker.time as UTCTimestamp,
			position: marker.position,
			price: marker.price,
			shape: marker.shape,
			color: marker.color,
			text: marker.text,
			size: 0.7
		}));

		candleSeries.setData(data);
		markerPlugin.setMarkers(markers);
		if (renderedTimeframe !== nextModel.timeframe) {
			renderedTimeframe = nextModel.timeframe;
			chart.timeScale().fitContent();
		}
		requestAnimationFrame(refreshPixelOverlays);
	}

	function refreshPixelOverlays(): void {
		if (!chart || !candleSeries) return;
		pixelLevels = model.levels.flatMap((level) => {
			const x1 = chart?.timeScale().timeToCoordinate(level.startTime as UTCTimestamp);
			const x2 = chart?.timeScale().timeToCoordinate(level.endTime as UTCTimestamp);
			const y = candleSeries?.priceToCoordinate(level.price);
			return x1 === null ||
				x1 === undefined ||
				x2 === null ||
				x2 === undefined ||
				y === null ||
				y === undefined
				? []
				: [{ ...level, x1, x2, y }];
		});
		pixelZones = model.zones.flatMap((zone) => {
			const x1 = chart?.timeScale().timeToCoordinate(zone.startTime as UTCTimestamp);
			const x2 = chart?.timeScale().timeToCoordinate(zone.endTime as UTCTimestamp);
			const top = candleSeries?.priceToCoordinate(zone.top);
			const bottom = candleSeries?.priceToCoordinate(zone.bottom);
			return x1 === null ||
				x1 === undefined ||
				x2 === null ||
				x2 === undefined ||
				top === null ||
				top === undefined ||
				bottom === null ||
				bottom === undefined
				? []
				: [
						{
							...zone,
							x: Math.min(x1, x2),
							y: Math.min(top, bottom),
							width: Math.max(Math.abs(x2 - x1), 2),
							height: Math.max(Math.abs(bottom - top), 1)
						}
					];
		});
	}
</script>

<div class="chart-stage" role="img" aria-label={ariaLabel}>
	<div class="chart-canvas" bind:this={container}></div>
	<svg
		class="overlay-layer"
		width={chartWidth}
		height={chartHeight}
		viewBox={`0 0 ${chartWidth} ${chartHeight}`}
		aria-hidden="true"
	>
		{#each pixelZones as zone (zone.id)}
			<g>
				<rect
					x={zone.x}
					y={zone.y}
					width={zone.width}
					height={zone.height}
					fill={zone.fillColor}
					stroke={zone.borderColor}
					stroke-width="0.8"
					stroke-opacity="0.55"
				/>
				{#if zone.width > 46}
					<text x={zone.x + 5} y={zone.y + 11} fill={zone.borderColor}>{zone.label}</text>
				{/if}
			</g>
		{/each}
		{#each pixelLevels as level (level.id)}
			<g>
				<line
					x1={level.x1}
					y1={level.y}
					x2={level.x2}
					y2={level.y}
					stroke={level.color}
					stroke-width={level.style === 'solid' ? 1.4 : 1}
					stroke-dasharray={level.style === 'dashed'
						? '6 4'
						: level.style === 'dotted'
							? '2 4'
							: undefined}
					stroke-opacity="0.82"
				/>
				{#if Math.abs(level.x2 - level.x1) > 38}
					<text x={Math.min(level.x1, level.x2) + 4} y={level.y - 4} fill={level.color}
						>{level.label}</text
					>
				{/if}
			</g>
		{/each}
	</svg>
	{#if model.candles.length === 0}
		<div class="empty-state">
			<strong>No closed candles available</strong>
			<span>The chart will populate when public market data is available.</span>
		</div>
	{/if}
</div>

<style>
	.chart-stage {
		position: relative;
		isolation: isolate;
		min-height: 420px;
		height: 100%;
		overflow: hidden;
		background:
			radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.045), transparent 42%), #090f1c;
	}

	.chart-canvas,
	.overlay-layer {
		position: absolute;
		inset: 0;
	}

	.overlay-layer {
		z-index: 3;
		pointer-events: none;
		overflow: visible;
	}

	.overlay-layer text {
		font-family: 'Inter Variable', sans-serif;
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.08em;
	}

	.empty-state {
		position: absolute;
		z-index: 4;
		inset: 0;
		display: grid;
		place-content: center;
		gap: 0.4rem;
		text-align: center;
		color: #dce7f8;
		pointer-events: none;
	}

	.empty-state span {
		font-size: 0.78rem;
		color: #6f809b;
	}
</style>
