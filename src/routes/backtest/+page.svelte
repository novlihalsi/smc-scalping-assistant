<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import {
		Activity,
		AlertTriangle,
		ArrowDownRight,
		ArrowUpRight,
		BarChart3,
		CheckCircle2,
		Clock3,
		Database,
		FlaskConical,
		Play,
		ShieldCheck,
		Target
	} from '@lucide/svelte';
	import type { SubmitFunction } from '@sveltejs/kit';

	import type { EquityCurvePoint } from '$lib/domain/index.js';

	import type { ActionData, PageData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let running = $state(false);
	const report = $derived(form?.success === true ? form.report : null);
	const error = $derived(form?.success === false ? form.error : null);
	const values = $derived(form?.values ?? data.defaults);
	const chartPath = $derived(report ? createEquityPath(report.analytics.equityCurve) : '');
	const zeroLineY = $derived(report ? getZeroLineY(report.analytics.equityCurve) : 110);

	const submitBacktest: SubmitFunction = () => {
		running = true;
		return async ({ update }) => {
			try {
				await update();
			} finally {
				running = false;
			}
		};
	};

	function createEquityPath(points: readonly EquityCurvePoint[]): string {
		if (points.length === 0) return '';
		const values = points.map(({ cumulativeR }) => cumulativeR);
		const min = Math.min(0, ...values);
		const max = Math.max(0, ...values);
		const range = max - min || 1;
		return points
			.map(({ cumulativeR }, index) => {
				const x = points.length === 1 ? 500 : (index / (points.length - 1)) * 1000;
				const y = 200 - ((cumulativeR - min) / range) * 180;
				return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function getZeroLineY(points: readonly EquityCurvePoint[]): number {
		if (points.length === 0) return 200;
		const values = points.map(({ cumulativeR }) => cumulativeR);
		const min = Math.min(0, ...values);
		const max = Math.max(0, ...values);
		return 200 - ((0 - min) / (max - min || 1)) * 180;
	}

	function formatNumber(value: number, digits = 2): string {
		return new Intl.NumberFormat('en-US', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		}).format(value);
	}

	function formatR(value: number): string {
		return `${value >= 0 ? '+' : ''}${formatNumber(value)}R`;
	}

	function formatPercent(value: number): string {
		return `${formatNumber(value, 1)}%`;
	}

	function formatDuration(milliseconds: number): string {
		if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)}s`;
		return `${formatNumber(milliseconds / 60_000, 1)}m`;
	}

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
</script>

<svelte:head>
	<title>Backtest Lab · SMC Research</title>
	<meta
		name="description"
		content="Chronological SMC strategy backtesting, analytics, and validation reporting."
	/>
</svelte:head>

<div class="research-shell">
	<header class="topbar">
		<a class="brand" href={resolve('/backtest')} aria-label="SMC Research home">
			<span class="brand-mark"><Activity size={18} strokeWidth={2.4} /></span>
			<span>
				<strong>SMC Research</strong>
				<small>Backtest-first strategy lab</small>
			</span>
		</a>
		<div class="topbar-status">
			<span class="status-dot"></span>
			Public market data
			<span class="divider"></span>
			BTCUSDT · 1m / 5m
		</div>
	</header>

	<main>
		<section class="hero">
			<div>
				<div class="eyebrow"><FlaskConical size={14} /> Historical validation workspace</div>
				<h1>Test the rules.<br /><span>Measure the edge.</span></h1>
				<p>
					Closed candles are replayed chronologically through the shared deterministic engine.
					Results are research evidence—not a trading instruction.
				</p>
			</div>
			<div class="principle-card">
				<div class="principle-icon"><ShieldCheck size={20} /></div>
				<div>
					<strong>No-lookahead protocol</strong>
					<p>Confirmed events only · conservative OHLC ambiguity · cumulative closed-trade R</p>
				</div>
			</div>
		</section>

		<section class="workspace-grid">
			<aside class="config-panel">
				<div class="panel-heading">
					<div>
						<span>Experiment setup</span>
						<h2>Baseline configuration</h2>
					</div>
					<span class="version-chip">SMC V1</span>
				</div>

				<form method="POST" use:enhance={submitBacktest} aria-busy={running}>
					<fieldset>
						<legend>Dataset</legend>
						<label class="full-field">
							<span>Market</span>
							<input value="BTCUSDT" disabled />
						</label>
						<div class="field-row">
							<label>
								<span>Start · UTC</span>
								<input name="startDate" type="date" value={values.startDate} required />
							</label>
							<label>
								<span>End · UTC</span>
								<input name="endDate" type="date" value={values.endDate} required />
							</label>
						</div>
						<p class="field-note">Up to 31 completed UTC days per run.</p>
					</fieldset>

					<fieldset>
						<legend>Structure & liquidity</legend>
						<div class="field-row three">
							<label>
								<span>Left bars</span>
								<input
									name="swingLeftBars"
									type="number"
									min="1"
									max="10"
									value={values.swingLeftBars}
								/>
							</label>
							<label>
								<span>Right bars</span>
								<input
									name="swingRightBars"
									type="number"
									min="1"
									max="10"
									value={values.swingRightBars}
								/>
							</label>
							<label>
								<span>Equal tol. %</span>
								<input
									name="liquidityTolerancePercent"
									type="number"
									min="0"
									max="5"
									step="0.01"
									value={values.liquidityTolerancePercent}
								/>
							</label>
						</div>
					</fieldset>

					<fieldset>
						<legend>Signal & risk</legend>
						<div class="field-row">
							<label>
								<span>ATR period</span>
								<input name="atrPeriod" type="number" min="1" max="200" value={values.atrPeriod} />
							</label>
							<label>
								<span>Displacement × ATR</span>
								<input
									name="displacementATRMultiplier"
									type="number"
									min="0.01"
									max="10"
									step="0.1"
									value={values.displacementATRMultiplier}
								/>
							</label>
							<label>
								<span>Minimum score</span>
								<input
									name="minimumScore"
									type="number"
									min="0"
									max="100"
									value={values.minimumScore}
								/>
							</label>
							<label>
								<span>Minimum RR</span>
								<input
									name="minimumRiskReward"
									type="number"
									min="0.01"
									max="20"
									step="0.1"
									value={values.minimumRiskReward}
								/>
							</label>
							<label>
								<span>SL ATR buffer</span>
								<input
									name="stopLossATRBuffer"
									type="number"
									min="0"
									max="5"
									step="0.01"
									value={values.stopLossATRBuffer}
								/>
							</label>
							<label>
								<span>Max pending bars</span>
								<input
									name="maxPendingEntryBars"
									type="number"
									min="1"
									max="10000"
									value={values.maxPendingEntryBars}
								/>
							</label>
						</div>
					</fieldset>

					<fieldset>
						<legend>Execution assumptions</legend>
						<div class="field-row">
							<label>
								<span>Fee · bps / side</span>
								<input
									name="feeBps"
									type="number"
									min="0"
									max="9999"
									step="0.1"
									value={values.feeBps}
								/>
							</label>
							<label>
								<span>Slippage · bps / side</span>
								<input
									name="slippageBps"
									type="number"
									min="0"
									max="9999"
									step="0.1"
									value={values.slippageBps}
								/>
							</label>
						</div>
					</fieldset>

					{#if error}
						<div class="error-banner" role="alert"><AlertTriangle size={16} /> {error}</div>
					{/if}

					<button class="run-button" type="submit" disabled={running}>
						{#if running}
							<span class="spinner"></span> Replaying candles…
						{:else}
							<Play size={17} fill="currentColor" /> Run historical backtest
						{/if}
					</button>
				</form>
			</aside>

			<section class="results-panel">
				{#if report}
					<div class="run-meta">
						<div>
							<span class="run-label">Latest completed run</span>
							<strong>{values.startDate} → {values.endDate}</strong>
						</div>
						<div class="data-pills">
							<span
								><Database size={13} />
								{report.data.processedCandles.toLocaleString()} candles</span
							>
							<span><Clock3 size={13} /> UTC</span>
						</div>
					</div>

					<div class="metric-grid">
						<article class="metric-card primary-metric">
							<span>Expectancy</span>
							<strong
								class:positive={report.analytics.metrics.expectancyR > 0}
								class:negative={report.analytics.metrics.expectancyR < 0}
							>
								{formatR(report.analytics.metrics.expectancyR)}
							</strong>
							<small>average / closed trade</small>
						</article>
						<article class="metric-card">
							<span>Total R</span>
							<strong>{formatR(report.analytics.metrics.totalR)}</strong>
							<small>{report.analytics.metrics.totalTrades} trades</small>
						</article>
						<article class="metric-card">
							<span>Profit factor</span>
							<strong
								>{report.analytics.metrics.profitFactor === null
									? '—'
									: formatNumber(report.analytics.metrics.profitFactor)}</strong
							>
							<small>gross wins / losses</small>
						</article>
						<article class="metric-card">
							<span>Max drawdown</span>
							<strong class="negative"
								>−{formatNumber(report.analytics.metrics.maxDrawdownR)}R</strong
							>
							<small>closed-trade peak to trough</small>
						</article>
						<article class="metric-card">
							<span>Win rate</span>
							<strong>{formatPercent(report.analytics.metrics.winRate)}</strong>
							<small>{report.analytics.metrics.wins}W · {report.analytics.metrics.losses}L</small>
						</article>
						<article class="metric-card">
							<span>Longest loss streak</span>
							<strong>{report.analytics.metrics.maxConsecutiveLosses}</strong>
							<small
								>avg hold {formatDuration(report.analytics.metrics.averageTradeDurationMs)}</small
							>
						</article>
					</div>

					<div class="chart-card">
						<div class="card-heading">
							<div>
								<span>Equity curve</span>
								<h3>Cumulative closed-trade R</h3>
							</div>
							<div class="chart-total">
								<BarChart3 size={15} />
								{formatR(report.analytics.metrics.totalR)}
							</div>
						</div>
						{#if chartPath}
							<div class="chart-wrap">
								<svg
									viewBox="0 0 1000 220"
									role="img"
									aria-label="Cumulative R equity curve"
									preserveAspectRatio="none"
								>
									<defs>
										<linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
											<stop offset="0" stop-color="#51e0b7" stop-opacity="0.28" />
											<stop offset="1" stop-color="#51e0b7" stop-opacity="0" />
										</linearGradient>
									</defs>
									<line x1="0" x2="1000" y1={zeroLineY} y2={zeroLineY} class="zero-line" />
									<path d={`${chartPath} L 1000 220 L 0 220 Z`} class="equity-area" />
									<path d={chartPath} class="equity-line" />
								</svg>
							</div>
						{:else}
							<div class="empty-chart">No closed trades in this run.</div>
						{/if}
					</div>

					<div class="validation-card" data-verdict={report.validation.verdict}>
						<div class="validation-summary">
							<div class="validation-icon">
								{#if report.validation.verdict === 'CANDIDATE'}
									<CheckCircle2 size={22} />
								{:else}
									<FlaskConical size={22} />
								{/if}
							</div>
							<div>
								<span>Validation readout</span>
								<h3>{report.validation.title}</h3>
								<p>{report.validation.summary}</p>
							</div>
						</div>
						<div class="check-grid">
							{#each report.validation.checks as check (check.key)}
								<div class="check-item" data-status={check.status}>
									<span class="check-status">{check.status.replace('_', ' ')}</span>
									<strong>{check.label}</strong>
									<p>{check.detail}</p>
								</div>
							{/each}
						</div>
					</div>

					<div class="breakdown-grid">
						<article class="table-card">
							<div class="card-heading compact">
								<div>
									<span>Breakdown</span>
									<h3>Direction</h3>
								</div>
							</div>
							<div class="breakdown-list">
								{#each report.analytics.breakdowns.direction as bucket (bucket.key)}
									<div>
										<span class:long={bucket.key === 'LONG'} class:short={bucket.key === 'SHORT'}
											>{bucket.label}</span
										>
										<strong>{bucket.metrics.totalTrades}</strong>
										<small
											>{formatR(bucket.metrics.expectancyR)} exp. · {formatPercent(
												bucket.metrics.winRate
											)}</small
										>
									</div>
								{/each}
							</div>
						</article>

						<article class="table-card">
							<div class="card-heading compact">
								<div>
									<span>Breakdown</span>
									<h3>Score bands</h3>
								</div>
							</div>
							<div class="breakdown-list score-list">
								{#each report.analytics.breakdowns.score as bucket (bucket.key)}
									<div>
										<span>{bucket.label}</span>
										<strong>{bucket.metrics.totalTrades}</strong>
										<small>{formatR(bucket.metrics.totalR)} total</small>
									</div>
								{/each}
							</div>
						</article>

						<article class="table-card sessions-card">
							<div class="card-heading compact">
								<div>
									<span>Breakdown</span>
									<h3>UTC sessions</h3>
								</div>
							</div>
							<div class="session-table">
								{#each report.analytics.breakdowns.sessionUtc as bucket (bucket.key)}
									<div>
										<span>{bucket.label}</span>
										<strong>{bucket.metrics.totalTrades} trades</strong>
										<small>{formatR(bucket.metrics.expectancyR)}</small>
									</div>
								{/each}
							</div>
						</article>
					</div>

					<article class="table-card time-card">
						<div class="card-heading compact">
							<div>
								<span>Robustness</span>
								<h3>Performance by UTC day</h3>
							</div>
						</div>
						<div class="responsive-table">
							<table>
								<thead
									><tr
										><th>Day</th><th>Trades</th><th>Win rate</th><th>Expectancy</th><th>Total R</th
										><th>Max DD</th></tr
									></thead
								>
								<tbody>
									{#each report.analytics.breakdowns.dayUtc as bucket (bucket.key)}
										<tr>
											<td>{bucket.label}</td><td>{bucket.metrics.totalTrades}</td><td
												>{formatPercent(bucket.metrics.winRate)}</td
											>
											<td>{formatR(bucket.metrics.expectancyR)}</td><td
												>{formatR(bucket.metrics.totalR)}</td
											><td>{formatNumber(bucket.metrics.maxDrawdownR)}R</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</article>

					<article class="table-card time-card">
						<div class="card-heading compact">
							<div>
								<span>Timing</span>
								<h3>Performance by entry hour</h3>
							</div>
						</div>
						<div class="responsive-table">
							<table>
								<thead
									><tr
										><th>Hour</th><th>Trades</th><th>Win rate</th><th>Expectancy</th><th>Total R</th
										><th>Max DD</th></tr
									></thead
								>
								<tbody>
									{#each report.analytics.breakdowns.hourUtc as bucket (bucket.key)}
										<tr>
											<td>{bucket.label}</td><td>{bucket.metrics.totalTrades}</td><td
												>{formatPercent(bucket.metrics.winRate)}</td
											>
											<td>{formatR(bucket.metrics.expectancyR)}</td><td
												>{formatR(bucket.metrics.totalR)}</td
											><td>{formatNumber(bucket.metrics.maxDrawdownR)}R</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</article>

					<article class="table-card trades-card">
						<div class="card-heading compact">
							<div>
								<span>Audit trail</span>
								<h3>Closed trades</h3>
							</div>
							<span class="version-chip">{report.trades.length} records</span>
						</div>
						{#if report.trades.length > 0}
							<div class="trade-list">
								{#each report.trades as trade, index (trade.id)}
									<details>
										<summary>
											<span class="trade-index">#{String(index + 1).padStart(3, '0')}</span>
											<span
												class:long={trade.direction === 'LONG'}
												class:short={trade.direction === 'SHORT'}
											>
												{#if trade.direction === 'LONG'}<ArrowUpRight
														size={13}
													/>{:else}<ArrowDownRight size={13} />{/if}
												{trade.direction}
											</span>
											<span>{formatTimestamp(trade.entryTimestamp)} UTC</span>
											<strong
												class:positive={trade.rMultiple > 0}
												class:negative={trade.rMultiple <= 0}>{formatR(trade.rMultiple)}</strong
											>
										</summary>
										<div class="trade-detail">
											<div><span>Entry</span><strong>{formatNumber(trade.entry)}</strong></div>
											<div><span>Stop</span><strong>{formatNumber(trade.stopLoss)}</strong></div>
											<div>
												<span>Target</span><strong>{formatNumber(trade.takeProfit)}</strong>
											</div>
											<div><span>Exit</span><strong>{formatNumber(trade.exitPrice)}</strong></div>
											<div><span>Score</span><strong>{trade.setupScore}/100</strong></div>
											<div>
												<span>Outcome</span><strong>{trade.exitReason.replace('_', ' ')}</strong>
											</div>
											<div><span>Fees</span><strong>{formatNumber(trade.feesPaid, 4)}</strong></div>
											<div>
												<span>Slippage</span><strong>{formatNumber(trade.slippagePaid, 4)}</strong>
											</div>
											{#if trade.intrabarAmbiguous}<p class="ambiguity-note">
													<AlertTriangle size={13} /> Conservative intrabar ambiguity applied.
												</p>{/if}
											<div class="reason-list">
												{#each trade.setupReasons as reason (reason.key)}
													<span class:valid={reason.valid}>{reason.label} · {reason.score}</span>
												{/each}
											</div>
										</div>
									</details>
								{/each}
							</div>
						{:else}
							<div class="empty-trades">
								<Target size={20} /><strong>No closed trades</strong>
								<p>Try a longer period, but do not tune multiple parameters at once.</p>
							</div>
						{/if}
					</article>

					<footer class="assumptions-bar">
						<span>Fee {formatNumber(report.executionConfig.feeBps)} bps / side</span>
						<span>Slippage {formatNumber(report.executionConfig.slippageBps)} bps / side</span>
						<span>Entry at zone midpoint</span>
						<span
							>Pending {report.data.pendingTrades} · Open {report.data.openTrades} at range end</span
						>
					</footer>
				{:else}
					<div class="empty-state">
						<div class="empty-visual">
							<div class="axis-line x"></div>
							<div class="axis-line y"></div>
							<svg viewBox="0 0 320 140" aria-hidden="true"
								><path
									d="M8 119 C 48 118, 55 93, 86 99 S 125 73, 153 82 S 196 55, 221 61 S 267 28, 312 21"
								/></svg
							>
							<span class="point p1"></span><span class="point p2"></span><span class="point p3"
							></span>
						</div>
						<div class="empty-copy">
							<span>Research console ready</span>
							<h2>Configure a baseline run</h2>
							<p>
								Start with defaults. Change one parameter per experiment and compare expectancy with
								drawdown—not win rate alone.
							</p>
						</div>
						<div class="empty-steps">
							<div><strong>01</strong><span>Fetch public<br />closed candles</span></div>
							<div><strong>02</strong><span>Replay shared<br />SMC pipeline</span></div>
							<div><strong>03</strong><span>Audit metrics<br />and trades</span></div>
						</div>
					</div>
				{/if}
			</section>
		</section>
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #07100f;
		color: #e8f4ef;
		min-width: 320px;
	}
	:global(*) {
		box-sizing: border-box;
	}
	.research-shell {
		min-height: 100vh;
		background:
			radial-gradient(circle at 72% 6%, rgba(31, 116, 96, 0.16), transparent 27rem), #07100f;
	}
	.topbar {
		height: 72px;
		padding: 0 clamp(20px, 4vw, 64px);
		border-bottom: 1px solid rgba(157, 205, 190, 0.12);
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: rgba(7, 16, 15, 0.85);
		backdrop-filter: blur(16px);
	}
	.brand {
		color: inherit;
		text-decoration: none;
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.brand-mark {
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border-radius: 10px;
		color: #5fe2ba;
		background: linear-gradient(145deg, rgba(80, 223, 181, 0.2), rgba(80, 223, 181, 0.05));
		border: 1px solid rgba(95, 226, 186, 0.25);
	}
	.brand strong,
	.brand small {
		display: block;
	}
	.brand strong {
		font-size: 14px;
		letter-spacing: 0.02em;
	}
	.brand small {
		color: #758d85;
		font-size: 10px;
		margin-top: 2px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.topbar-status {
		color: #91a59f;
		font-size: 11px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		display: flex;
		gap: 9px;
		align-items: center;
	}
	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #5fe2ba;
		box-shadow: 0 0 12px #5fe2ba;
	}
	.divider {
		height: 12px;
		width: 1px;
		background: #2a3935;
	}
	main {
		width: min(1540px, calc(100% - clamp(28px, 6vw, 96px)));
		margin: 0 auto;
		padding: 54px 0 80px;
	}
	.hero {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 40px;
		margin-bottom: 36px;
	}
	.eyebrow {
		display: flex;
		gap: 7px;
		align-items: center;
		color: #5fe2ba;
		font-size: 11px;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.13em;
	}
	.hero h1 {
		margin: 13px 0 13px;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(39px, 5vw, 68px);
		font-weight: 400;
		line-height: 0.98;
		letter-spacing: -0.045em;
	}
	.hero h1 span {
		color: #5fe2ba;
	}
	.hero > div:first-child > p {
		max-width: 620px;
		color: #91a59f;
		font-size: 14px;
		line-height: 1.65;
		margin: 0;
	}
	.principle-card {
		display: flex;
		gap: 13px;
		width: min(390px, 100%);
		padding: 17px 18px;
		border: 1px solid rgba(95, 226, 186, 0.16);
		background: rgba(12, 29, 26, 0.72);
		border-radius: 14px;
	}
	.principle-icon {
		flex: 0 0 38px;
		height: 38px;
		border-radius: 9px;
		background: rgba(95, 226, 186, 0.1);
		color: #5fe2ba;
		display: grid;
		place-items: center;
	}
	.principle-card strong {
		font-size: 12px;
	}
	.principle-card p {
		color: #789089;
		margin: 5px 0 0;
		font-size: 10px;
		line-height: 1.5;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.workspace-grid {
		display: grid;
		grid-template-columns: 370px minmax(0, 1fr);
		gap: 22px;
		align-items: start;
	}
	.config-panel,
	.chart-card,
	.validation-card,
	.table-card,
	.metric-card,
	.empty-state {
		border: 1px solid rgba(159, 202, 190, 0.12);
		background: linear-gradient(145deg, rgba(14, 29, 27, 0.96), rgba(8, 20, 18, 0.96));
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.18);
	}
	.config-panel {
		border-radius: 16px;
		padding: 22px;
		position: sticky;
		top: 20px;
	}
	.panel-heading,
	.card-heading,
	.run-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 15px;
	}
	.panel-heading {
		padding-bottom: 18px;
		border-bottom: 1px solid rgba(159, 202, 190, 0.1);
	}
	.panel-heading span,
	.card-heading span,
	.validation-summary span,
	.run-label,
	.empty-copy > span {
		color: #69817a;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.panel-heading h2,
	.card-heading h3 {
		margin: 4px 0 0;
		font-size: 14px;
		font-weight: 600;
	}
	.version-chip {
		color: #6fe4c0 !important;
		border: 1px solid rgba(95, 226, 186, 0.22);
		background: rgba(95, 226, 186, 0.08);
		padding: 5px 8px;
		border-radius: 999px;
		font-size: 8px !important;
	}
	form {
		margin-top: 18px;
	}
	fieldset {
		border: 0;
		border-bottom: 1px solid rgba(159, 202, 190, 0.09);
		margin: 0 0 17px;
		padding: 0 0 17px;
	}
	legend {
		color: #b7c9c3;
		font-size: 10px;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 11px;
	}
	label span {
		display: block;
		color: #6f857e;
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0 0 6px 2px;
	}
	.field-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.field-row.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.field-row label:nth-child(n + 3) {
		margin-top: 2px;
	}
	input {
		width: 100%;
		min-width: 0;
		border: 1px solid #243a34;
		background: #0a1715;
		color: #d9e9e4;
		border-radius: 8px;
		padding: 10px 10px;
		font: inherit;
		font-size: 11px;
		outline: none;
		color-scheme: dark;
		transition: 0.2s;
	}
	input:focus {
		border-color: #4abf9d;
		box-shadow: 0 0 0 3px rgba(74, 191, 157, 0.09);
	}
	input:disabled {
		color: #81978f;
	}
	.full-field {
		display: block;
		margin-bottom: 10px;
	}
	.field-note {
		color: #536a63;
		font-size: 9px;
		margin: 8px 0 0;
	}
	.run-button {
		width: 100%;
		border: 0;
		border-radius: 9px;
		padding: 13px 14px;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 9px;
		background: #5fe2ba;
		color: #07100f;
		font: inherit;
		font-size: 11px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		cursor: pointer;
		box-shadow: 0 9px 28px rgba(95, 226, 186, 0.16);
	}
	.run-button:disabled {
		opacity: 0.65;
		cursor: wait;
	}
	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(7, 16, 15, 0.25);
		border-top-color: #07100f;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.error-banner {
		margin: 0 0 12px;
		padding: 10px;
		display: flex;
		gap: 8px;
		align-items: flex-start;
		color: #ffb7a8;
		background: rgba(255, 110, 84, 0.09);
		border: 1px solid rgba(255, 110, 84, 0.18);
		border-radius: 8px;
		font-size: 10px;
		line-height: 1.4;
	}
	.results-panel {
		min-width: 0;
	}
	.run-meta {
		margin: 1px 2px 14px;
	}
	.run-meta strong {
		display: block;
		font-size: 12px;
		margin-top: 4px;
	}
	.data-pills {
		display: flex;
		gap: 7px;
	}
	.data-pills span {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 6px 9px;
		border-radius: 999px;
		color: #7e958e;
		background: #0d1c19;
		border: 1px solid #1e332d;
		font-size: 9px;
	}
	.metric-grid {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 9px;
		margin-bottom: 12px;
	}
	.metric-card {
		padding: 15px 14px;
		border-radius: 11px;
		min-width: 0;
	}
	.metric-card > span {
		color: #70867f;
		font-size: 8px;
		text-transform: uppercase;
		letter-spacing: 0.09em;
	}
	.metric-card strong {
		display: block;
		font-family: Georgia, serif;
		font-size: clamp(18px, 2vw, 25px);
		font-weight: 400;
		margin: 9px 0 5px;
		white-space: nowrap;
	}
	.metric-card small {
		color: #576d66;
		font-size: 8px;
		white-space: nowrap;
	}
	.primary-metric {
		background: linear-gradient(145deg, rgba(36, 94, 78, 0.62), rgba(11, 29, 25, 0.96));
		border-color: rgba(95, 226, 186, 0.23);
	}
	.positive {
		color: #5fe2ba !important;
	}
	.negative {
		color: #ff806b !important;
	}
	.long {
		color: #5fe2ba !important;
	}
	.short {
		color: #ff9b77 !important;
	}
	.chart-card,
	.validation-card,
	.table-card {
		border-radius: 14px;
		padding: 20px;
		margin-bottom: 12px;
	}
	.card-heading {
		margin-bottom: 13px;
	}
	.card-heading.compact {
		margin-bottom: 16px;
	}
	.chart-total {
		display: flex;
		gap: 6px;
		align-items: center;
		color: #5fe2ba;
		font-family: Georgia, serif;
		font-size: 17px;
	}
	.chart-wrap {
		height: 220px;
		border-radius: 9px;
		overflow: hidden;
		background:
			linear-gradient(180deg, rgba(20, 49, 42, 0.35), rgba(4, 12, 10, 0.2)),
			repeating-linear-gradient(
				0deg,
				transparent,
				transparent 54px,
				rgba(133, 177, 164, 0.055) 55px
			);
	}
	.chart-wrap svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.equity-line {
		fill: none;
		stroke: #5fe2ba;
		stroke-width: 3;
		vector-effect: non-scaling-stroke;
	}
	.equity-area {
		fill: url(#equity-fill);
	}
	.zero-line {
		stroke: rgba(190, 215, 208, 0.16);
		stroke-width: 1;
		stroke-dasharray: 5 6;
		vector-effect: non-scaling-stroke;
	}
	.empty-chart {
		height: 170px;
		display: grid;
		place-items: center;
		color: #5e746d;
		font-size: 11px;
		border: 1px dashed #273b35;
		border-radius: 9px;
	}
	.validation-card {
		padding: 0;
		overflow: hidden;
	}
	.validation-summary {
		padding: 20px;
		display: flex;
		gap: 14px;
		border-bottom: 1px solid rgba(159, 202, 190, 0.1);
	}
	.validation-icon {
		flex: 0 0 42px;
		height: 42px;
		display: grid;
		place-items: center;
		border-radius: 10px;
		background: rgba(95, 226, 186, 0.09);
		color: #5fe2ba;
	}
	.validation-summary h3 {
		margin: 4px 0 7px;
		font-family: Georgia, serif;
		font-size: 22px;
		font-weight: 400;
	}
	.validation-summary p {
		margin: 0;
		color: #849991;
		font-size: 10px;
		line-height: 1.55;
		max-width: 770px;
	}
	.check-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
	}
	.check-item {
		padding: 15px 17px;
		border-right: 1px solid rgba(159, 202, 190, 0.08);
		border-bottom: 1px solid rgba(159, 202, 190, 0.08);
		min-height: 106px;
	}
	.check-item:nth-child(3n) {
		border-right: 0;
	}
	.check-status {
		display: inline-block;
		font-size: 7px;
		font-weight: 800;
		letter-spacing: 0.09em;
		padding: 3px 6px;
		border-radius: 4px;
		color: #95aaa3;
		background: #1d2d29;
	}
	.check-item[data-status='PASS'] .check-status {
		color: #5fe2ba;
		background: rgba(95, 226, 186, 0.1);
	}
	.check-item[data-status='FAIL'] .check-status {
		color: #ff806b;
		background: rgba(255, 128, 107, 0.1);
	}
	.check-item strong {
		display: block;
		font-size: 10px;
		margin: 9px 0 5px;
	}
	.check-item p {
		margin: 0;
		color: #60766f;
		font-size: 8px;
		line-height: 1.45;
	}
	.breakdown-grid {
		display: grid;
		grid-template-columns: 0.75fr 1.1fr 1.35fr;
		gap: 12px;
	}
	.breakdown-list {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
	}
	.score-list {
		grid-template-columns: repeat(2, 1fr);
	}
	.breakdown-list > div,
	.session-table > div {
		padding: 10px;
		border-radius: 8px;
		background: rgba(4, 14, 12, 0.45);
		border: 1px solid rgba(142, 183, 171, 0.09);
	}
	.breakdown-list span {
		color: #81968f;
		font-size: 8px;
	}
	.breakdown-list strong {
		display: block;
		font-family: Georgia, serif;
		font-size: 19px;
		font-weight: 400;
		margin: 7px 0 4px;
	}
	.breakdown-list small,
	.session-table small {
		color: #587069;
		font-size: 7px;
	}
	.session-table {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 7px;
	}
	.session-table span {
		color: #81968f;
		font-size: 7px;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.session-table strong {
		display: inline-block;
		font-size: 9px;
		margin: 7px 8px 0 0;
	}
	.responsive-table {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 9px;
	}
	th {
		color: #60776f;
		text-align: left;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 8px 10px;
		border-bottom: 1px solid #21342f;
	}
	td {
		padding: 10px;
		color: #a5b8b2;
		border-bottom: 1px solid rgba(137, 179, 166, 0.07);
	}
	tbody tr:last-child td {
		border-bottom: 0;
	}
	.trade-list {
		border-top: 1px solid #1d302a;
	}
	details {
		border-bottom: 1px solid rgba(137, 179, 166, 0.08);
	}
	summary {
		list-style: none;
		cursor: pointer;
		display: grid;
		grid-template-columns: 60px 90px 1fr 75px;
		gap: 10px;
		align-items: center;
		padding: 12px 4px;
		color: #91a49e;
		font-size: 9px;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary > span:nth-child(2) {
		display: flex;
		align-items: center;
		gap: 4px;
		font-weight: 700;
	}
	summary strong {
		text-align: right;
		font-family: Georgia, serif;
		font-size: 15px;
		font-weight: 400;
	}
	.trade-index {
		color: #526861;
		font-family: monospace;
	}
	.trade-detail {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		background: rgba(4, 13, 11, 0.46);
		padding: 13px;
		margin-bottom: 8px;
		border-radius: 8px;
	}
	.trade-detail > div:not(.reason-list) {
		padding: 7px;
	}
	.trade-detail span {
		color: #5f756e;
		font-size: 7px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.trade-detail strong {
		display: block;
		margin-top: 5px;
		font-size: 10px;
	}
	.reason-list {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		padding-top: 8px;
		border-top: 1px solid #1c2e29;
	}
	.reason-list span {
		padding: 4px 6px;
		border: 1px solid #2a3b36;
		border-radius: 5px;
	}
	.reason-list span.valid {
		color: #5fe2ba;
		border-color: rgba(95, 226, 186, 0.2);
	}
	.ambiguity-note {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: 5px;
		margin: 0;
		color: #e9b66b;
		font-size: 8px;
	}
	.empty-trades {
		padding: 32px;
		display: grid;
		place-items: center;
		color: #587069;
		text-align: center;
	}
	.empty-trades strong {
		color: #aabdb7;
		margin-top: 8px;
		font-size: 11px;
	}
	.empty-trades p {
		font-size: 9px;
		margin: 5px 0;
	}
	.assumptions-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
		padding: 3px;
	}
	.assumptions-bar span {
		color: #61766f;
		font-size: 8px;
		padding: 6px 8px;
		border: 1px solid #1c302a;
		border-radius: 999px;
	}
	.empty-state {
		min-height: 690px;
		border-radius: 16px;
		display: grid;
		place-items: center;
		align-content: center;
		padding: 50px;
		text-align: center;
		overflow: hidden;
		position: relative;
	}
	.empty-visual {
		width: min(470px, 100%);
		height: 205px;
		position: relative;
		border-left: 1px solid #243a34;
		border-bottom: 1px solid #243a34;
		margin-bottom: 38px;
	}
	.empty-visual::before {
		content: '';
		position: absolute;
		inset: 0;
		background:
			repeating-linear-gradient(0deg, transparent 0 49px, rgba(111, 151, 139, 0.06) 50px),
			repeating-linear-gradient(90deg, transparent 0 77px, rgba(111, 151, 139, 0.05) 78px);
	}
	.empty-visual svg {
		position: absolute;
		inset: 25px 10px 15px 20px;
		width: calc(100% - 30px);
		height: calc(100% - 40px);
		overflow: visible;
	}
	.empty-visual path {
		fill: none;
		stroke: #5fe2ba;
		stroke-width: 2;
		filter: drop-shadow(0 0 10px rgba(95, 226, 186, 0.35));
	}
	.point {
		position: absolute;
		width: 8px;
		height: 8px;
		border: 2px solid #5fe2ba;
		background: #0b1a17;
		border-radius: 50%;
		box-shadow: 0 0 12px rgba(95, 226, 186, 0.5);
	}
	.p1 {
		left: 25%;
		top: 113px;
	}
	.p2 {
		left: 58%;
		top: 79px;
	}
	.p3 {
		left: 88%;
		top: 42px;
	}
	.empty-copy {
		max-width: 500px;
	}
	.empty-copy h2 {
		font-family: Georgia, serif;
		font-size: 28px;
		font-weight: 400;
		margin: 8px 0 10px;
	}
	.empty-copy p {
		color: #71877f;
		font-size: 11px;
		line-height: 1.65;
		margin: 0;
	}
	.empty-steps {
		display: flex;
		gap: 45px;
		margin-top: 40px;
	}
	.empty-steps div {
		display: flex;
		gap: 10px;
		text-align: left;
		align-items: center;
	}
	.empty-steps strong {
		color: #5fe2ba;
		font-family: Georgia, serif;
		font-size: 20px;
		font-weight: 400;
	}
	.empty-steps span {
		color: #657a73;
		font-size: 8px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		line-height: 1.5;
	}
	@media (max-width: 1250px) {
		.metric-grid {
			grid-template-columns: repeat(3, 1fr);
		}
		.breakdown-grid {
			grid-template-columns: 1fr 1fr;
		}
		.sessions-card {
			grid-column: 1 / -1;
		}
		.session-table {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	@media (max-width: 900px) {
		.topbar-status {
			display: none;
		}
		main {
			width: min(100% - 28px, 720px);
			padding-top: 34px;
		}
		.hero {
			align-items: flex-start;
			flex-direction: column;
		}
		.principle-card {
			width: 100%;
		}
		.workspace-grid {
			grid-template-columns: 1fr;
		}
		.config-panel {
			position: static;
		}
		.check-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.check-item:nth-child(3n) {
			border-right: 1px solid rgba(159, 202, 190, 0.08);
		}
		.check-item:nth-child(2n) {
			border-right: 0;
		}
	}
	@media (max-width: 600px) {
		.topbar {
			padding: 0 16px;
		}
		.hero h1 {
			font-size: 42px;
		}
		.metric-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.breakdown-grid {
			grid-template-columns: 1fr;
		}
		.sessions-card {
			grid-column: auto;
		}
		.session-table {
			grid-template-columns: repeat(2, 1fr);
		}
		.check-grid {
			grid-template-columns: 1fr;
		}
		.check-item,
		.check-item:nth-child(3n) {
			border-right: 0;
		}
		.field-row.three {
			grid-template-columns: 1fr 1fr;
		}
		.trade-detail {
			grid-template-columns: repeat(2, 1fr);
		}
		summary {
			grid-template-columns: 50px 75px 1fr 58px;
			font-size: 8px;
		}
		.empty-state {
			padding: 28px 18px;
			min-height: 560px;
		}
		.empty-steps {
			gap: 18px;
			flex-direction: column;
		}
	}
</style>
