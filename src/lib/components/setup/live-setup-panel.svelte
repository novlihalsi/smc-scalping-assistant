<script lang="ts">
	import {
		AlertTriangle,
		Check,
		Circle,
		Clock3,
		Gauge,
		Info,
		ListChecks,
		Minus,
		ShieldAlert,
		Target,
		TrendingDown,
		TrendingUp,
		X
	} from '@lucide/svelte';

	import type { LiveSetupPanelViewModel, SetupPanelTone } from './setup-panel-view-model.js';

	let { model }: { model: LiveSetupPanelViewModel } = $props();

	function formatPrice(value: number): string {
		return new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(value);
	}

	function formatTimestamp(timestamp: number | null): string {
		if (timestamp === null) return 'Awaiting first closed candle';
		return new Intl.DateTimeFormat('en-GB', {
			timeZone: 'UTC',
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		}).format(timestamp);
	}

	function toneClass(tone: SetupPanelTone): string {
		return `tone-${tone}`;
	}
</script>

<aside class="setup-panel" aria-label="Current live setup">
	<header class="panel-header">
		<div>
			<span class="section-kicker">Live analysis</span>
			<h2>Current setup</h2>
		</div>
		<span class="symbol-chip">{model.symbol}</span>
	</header>

	<section class="market-state" aria-label="Market state">
		<div class="bias-card">
			<span>5m bias</span>
			<strong class={toneClass(model.biasTone)}>
				{#if model.bias === 'BULLISH'}
					<TrendingUp size={16} />
				{:else if model.bias === 'BEARISH'}
					<TrendingDown size={16} />
				{:else}
					<Minus size={16} />
				{/if}
				{model.biasLabel}
			</strong>
		</div>
		{#each model.structures as structure (structure.timeframe)}
			<div class="structure-card">
				<span>{structure.timeframe} structure</span>
				<strong>{structure.value}</strong>
				<small>{structure.detail}</small>
			</div>
		{/each}
	</section>

	<section class="strategy-state">
		<div class="section-heading">
			<div><Clock3 size={14} /><span>Strategy state</span></div>
			<strong>{model.stageLabel}</strong>
		</div>
		<p>{model.stageDescription}</p>
		<div class="condition-list">
			{#each model.conditions as condition (condition.key)}
				<div
					class:current={condition.state === 'current'}
					class:blocked={condition.state === 'blocked'}
					class="condition"
				>
					<span class="condition-icon">
						{#if condition.state === 'complete'}
							<Check size={11} strokeWidth={3} />
						{:else if condition.state === 'blocked'}
							<X size={11} strokeWidth={3} />
						{:else}
							<Circle size={8} fill={condition.state === 'current' ? 'currentColor' : 'none'} />
						{/if}
					</span>
					<div>
						<strong>{condition.label}</strong>
						<small>{condition.description}</small>
					</div>
				</div>
			{/each}
		</div>
	</section>

	{#if model.setup}
		{@const setup = model.setup}
		<section class="setup-summary">
			<div class="section-heading">
				<div>
					<Gauge size={14} /><span
						>{setup.displayMode === 'CURRENT' ? 'Active setup' : 'Latest setup'}</span
					>
				</div>
				<span class={`status-badge ${toneClass(setup.tone)}`}>{setup.statusLabel}</span>
			</div>
			<div class="score-row">
				<div class="score-ring" style={`--score: ${setup.score * 3.6}deg`}>
					<strong>{setup.score}</strong><span>/100</span>
				</div>
				<div class="score-copy">
					<div>
						<span class={`direction ${setup.direction.toLowerCase()}`}>{setup.direction}</span>
						<strong>{setup.classification}</strong>
					</div>
					<p>{setup.statusDescription}</p>
					<span class="eligibility"><Check size={11} /> Mandatory eligibility passed</span>
				</div>
			</div>

			<div class="risk-grid" aria-label="Setup risk levels">
				<div>
					<span>Entry zone</span><strong
						>{formatPrice(setup.entryZone.min)}–{formatPrice(setup.entryZone.max)}</strong
					>
				</div>
				<div><span>Entry</span><strong>{formatPrice(setup.entryPrice)}</strong></div>
				<div class="stop"><span>Stop loss</span><strong>{formatPrice(setup.stopLoss)}</strong></div>
				<div class="target">
					<span>Take profit</span><strong>{formatPrice(setup.takeProfit)}</strong>
				</div>
				<div class="invalidation-level" title={setup.invalidationRule}>
					<span>Invalidation</span><strong>{formatPrice(setup.invalidationLevel)}</strong>
					<small>{setup.invalidationRule}</small>
				</div>
				<div class="rr">
					<span>Risk / reward</span><strong>{setup.riskReward.toFixed(2)}R</strong>
				</div>
			</div>

			<div class="reason-header"><ListChecks size={13} /><span>Why this score</span></div>
			<div class="reason-list">
				{#each setup.reasons as reason (reason.key)}
					<div class:confirmed={reason.valid} class="reason" title={reason.description}>
						<span
							>{#if reason.valid}<Check size={10} />{:else}<X size={10} />{/if}</span
						>
						<div><strong>{reason.label}</strong><small>{reason.description}</small></div>
						<b>+{reason.score}</b>
					</div>
				{/each}
			</div>

			{#if setup.invalidation}
				<div class="invalidation" role="status">
					<ShieldAlert size={15} />
					<div><strong>Invalidation</strong><span>{setup.invalidation.label}</span></div>
				</div>
			{/if}
		</section>
	{:else}
		<section class="no-setup">
			<div class="empty-icon"><Target size={18} /></div>
			<strong>No eligible setup yet</strong>
			<p>
				The sequence tracker above shows the next confirmation required by the canonical engine.
			</p>
			<div><Info size={12} /> Score and risk levels appear only after eligibility passes.</div>
		</section>
	{/if}

	<footer>
		<span><Clock3 size={11} /> Updated {formatTimestamp(model.lastUpdatedAt)} UTC</span>
		<span><AlertTriangle size={11} /> Analysis only</span>
	</footer>
</aside>

<style>
	.setup-panel {
		position: sticky;
		top: 84px;
		color: #dce7f8;
		background: rgba(9, 15, 28, 0.96);
		border: 1px solid rgba(148, 163, 184, 0.11);
		border-radius: 18px;
		box-shadow: 0 28px 80px rgba(0, 0, 0, 0.24);
		overflow: hidden;
	}
	.panel-header,
	.section-heading,
	.section-heading > div,
	.bias-card strong,
	.eligibility,
	.reason-header,
	.invalidation,
	footer span {
		display: flex;
		align-items: center;
	}
	.panel-header {
		justify-content: space-between;
		padding: 1rem 1.05rem 0.85rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.09);
	}
	.section-kicker {
		display: block;
		margin-bottom: 0.18rem;
		font-size: 0.55rem;
		font-weight: 700;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: #5eead4;
	}
	h2 {
		margin: 0;
		font-size: 0.98rem;
		letter-spacing: -0.02em;
	}
	.symbol-chip,
	.status-badge,
	.direction {
		font-size: 0.54rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		border-radius: 999px;
	}
	.symbol-chip {
		padding: 0.3rem 0.45rem;
		color: #94a3b8;
		background: rgba(148, 163, 184, 0.08);
	}
	.market-state {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1px;
		background: rgba(148, 163, 184, 0.08);
		border-bottom: 1px solid rgba(148, 163, 184, 0.08);
	}
	.bias-card,
	.structure-card {
		min-width: 0;
		padding: 0.7rem 0.65rem;
		background: #090f1c;
	}
	.bias-card > span,
	.structure-card > span,
	.risk-grid span {
		display: block;
		margin-bottom: 0.28rem;
		font-size: 0.52rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #5d6d86;
	}
	.bias-card strong {
		gap: 0.25rem;
		font-size: 0.68rem;
	}
	.structure-card strong {
		display: block;
		font-size: 0.68rem;
		white-space: nowrap;
	}
	.structure-card small {
		display: block;
		margin-top: 0.18rem;
		font-size: 0.48rem;
		line-height: 1.35;
		color: #53627a;
	}
	.tone-bullish,
	.tone-positive,
	.target strong {
		color: #5eead4;
	}
	.invalidation-level strong {
		color: #fbbf24;
	}
	.tone-bearish,
	.tone-warning,
	.stop strong {
		color: #fb7185;
	}
	.tone-neutral {
		color: #94a3b8;
	}
	.strategy-state,
	.setup-summary,
	.no-setup {
		padding: 0.9rem 1.05rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.08);
	}
	.section-heading {
		justify-content: space-between;
		gap: 0.7rem;
	}
	.section-heading > div {
		gap: 0.35rem;
		font-size: 0.57rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: #657590;
	}
	.section-heading > strong {
		font-size: 0.62rem;
		color: #c4b5fd;
	}
	.strategy-state > p,
	.score-copy p,
	.no-setup p {
		margin: 0.45rem 0 0;
		font-size: 0.6rem;
		line-height: 1.55;
		color: #697994;
	}
	.condition-list {
		display: grid;
		gap: 0.05rem;
		margin-top: 0.7rem;
	}
	.condition {
		display: grid;
		grid-template-columns: 20px 1fr;
		gap: 0.4rem;
		padding: 0.33rem 0;
		color: #52627a;
	}
	.condition-icon {
		width: 17px;
		height: 17px;
		display: grid;
		place-items: center;
		color: #2dd4bf;
		background: rgba(45, 212, 191, 0.08);
		border-radius: 50%;
	}
	.condition.current {
		color: #c4b5fd;
	}
	.condition.current .condition-icon {
		color: #c4b5fd;
		background: rgba(167, 139, 250, 0.1);
		box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.04);
	}
	.condition.blocked,
	.condition.blocked .condition-icon {
		color: #fb7185;
	}
	.condition strong {
		display: block;
		font-size: 0.59rem;
		font-weight: 650;
	}
	.condition small {
		display: block;
		margin-top: 0.1rem;
		font-size: 0.49rem;
		line-height: 1.35;
		color: #52627a;
	}
	.status-badge {
		padding: 0.25rem 0.42rem;
		background: rgba(45, 212, 191, 0.07);
		border: 1px solid currentColor;
		border-color: color-mix(in srgb, currentColor 25%, transparent);
	}
	.score-row {
		display: grid;
		grid-template-columns: 68px 1fr;
		gap: 0.75rem;
		align-items: center;
		margin-top: 0.75rem;
	}
	.score-ring {
		width: 62px;
		height: 62px;
		display: grid;
		place-content: center;
		text-align: center;
		background:
			radial-gradient(circle, #090f1c 59%, transparent 61%),
			conic-gradient(#5eead4 var(--score), rgba(148, 163, 184, 0.09) 0);
		border-radius: 50%;
	}
	.score-ring strong {
		font-size: 1rem;
		line-height: 1;
	}
	.score-ring span {
		font-size: 0.45rem;
		color: #60708a;
	}
	.score-copy > div {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.direction {
		padding: 0.2rem 0.35rem;
	}
	.direction.long {
		color: #5eead4;
		background: rgba(45, 212, 191, 0.09);
	}
	.direction.short {
		color: #fb7185;
		background: rgba(251, 113, 133, 0.09);
	}
	.score-copy strong {
		font-size: 0.72rem;
	}
	.eligibility {
		gap: 0.25rem;
		margin-top: 0.4rem;
		font-size: 0.5rem;
		color: #5eead4;
	}
	.risk-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		margin-top: 0.8rem;
		padding: 1px;
		background: rgba(148, 163, 184, 0.08);
		border-radius: 9px;
		overflow: hidden;
	}
	.risk-grid > div {
		min-width: 0;
		padding: 0.55rem 0.6rem;
		background: #080e1a;
	}
	.risk-grid .rr {
		grid-column: 1 / -1;
	}
	.risk-grid strong {
		display: block;
		font-size: 0.65rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.risk-grid small {
		display: block;
		margin-top: 0.18rem;
		font-size: 0.46rem;
		line-height: 1.35;
		color: #6f6270;
	}
	.reason-header {
		gap: 0.32rem;
		margin: 0.85rem 0 0.45rem;
		font-size: 0.56rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #657590;
	}
	.reason-list {
		display: grid;
		gap: 0.25rem;
	}
	.reason {
		display: grid;
		grid-template-columns: 18px 1fr auto;
		align-items: start;
		gap: 0.35rem;
		padding: 0.35rem 0.4rem;
		color: #60708a;
		background: rgba(148, 163, 184, 0.025);
		border: 1px solid rgba(148, 163, 184, 0.055);
		border-radius: 7px;
	}
	.reason > span {
		width: 16px;
		height: 16px;
		display: grid;
		place-items: center;
		color: #718096;
		background: rgba(148, 163, 184, 0.07);
		border-radius: 50%;
	}
	.reason.confirmed > span,
	.reason.confirmed b {
		color: #5eead4;
	}
	.reason strong,
	.reason small {
		display: block;
	}
	.reason strong {
		font-size: 0.54rem;
		line-height: 1.4;
	}
	.reason small {
		margin-top: 0.08rem;
		font-size: 0.46rem;
		line-height: 1.35;
		color: #526078;
	}
	.reason b {
		font-size: 0.54rem;
	}
	.invalidation {
		gap: 0.45rem;
		margin-top: 0.7rem;
		padding: 0.55rem 0.6rem;
		color: #fb7185;
		background: rgba(251, 113, 133, 0.055);
		border: 1px solid rgba(251, 113, 133, 0.12);
		border-radius: 8px;
	}
	.invalidation div {
		display: grid;
		gap: 0.08rem;
	}
	.invalidation strong {
		font-size: 0.54rem;
	}
	.invalidation span {
		font-size: 0.5rem;
		color: #b97a89;
	}
	.no-setup {
		text-align: center;
		padding-block: 1.4rem;
	}
	.empty-icon {
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		margin: 0 auto 0.65rem;
		color: #c4b5fd;
		background: rgba(167, 139, 250, 0.08);
		border: 1px solid rgba(167, 139, 250, 0.12);
		border-radius: 50%;
	}
	.no-setup > strong {
		font-size: 0.7rem;
	}
	.no-setup > div:last-child {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.3rem;
		margin-top: 0.7rem;
		font-size: 0.49rem;
		color: #61718a;
	}
	footer {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.65rem 1.05rem;
		font-size: 0.48rem;
		color: #52627a;
	}
	footer span {
		gap: 0.25rem;
	}
	@media (max-width: 1180px) {
		.setup-panel {
			position: static;
		}
		.market-state {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	@media (max-width: 520px) {
		.market-state {
			grid-template-columns: 1fr;
		}
		.strategy-state,
		.setup-summary,
		.no-setup {
			padding-inline: 0.85rem;
		}
	}
</style>
