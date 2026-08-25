<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		Activity,
		AlertTriangle,
		BookOpen,
		CandlestickChart,
		CircleDot,
		Database,
		FlaskConical,
		Layers3,
		Radio,
		ShieldCheck,
		SlidersHorizontal
	} from '@lucide/svelte';

	import {
		appendCanonicalChartCandles,
		buildTradingChartViewModel,
		DEFAULT_CHART_OVERLAY_VISIBILITY,
		overlaySourceFromCanonicalState,
		replayCanonicalChartCandles,
		TradingChart,
		type ChartOverlayCategory,
		type ChartOverlayVisibility,
		type TradingChartTimeframe
	} from '$lib/components/chart/index.js';
	import { buildLiveSetupPanelViewModel, LiveSetupPanel } from '$lib/components/setup/index.js';
	import type { Candle } from '$lib/domain/index.js';
	import {
		BinanceRealtimeMarketDataProvider,
		RealtimeCandleState,
		type RealtimeCandleStateSnapshot,
		type RealtimeConnectionState
	} from '$lib/services/index.js';

	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
	let timeframe = $state<TradingChartTimeframe>('1m');
	let visibility = $state<ChartOverlayVisibility>({ ...DEFAULT_CHART_OVERLAY_VISIBILITY });
	let realtimeOneMinuteCandles = $state.raw<Candle[]>([]);
	let realtimeFiveMinuteCandles = $state.raw<Candle[]>([]);
	let analysisState = $state.raw(replayCanonicalChartCandles(untrack(() => data.oneMinuteCandles)));
	let connectionState = $state<RealtimeConnectionState>('DISCONNECTED');
	let runtimeError = $state<string | null>(null);
	const persistedSetupVersions: Record<string, number> = {};
	let persistenceQueue = Promise.resolve();

	const overlayOptions: readonly {
		key: ChartOverlayCategory;
		label: string;
		shortLabel: string;
	}[] = [
		{ key: 'swings', label: 'Confirmed swings', shortLabel: 'Swings' },
		{ key: 'structure', label: 'HH · HL · LH · LL', shortLabel: 'Structure' },
		{ key: 'breaks', label: 'BOS and CHoCH', shortLabel: 'BOS / CHoCH' },
		{ key: 'liquidity', label: 'Active and swept liquidity', shortLabel: 'Liquidity' },
		{ key: 'sweeps', label: 'Liquidity sweeps', shortLabel: 'Sweeps' },
		{ key: 'fvg', label: 'Fair value gaps', shortLabel: 'FVG' },
		{ key: 'orderBlocks', label: 'Order blocks', shortLabel: 'Order Blocks' },
		{ key: 'risk', label: 'Entry, stop and target', shortLabel: 'Entry / SL / TP' }
	];

	const selectedHistoricalCandles = $derived(
		timeframe === '1m' ? data.oneMinuteCandles : data.fiveMinuteCandles
	);
	const selectedRealtimeCandles = $derived(
		timeframe === '1m' ? realtimeOneMinuteCandles : realtimeFiveMinuteCandles
	);
	const overlays = $derived(overlaySourceFromCanonicalState(analysisState, timeframe));
	const chartModel = $derived(
		buildTradingChartViewModel({
			timeframe,
			historicalCandles: selectedHistoricalCandles,
			realtimeCandles: selectedRealtimeCandles,
			overlays,
			visibility
		})
	);
	const lastCandle = $derived(chartModel.candles.at(-1) ?? null);
	const visibleOverlayCount = $derived(Object.values(visibility).filter(Boolean).length);
	const setupPanelModel = $derived(buildLiveSetupPanelViewModel(analysisState));

	onMount(() => {
		const candleState = new RealtimeCandleState();
		const provider = new BinanceRealtimeMarketDataProvider();
		const unsubscribe = provider.subscribe(
			{ symbol: 'BTCUSDT', timeframe: '1m' },
			{
				onCandle: (candle) => {
					try {
						const result = candleState.ingestWebSocketUpdate(candle);
						applyRealtimeSnapshot(result.snapshot);
						appendFinalizedAnalysis(result.finalizedOneMinuteCandles);
					} catch {
						runtimeError = 'Realtime candle continuity requires a fresh bootstrap.';
					}
				},
				onConnectionState: (status) => {
					connectionState = status.state;
				},
				onError: () => {
					runtimeError = 'Public market stream interrupted; reconnecting automatically.';
				}
			}
		);

		try {
			const first = data.oneMinuteCandles[0];
			const last = data.oneMinuteCandles.at(-1);
			const result = candleState.ingestRestBootstrap(
				data.oneMinuteCandles,
				first && last
					? { startTimestamp: first.openTimestamp, endTimestamp: last.openTimestamp }
					: undefined
			);
			applyRealtimeSnapshot(result.snapshot);
			appendFinalizedAnalysis(
				result.finalizedOneMinuteCandles.filter(
					(candle) => candle.openTimestamp > (last?.openTimestamp ?? -1)
				)
			);
			queueSetupPersistence(analysisState.pipeline.setupRegistry);
		} catch {
			runtimeError = 'Historical and realtime candles could not be reconciled safely.';
		}

		return unsubscribe;
	});

	function applyRealtimeSnapshot(snapshot: RealtimeCandleStateSnapshot): void {
		realtimeOneMinuteCandles = [
			...snapshot.closedOneMinuteCandles,
			...(snapshot.currentOneMinuteCandle ? [snapshot.currentOneMinuteCandle] : [])
		];
		realtimeFiveMinuteCandles = [
			...snapshot.closedFiveMinuteCandles,
			...(snapshot.currentFiveMinuteCandle ? [snapshot.currentFiveMinuteCandle] : [])
		];
		if (snapshot.bufferedFinalOneMinuteCandles.length === 0 && connectionState === 'CONNECTED') {
			runtimeError = null;
		}
	}

	function appendFinalizedAnalysis(candles: readonly Candle[]): void {
		if (candles.length === 0) return;
		analysisState = appendCanonicalChartCandles(analysisState, candles);
		queueSetupPersistence(analysisState.pipeline.setupRegistry);
	}

	function queueSetupPersistence(setups: typeof analysisState.pipeline.setupRegistry): void {
		const snapshots = structuredClone(setups);
		persistenceQueue = persistenceQueue
			.then(async () => {
				const changed = snapshots.filter(
					(setup) => (persistedSetupVersions[setup.id] ?? -1) < setup.updatedAt
				);
				if (changed.length === 0) return;
				const response = await fetch(resolve('/api/journal/setups'), {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ setups: changed })
				});
				if (!response.ok) return;
				for (const setup of changed) persistedSetupVersions[setup.id] = setup.updatedAt;
			})
			.catch(() => undefined);
	}

	function toggleOverlay(category: ChartOverlayCategory): void {
		visibility = { ...visibility, [category]: !visibility[category] };
	}

	function formatPrice(price: number): string {
		return new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(price);
	}

	function connectionLabel(state: RealtimeConnectionState): string {
		switch (state) {
			case 'CONNECTED':
				return 'Live market data';
			case 'STALE':
				return 'Feed stale';
			case 'RECONNECTING':
				return 'Reconnecting';
			case 'CONNECTING':
				return 'Connecting';
			default:
				return 'Offline';
		}
	}
</script>

<svelte:head>
	<title>Structure Map · SMC Research</title>
	<meta
		name="description"
		content="BTCUSDT 1m and derived 5m candlestick chart with deterministic SMC overlays."
	/>
</svelte:head>

<div class="market-shell">
	<header class="topbar">
		<a class="brand" href={resolve('/')} aria-label="SMC Research structure map">
			<span class="brand-mark"><Activity size={18} strokeWidth={2.4} /></span>
			<span>
				<strong>SMC Research</strong>
				<small>Deterministic structure map</small>
			</span>
		</a>
		<nav aria-label="Research navigation">
			<a class="nav-link active" href={resolve('/')}><CandlestickChart size={15} /> Structure map</a
			>
			<a class="nav-link" href={resolve('/backtest')}><FlaskConical size={15} /> Backtest lab</a>
			<a class="nav-link" href={resolve('/history')}><BookOpen size={15} /> Research history</a>
		</nav>
		<div class:live={connectionState === 'CONNECTED'} class="connection-chip">
			<span class="status-dot"></span>
			{connectionLabel(connectionState)}
		</div>
	</header>

	<main>
		<section class="page-heading">
			<div>
				<div class="eyebrow"><Radio size={13} /> Public BTCUSDT market feed</div>
				<h1>Market structure, <span>without the guesswork.</span></h1>
				<p>
					Historical and realtime candles share one canonical timeline. Every overlay comes from
					confirmed domain state—not chart-side pattern detection.
				</p>
			</div>
			<div class="protocol-card">
				<ShieldCheck size={20} />
				<div>
					<strong>Closed-candle protocol</strong>
					<span>5m is derived from five finalized 1m candles</span>
				</div>
			</div>
		</section>

		{#if data.bootstrapError || runtimeError}
			<div class="warning-banner" role="status">
				<AlertTriangle size={16} />
				<span>{runtimeError ?? data.bootstrapError}</span>
			</div>
		{/if}

		<div class="workspace-grid">
			<section class="chart-card">
				<div class="chart-toolbar">
					<div class="market-identity">
						<div class="asset-mark">₿</div>
						<div>
							<div class="symbol-row"><strong>BTCUSDT</strong><span>SPOT</span></div>
							<small>Binance public market data · UTC</small>
						</div>
					</div>
					<div class="last-price">
						<span>Last observed</span>
						<strong>{lastCandle ? `$${formatPrice(lastCandle.close)}` : '—'}</strong>
					</div>
					<div class="toolbar-meta">
						<span><Database size={13} /> {chartModel.candles.length} bars</span>
						<span><Layers3 size={13} /> {visibleOverlayCount}/8 layers</span>
					</div>
					<div class="timeframe-switch" aria-label="Chart timeframe">
						<button
							class:active={timeframe === '1m'}
							type="button"
							onclick={() => (timeframe = '1m')}>1m</button
						>
						<button
							class:active={timeframe === '5m'}
							type="button"
							onclick={() => (timeframe = '5m')}>5m</button
						>
					</div>
				</div>

				<div class="overlay-toolbar">
					<div class="overlay-title"><SlidersHorizontal size={14} /> Overlays</div>
					<div class="overlay-toggles">
						{#each overlayOptions as option (option.key)}
							<button
								type="button"
								class:active={visibility[option.key]}
								aria-pressed={visibility[option.key]}
								title={option.label}
								onclick={() => toggleOverlay(option.key)}
							>
								<span></span>{option.shortLabel}
							</button>
						{/each}
					</div>
				</div>

				<div class="chart-frame"><TradingChart model={chartModel} /></div>

				<footer class="chart-footer">
					<div class="legend">
						<span><i class="bullish"></i> Bullish / demand</span>
						<span><i class="bearish"></i> Bearish / supply</span>
						<span><i class="liquidity"></i> Liquidity</span>
						<span><i class="order-block"></i> Order block</span>
					</div>
					<div class="research-note">
						<CircleDot size={12} /> Analysis only · Manual decisions outside the application
					</div>
					<a href="https://www.tradingview.com/" target="_blank" rel="noreferrer"
						>Charts by TradingView</a
					>
				</footer>
			</section>
			<LiveSetupPanel model={setupPanelModel} />
		</div>
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #060b14;
	}
	:global(button),
	:global(a) {
		-webkit-tap-highlight-color: transparent;
	}
	.market-shell {
		min-height: 100vh;
		color: #dce7f8;
		background:
			radial-gradient(circle at 82% -8%, rgba(45, 212, 191, 0.08), transparent 28%),
			radial-gradient(circle at 8% 30%, rgba(56, 189, 248, 0.055), transparent 26%), #060b14;
	}
	.topbar {
		height: 68px;
		padding: 0 3.5vw;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		border-bottom: 1px solid rgba(148, 163, 184, 0.1);
		background: rgba(6, 11, 20, 0.88);
		backdrop-filter: blur(18px);
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.brand,
	.nav-link {
		text-decoration: none;
		color: inherit;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: fit-content;
	}
	.brand-mark {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		color: #06101a;
		background: linear-gradient(135deg, #5eead4, #38bdf8);
		border-radius: 10px;
		box-shadow: 0 0 24px rgba(45, 212, 191, 0.18);
	}
	.brand > span:last-child {
		display: grid;
		gap: 0.08rem;
	}
	.brand strong {
		font-size: 0.86rem;
		letter-spacing: -0.01em;
	}
	.brand small,
	.market-identity small {
		font-size: 0.64rem;
		color: #657590;
		letter-spacing: 0.03em;
	}
	nav {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem;
		background: rgba(15, 23, 42, 0.58);
		border: 1px solid rgba(148, 163, 184, 0.09);
		border-radius: 12px;
	}
	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.48rem 0.72rem;
		font-size: 0.72rem;
		color: #6f809b;
		border-radius: 8px;
	}
	.nav-link.active {
		color: #dce7f8;
		background: rgba(148, 163, 184, 0.09);
	}
	.connection-chip {
		justify-self: end;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.42rem 0.65rem;
		font-size: 0.67rem;
		color: #8290a7;
		background: rgba(15, 23, 42, 0.6);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 999px;
	}
	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #64748b;
	}
	.connection-chip.live {
		color: #99f6e4;
		border-color: rgba(45, 212, 191, 0.18);
	}
	.connection-chip.live .status-dot {
		background: #2dd4bf;
		box-shadow: 0 0 0 4px rgba(45, 212, 191, 0.09);
	}
	main {
		width: min(1500px, 93vw);
		margin: 0 auto;
		padding: 3rem 0 4rem;
	}
	.page-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 2rem;
		margin-bottom: 1.8rem;
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-bottom: 0.8rem;
		font-size: 0.67rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: #5eead4;
	}
	h1 {
		margin: 0;
		font-size: clamp(2rem, 4vw, 3.5rem);
		line-height: 1.03;
		letter-spacing: -0.055em;
		font-weight: 670;
	}
	h1 span {
		color: #6f809b;
	}
	.page-heading p {
		max-width: 690px;
		margin: 1rem 0 0;
		font-size: 0.86rem;
		line-height: 1.7;
		color: #7787a1;
	}
	.protocol-card {
		min-width: 290px;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
		color: #5eead4;
		background: linear-gradient(135deg, rgba(45, 212, 191, 0.08), rgba(56, 189, 248, 0.035));
		border: 1px solid rgba(45, 212, 191, 0.13);
		border-radius: 14px;
	}
	.protocol-card div {
		display: grid;
		gap: 0.18rem;
	}
	.protocol-card strong {
		font-size: 0.75rem;
		color: #c7f9f0;
	}
	.protocol-card span {
		font-size: 0.66rem;
		color: #72849c;
	}
	.warning-banner {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin-bottom: 0.85rem;
		padding: 0.65rem 0.8rem;
		font-size: 0.7rem;
		color: #fcd34d;
		background: rgba(245, 158, 11, 0.06);
		border: 1px solid rgba(245, 158, 11, 0.13);
		border-radius: 10px;
	}
	.chart-card {
		overflow: hidden;
		background: rgba(9, 15, 28, 0.94);
		border: 1px solid rgba(148, 163, 184, 0.11);
		border-radius: 18px;
		box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
	}
	.workspace-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 360px;
		align-items: start;
		gap: 1rem;
	}
	.chart-toolbar {
		min-height: 78px;
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0 1.1rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.09);
	}
	.market-identity {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-right: 1.5rem;
		border-right: 1px solid rgba(148, 163, 184, 0.1);
	}
	.asset-mark {
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		font-size: 1.1rem;
		font-weight: 700;
		color: #111827;
		background: #f59e0b;
		border-radius: 50%;
	}
	.symbol-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-bottom: 0.16rem;
	}
	.symbol-row strong {
		font-size: 0.92rem;
		letter-spacing: 0.02em;
	}
	.symbol-row span {
		padding: 0.12rem 0.3rem;
		font-size: 0.5rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: #718097;
		background: rgba(148, 163, 184, 0.09);
		border-radius: 4px;
	}
	.last-price {
		display: grid;
		gap: 0.18rem;
	}
	.last-price span {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #5f6f89;
	}
	.last-price strong {
		font-size: 1.1rem;
		font-variant-numeric: tabular-nums;
	}
	.toolbar-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}
	.toolbar-meta span {
		display: flex;
		align-items: center;
		gap: 0.32rem;
		padding: 0.38rem 0.52rem;
		font-size: 0.62rem;
		color: #70819c;
		background: rgba(15, 23, 42, 0.55);
		border: 1px solid rgba(148, 163, 184, 0.08);
		border-radius: 7px;
	}
	.timeframe-switch {
		display: flex;
		padding: 0.22rem;
		background: #070c16;
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 9px;
	}
	.timeframe-switch button,
	.overlay-toggles button {
		border: 0;
		font: inherit;
		cursor: pointer;
	}
	.timeframe-switch button {
		padding: 0.4rem 0.62rem;
		font-size: 0.67rem;
		font-weight: 700;
		color: #64748b;
		background: transparent;
		border-radius: 6px;
	}
	.timeframe-switch button.active {
		color: #07111a;
		background: #5eead4;
	}
	.overlay-toolbar {
		min-height: 52px;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0 1.1rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.08);
	}
	.overlay-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #64748b;
	}
	.overlay-toggles {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.overlay-toggles button {
		white-space: nowrap;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.34rem 0.52rem;
		font-size: 0.61rem;
		color: #61718b;
		background: transparent;
		border-radius: 6px;
	}
	.overlay-toggles button span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #334155;
	}
	.overlay-toggles button.active {
		color: #a8b7cc;
		background: rgba(148, 163, 184, 0.075);
	}
	.overlay-toggles button.active span {
		background: #5eead4;
		box-shadow: 0 0 6px rgba(45, 212, 191, 0.5);
	}
	.chart-frame {
		height: min(61vh, 650px);
		min-height: 470px;
	}
	.chart-footer {
		min-height: 46px;
		display: flex;
		align-items: center;
		gap: 1.3rem;
		padding: 0 1.1rem;
		font-size: 0.58rem;
		color: #52627a;
		border-top: 1px solid rgba(148, 163, 184, 0.08);
	}
	.legend {
		display: flex;
		gap: 0.9rem;
	}
	.legend span,
	.research-note {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.legend i {
		width: 12px;
		height: 2px;
		border-radius: 2px;
	}
	.legend .bullish {
		background: #2dd4bf;
	}
	.legend .bearish {
		background: #fb7185;
	}
	.legend .liquidity {
		background: #38bdf8;
	}
	.legend .order-block {
		background: #fbbf24;
	}
	.research-note {
		margin-left: auto;
	}
	.chart-footer a {
		color: #60708a;
		text-decoration: none;
	}
	.chart-footer a:hover {
		color: #94a3b8;
	}
	@media (max-width: 980px) {
		.topbar {
			grid-template-columns: 1fr auto;
		}
		nav {
			display: none;
		}
		.page-heading {
			align-items: flex-start;
			flex-direction: column;
		}
		.protocol-card {
			min-width: 0;
		}
		.toolbar-meta,
		.last-price {
			display: none;
		}
		.timeframe-switch {
			margin-left: auto;
		}
		.chart-footer {
			flex-wrap: wrap;
			padding: 0.7rem 1rem;
		}
		.research-note {
			margin-left: 0;
		}
	}
	@media (max-width: 1180px) {
		.workspace-grid {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 640px) {
		.topbar {
			height: 60px;
			padding: 0 4vw;
		}
		.brand small,
		.connection-chip {
			display: none;
		}
		main {
			width: 94vw;
			padding-top: 2rem;
		}
		h1 {
			font-size: 2.15rem;
		}
		.chart-toolbar {
			gap: 0.75rem;
		}
		.market-identity {
			padding-right: 0;
			border-right: 0;
		}
		.asset-mark,
		.overlay-title,
		.legend,
		.research-note {
			display: none;
		}
		.chart-frame {
			height: 58vh;
			min-height: 430px;
		}
	}
</style>
