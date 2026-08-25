<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		Activity,
		ArrowDownRight,
		ArrowUpRight,
		BookOpen,
		CandlestickChart,
		ChevronDown,
		Clock3,
		Database,
		FlaskConical,
		Search,
		ShieldCheck
	} from '@lucide/svelte';

	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	function formatTimestamp(timestamp: number): string {
		return new Intl.DateTimeFormat('en-GB', {
			timeZone: 'UTC',
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).format(timestamp);
	}

	function formatDate(timestamp: number): string {
		return new Intl.DateTimeFormat('en-GB', {
			timeZone: 'UTC',
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		}).format(timestamp);
	}

	function formatPrice(value: number): string {
		return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
	}

	function formatR(value: number): string {
		return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
	}

	function displayState(state: string): string {
		return state.replaceAll('_', ' ');
	}
</script>

<svelte:head>
	<title>Research History · SMC Research</title>
	<meta
		name="description"
		content="Persistent setup and backtest research journal with full reasoning and invalidation details."
	/>
</svelte:head>

<div class="history-shell">
	<header class="topbar">
		<a class="brand" href={resolve('/')} aria-label="SMC Research structure map">
			<span class="brand-mark"><Activity size={18} strokeWidth={2.4} /></span>
			<span><strong>SMC Research</strong><small>Persistent evidence journal</small></span>
		</a>
		<nav aria-label="Research navigation">
			<a href={resolve('/')}><CandlestickChart size={15} /> Structure map</a>
			<a href={resolve('/backtest')}><FlaskConical size={15} /> Backtest lab</a>
			<a class="active" href={resolve('/history')}><BookOpen size={15} /> History</a>
		</nav>
	</header>

	<main>
		<section class="hero">
			<div>
				<div class="eyebrow"><Database size={14} /> SQLite research journal</div>
				<h1>Every setup leaves <span>an audit trail.</span></h1>
				<p>
					Review closed-candle setup snapshots and completed backtest outcomes. Stored reasoning,
					eligibility failures, and invalidation causes remain attached to the evidence.
				</p>
			</div>
			<div class="protocol-card">
				<ShieldCheck size={20} />
				<div>
					<strong>Research-only persistence</strong><span
						>Storage follows analysis; it never drives it</span
					>
				</div>
			</div>
		</section>

		{#if data.runs.length > 0}
			<section class="run-strip" aria-label="Recent backtest runs">
				<div class="section-title">
					<span>Recent runs</span><small>{data.runs.length} stored</small>
				</div>
				<div class="run-grid">
					{#each data.runs.slice(0, 4) as run (run.id)}
						<article>
							<div>
								<strong>{run.symbol}</strong><span class:positive={run.metrics.totalR > 0}
									>{formatR(run.metrics.totalR)}</span
								>
							</div>
							<p>{formatDate(run.startTimestamp)} → {formatDate(run.endTimestamp)}</p>
							<small
								>{run.metrics.totalTrades} trades · {run.validationVerdict.replaceAll(
									'_',
									' '
								)}</small
							>
						</article>
					{/each}
				</div>
			</section>
		{/if}

		<section class="journal-card">
			<div class="journal-heading">
				<div>
					<BookOpen size={18} />
					<div>
						<strong>Setup & trade history</strong><span>{data.entries.length} matching records</span
						>
					</div>
				</div>
			</div>

			<form class="filters" method="GET">
				<label
					>Record<select name="kind" value={data.filters.kind}
						><option value="ALL">All records</option><option value="SETUP">Setups</option><option
							value="TRADE">Trades</option
						></select
					></label
				>
				<label
					>Source<select name="source" value={data.filters.source}
						><option value="ALL">All sources</option><option value="LIVE">Live analysis</option
						><option value="BACKTEST">Backtests</option></select
					></label
				>
				<label
					>Direction<select name="direction" value={data.filters.direction}
						><option value="ALL">Both</option><option value="LONG">Long</option><option
							value="SHORT">Short</option
						></select
					></label
				>
				<label
					>State<select name="state" value={data.filters.state}
						><option value="ALL">Any state</option><optgroup label="Setups"
							><option value="FORMING">Forming</option><option value="VALID">Valid</option><option
								value="TRIGGERED">Triggered</option
							><option value="INVALIDATED">Invalidated</option><option value="TP"
								>Take profit</option
							><option value="SL">Stop loss</option><option value="EXPIRED_END_OF_RANGE"
								>Expired at range end</option
							><option value="OPEN_END_OF_RANGE">Open at range end</option></optgroup
						><optgroup label="Trades"
							><option value="WIN">Win</option><option value="LOSS">Loss</option></optgroup
						></select
					></label
				>
				<button type="submit"><Search size={15} /> Filter</button>
			</form>

			{#if data.entries.length === 0}
				<div class="empty-state">
					<Database size={28} />
					<strong>No matching research records yet</strong>
					<p>Run a historical backtest or allow the structure map to observe finalized candles.</p>
				</div>
			{:else}
				<div class="entry-list">
					{#each data.entries as entry (entry.journalId)}
						<details class="entry">
							<summary>
								<span
									class:short={entry.kind === 'SETUP'
										? entry.setup.direction === 'SHORT'
										: entry.trade.direction === 'SHORT'}
									class="direction-icon"
								>
									{#if (entry.kind === 'SETUP' ? entry.setup.direction : entry.trade.direction) === 'LONG'}<ArrowUpRight
											size={17}
										/>{:else}<ArrowDownRight size={17} />{/if}
								</span>
								<div class="entry-primary">
									<div>
										<strong
											>{entry.kind === 'SETUP' ? entry.setup.symbol : 'BTCUSDT'} · {entry.kind}</strong
										><span class="source">{entry.source}</span>
									</div>
									<small><Clock3 size={12} /> {formatTimestamp(entry.timestamp)} UTC</small>
								</div>
								{#if entry.kind === 'SETUP'}
									<span class="classification"
										>{entry.setup.classification} · {entry.setup.score}</span
									>
									<span class="state">{displayState(entry.setup.status)}</span>
								{:else}
									<span class="classification">Score {entry.trade.setupScore}</span>
									<span class:loss={entry.trade.result === 'LOSS'} class="state"
										>{entry.trade.result} · {formatR(entry.trade.rMultiple)}</span
									>
								{/if}
								<ChevronDown class="chevron" size={16} />
							</summary>

							<div class="detail-grid">
								{#if entry.kind === 'SETUP'}
									<div class="price-grid">
										<span>Entry<strong>{formatPrice(entry.setup.entryPrice)}</strong></span><span
											>Stop<strong>{formatPrice(entry.setup.stopLoss)}</strong></span
										><span>Target<strong>{formatPrice(entry.setup.takeProfit)}</strong></span><span
											>R:R<strong>{entry.setup.riskReward.toFixed(2)}</strong></span
										>
									</div>
									<div class="reason-panel">
										<strong>Setup reasoning</strong
										>{#each entry.setup.reasons as reason (reason.key)}<div
												class:valid={reason.valid}
											>
												<span>{reason.valid ? '✓' : '×'}</span>
												<p>
													<b>{reason.label} · {reason.score} pts</b><small
														>{reason.description}</small
													>
												</p>
											</div>{/each}
									</div>
									<div class="context-panel">
										<p>
											<span>Eligibility</span><strong
												>{entry.setup.eligibility.eligible ? 'Eligible' : 'Blocked'}</strong
											>
										</p>
										<p>
											<span>Created</span><strong
												>{formatTimestamp(entry.setup.createdAt)} UTC</strong
											>
										</p>
										<p><span>Pending bars</span><strong>{entry.setup.pendingEntryBars}</strong></p>
										{#if entry.setup.invalidationReason}<p class="invalidation">
												<span>Invalidation</span><strong>{entry.setup.invalidationReason}</strong>
											</p>{/if}{#each entry.setup.eligibility.failures as failure (failure.key)}<p
												class="invalidation"
											>
												<span>{failure.label}</span><strong>{failure.description}</strong>
											</p>{/each}
									</div>
								{:else}
									<div class="price-grid">
										<span>Entry<strong>{formatPrice(entry.trade.entry)}</strong></span><span
											>Exit<strong>{formatPrice(entry.trade.exitPrice)}</strong></span
										><span>Stop<strong>{formatPrice(entry.trade.stopLoss)}</strong></span><span
											>Target<strong>{formatPrice(entry.trade.takeProfit)}</strong></span
										>
									</div>
									<div class="reason-panel">
										<strong>Entry reasoning snapshot</strong
										>{#each entry.trade.setupReasons as reason (reason.key)}<div
												class:valid={reason.valid}
											>
												<span>{reason.valid ? '✓' : '×'}</span>
												<p>
													<b>{reason.label} · {reason.score} pts</b><small
														>{reason.description}</small
													>
												</p>
											</div>{/each}
									</div>
									<div class="context-panel">
										<p>
											<span>Exit reason</span><strong>{displayState(entry.trade.exitReason)}</strong
											>
										</p>
										<p>
											<span>Holding period</span><strong
												>{formatTimestamp(entry.trade.entryTimestamp)} → {formatTimestamp(
													entry.trade.exitTimestamp
												)}</strong
											>
										</p>
										<p>
											<span>Fees / slippage</span><strong
												>{formatPrice(entry.trade.feesPaid)} / {formatPrice(
													entry.trade.slippagePaid
												)}</strong
											>
										</p>
										<p>
											<span>Intrabar ambiguity</span><strong
												>{entry.trade.intrabarAmbiguous
													? 'Resolved conservatively'
													: 'None'}</strong
											>
										</p>
									</div>
								{/if}
							</div>
						</details>
					{/each}
				</div>
			{/if}
		</section>
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #070b10;
		color: #e8edf2;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	:global(*) {
		box-sizing: border-box;
	}
	.history-shell {
		min-height: 100vh;
		background:
			radial-gradient(circle at 78% 0%, rgba(20, 184, 166, 0.08), transparent 30%), #070b10;
	}
	.topbar {
		height: 70px;
		padding: 0 clamp(20px, 4vw, 64px);
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #1b252f;
		background: rgba(7, 11, 16, 0.88);
		backdrop-filter: blur(16px);
	}
	.brand,
	nav a {
		color: inherit;
		text-decoration: none;
		display: flex;
		align-items: center;
	}
	.brand {
		gap: 11px;
	}
	.brand-mark {
		width: 35px;
		height: 35px;
		display: grid;
		place-items: center;
		border-radius: 9px;
		color: #2dd4bf;
		background: #112927;
		border: 1px solid #20504b;
	}
	.brand strong,
	.brand small {
		display: block;
	}
	.brand strong {
		font-size: 14px;
		letter-spacing: 0.03em;
	}
	.brand small {
		color: #647483;
		font-size: 10px;
		margin-top: 2px;
	}
	nav {
		display: flex;
		gap: 6px;
	}
	nav a {
		gap: 7px;
		padding: 9px 12px;
		border-radius: 7px;
		color: #71808e;
		font-size: 12px;
		font-weight: 650;
	}
	nav a:hover,
	nav a.active {
		color: #dce7ed;
		background: #111922;
	}
	main {
		width: min(1180px, calc(100% - 40px));
		margin: auto;
		padding: 54px 0 80px;
	}
	.hero {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 40px;
		margin-bottom: 34px;
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: 7px;
		color: #2dd4bf;
		text-transform: uppercase;
		letter-spacing: 0.13em;
		font-size: 10px;
		font-weight: 800;
	}
	h1 {
		margin: 11px 0 12px;
		max-width: 700px;
		font-size: clamp(34px, 5vw, 57px);
		line-height: 0.98;
		letter-spacing: -0.045em;
	}
	h1 span {
		color: #2dd4bf;
	}
	.hero > div > p {
		max-width: 680px;
		margin: 0;
		color: #7f8e9b;
		font-size: 13px;
		line-height: 1.65;
	}
	.protocol-card {
		min-width: 285px;
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 16px;
		border: 1px solid #1d3135;
		border-radius: 11px;
		background: rgba(14, 25, 29, 0.7);
		color: #2dd4bf;
	}
	.protocol-card strong,
	.protocol-card span {
		display: block;
	}
	.protocol-card strong {
		color: #dce7ed;
		font-size: 12px;
	}
	.protocol-card span {
		margin-top: 4px;
		color: #687985;
		font-size: 10px;
	}
	.run-strip,
	.journal-card {
		border: 1px solid #1b2731;
		background: rgba(11, 17, 23, 0.92);
		border-radius: 13px;
	}
	.run-strip {
		padding: 18px;
		margin-bottom: 16px;
	}
	.section-title {
		display: flex;
		justify-content: space-between;
		margin-bottom: 12px;
		font-size: 11px;
		font-weight: 750;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #9aabb6;
	}
	.section-title small {
		color: #53616c;
	}
	.run-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 9px;
	}
	.run-grid article {
		padding: 12px;
		border: 1px solid #1c2933;
		border-radius: 8px;
		background: #0d141b;
	}
	.run-grid article div {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
	}
	.run-grid article span {
		color: #f87171;
	}
	.run-grid article span.positive {
		color: #2dd4bf;
	}
	.run-grid p,
	.run-grid small {
		margin: 6px 0 0;
		color: #697986;
		font-size: 9px;
	}
	.run-grid small {
		display: block;
		color: #8999a4;
	}
	.journal-heading {
		padding: 18px 20px;
		border-bottom: 1px solid #1b2731;
	}
	.journal-heading > div {
		display: flex;
		align-items: center;
		gap: 10px;
		color: #2dd4bf;
	}
	.journal-heading strong,
	.journal-heading span {
		display: block;
	}
	.journal-heading strong {
		color: #dce7ed;
		font-size: 13px;
	}
	.journal-heading span {
		margin-top: 3px;
		color: #667683;
		font-size: 10px;
	}
	.filters {
		display: grid;
		grid-template-columns: repeat(4, 1fr) auto;
		gap: 10px;
		padding: 16px 20px;
		border-bottom: 1px solid #1b2731;
		align-items: end;
	}
	.filters label {
		color: #71808c;
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 750;
	}
	.filters select {
		width: 100%;
		margin-top: 6px;
		padding: 9px 10px;
		border: 1px solid #25313c;
		border-radius: 6px;
		background: #0a1016;
		color: #c8d3da;
		font: inherit;
		text-transform: none;
		letter-spacing: 0;
	}
	.filters button {
		height: 34px;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 15px;
		border: 1px solid #225c55;
		border-radius: 6px;
		background: #123530;
		color: #5eead4;
		font-size: 11px;
		font-weight: 750;
		cursor: pointer;
	}
	.empty-state {
		padding: 65px 20px;
		text-align: center;
		color: #40505b;
	}
	.empty-state :global(svg) {
		color: #2a3a44;
	}
	.empty-state strong {
		display: block;
		margin-top: 13px;
		color: #92a0aa;
		font-size: 13px;
	}
	.empty-state p {
		margin: 7px 0 0;
		font-size: 11px;
	}
	.entry-list {
		padding: 0 20px 20px;
	}
	.entry {
		border-bottom: 1px solid #18232c;
	}
	.entry summary {
		min-height: 72px;
		display: flex;
		align-items: center;
		gap: 12px;
		list-style: none;
		cursor: pointer;
	}
	.entry summary::-webkit-details-marker {
		display: none;
	}
	.direction-icon {
		flex: none;
		width: 31px;
		height: 31px;
		display: grid;
		place-items: center;
		border-radius: 7px;
		background: #10332f;
		color: #2dd4bf;
	}
	.direction-icon.short {
		background: #351a20;
		color: #fb7185;
	}
	.entry-primary {
		min-width: 190px;
		flex: 1;
	}
	.entry-primary > div {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.entry-primary strong {
		font-size: 11px;
	}
	.source {
		padding: 2px 5px;
		border-radius: 3px;
		background: #17232d;
		color: #728391;
		font-size: 8px;
		font-weight: 800;
	}
	.entry-primary small {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-top: 5px;
		color: #596975;
		font-size: 9px;
	}
	.classification,
	.state {
		min-width: 104px;
		color: #84939e;
		font-size: 10px;
		text-align: right;
	}
	.state {
		padding: 5px 7px;
		border-radius: 4px;
		color: #5eead4;
		background: #102c29;
		font-weight: 750;
	}
	.state.loss {
		color: #fb7185;
		background: #30171d;
	}
	.entry :global(.chevron) {
		color: #45535e;
		transition: transform 0.2s;
	}
	.entry[open] :global(.chevron) {
		transform: rotate(180deg);
	}
	.detail-grid {
		display: grid;
		grid-template-columns: 1fr 1.5fr 1.2fr;
		gap: 14px;
		padding: 0 0 18px 43px;
	}
	.price-grid,
	.reason-panel,
	.context-panel {
		padding: 13px;
		border: 1px solid #1b2933;
		border-radius: 7px;
		background: #0a1117;
	}
	.price-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.price-grid span,
	.context-panel span {
		color: #5f707d;
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.price-grid strong {
		display: block;
		margin-top: 3px;
		color: #c3ced5;
		font-size: 11px;
	}
	.reason-panel > strong {
		display: block;
		margin-bottom: 8px;
		color: #8496a1;
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
	}
	.reason-panel > div {
		display: flex;
		gap: 7px;
		padding: 6px 0;
		border-top: 1px solid #17222b;
		color: #fb7185;
	}
	.reason-panel > div.valid {
		color: #2dd4bf;
	}
	.reason-panel p {
		margin: 0;
		color: #93a2ac;
	}
	.reason-panel b,
	.reason-panel small {
		display: block;
		font-size: 9px;
	}
	.reason-panel small {
		margin-top: 3px;
		color: #596a76;
		line-height: 1.35;
	}
	.context-panel p {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin: 0;
		padding: 7px 0;
		border-bottom: 1px solid #17222b;
	}
	.context-panel p:last-child {
		border: 0;
	}
	.context-panel strong {
		color: #9caab3;
		font-size: 9px;
		text-align: right;
	}
	.context-panel .invalidation strong {
		color: #fb7185;
	}
	@media (max-width: 850px) {
		.topbar {
			height: auto;
			padding-block: 14px;
			align-items: flex-start;
		}
		.topbar nav {
			flex-wrap: wrap;
			justify-content: flex-end;
		}
		.hero {
			align-items: flex-start;
			flex-direction: column;
		}
		.protocol-card {
			width: 100%;
		}
		.run-grid {
			grid-template-columns: 1fr 1fr;
		}
		.filters {
			grid-template-columns: 1fr 1fr;
		}
		.detail-grid {
			grid-template-columns: 1fr;
			padding-left: 0;
		}
		.classification {
			display: none;
		}
	}
	@media (max-width: 560px) {
		main {
			width: min(100% - 24px, 1180px);
			padding-top: 35px;
		}
		.brand small {
			display: none;
		}
		.topbar {
			padding-inline: 12px;
			gap: 12px;
		}
		.topbar nav a {
			padding: 8px;
			font-size: 0;
		}
		.topbar nav a :global(svg) {
			width: 17px;
			height: 17px;
		}
		.run-grid {
			grid-template-columns: 1fr;
		}
		.filters {
			grid-template-columns: 1fr;
		}
		.entry-primary {
			min-width: 0;
		}
		.source,
		.classification {
			display: none;
		}
		.state {
			min-width: auto;
		}
		.detail-grid {
			padding-left: 0;
		}
	}
</style>
