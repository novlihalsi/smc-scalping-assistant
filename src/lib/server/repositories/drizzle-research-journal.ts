import { and, desc, eq, lte, type SQL } from 'drizzle-orm';

import type { BacktestMetrics, BacktestValidationReport, TradingSetup } from '$lib/domain/index.js';

import type { ResearchDatabase } from '../db/client.js';
import { backtestRuns, backtestTrades, setupJournal, strategyConfigs } from '../db/schema.js';
import type {
	BacktestDataJournalSummary,
	BacktestRunJournalRecord,
	JournalSource,
	ResearchJournalRepository,
	SaveBacktestJournalInput,
	SaveSetupJournalInput,
	SetupJournalFilter,
	SetupJournalRecord,
	TradeJournalFilter,
	TradeJournalRecord
} from './contracts.js';
import { parseBacktestTradeJson, parseTradingSetupJson } from './serialization.js';

const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 1_000;

export class DrizzleResearchJournalRepository implements ResearchJournalRepository {
	constructor(private readonly db: ResearchDatabase) {}

	upsertSetups(input: SaveSetupJournalInput): void {
		validateSetupContext(input.source, input.backtestRunId ?? null, input.recordedAt);
		this.db.transaction((transaction) => {
			for (const setup of input.setups) {
				const values = setupValues(
					setup,
					input.source,
					input.backtestRunId ?? null,
					input.recordedAt
				);
				transaction
					.insert(setupJournal)
					.values(values)
					.onConflictDoUpdate({
						target: setupJournal.journalId,
						setWhere: lte(setupJournal.updatedAt, values.updatedAt),
						set: {
							direction: values.direction,
							status: values.status,
							classification: values.classification,
							score: values.score,
							updatedAt: values.updatedAt,
							invalidationReason: values.invalidationReason,
							recordedAt: values.recordedAt,
							payloadJson: values.payloadJson
						}
					})
					.run();
			}
		});
	}

	saveBacktest(input: SaveBacktestJournalInput): void {
		validateBacktestInput(input);
		const configId = input.validation.provenance.configHash;
		this.db.transaction((transaction) => {
			transaction
				.insert(strategyConfigs)
				.values({
					id: configId,
					strategy: input.validation.provenance.strategy,
					strategyConfigJson: JSON.stringify(input.input.config),
					executionConfigJson: JSON.stringify(input.executionConfig),
					createdAt: input.completedAt,
					lastUsedAt: input.completedAt
				})
				.onConflictDoUpdate({
					target: strategyConfigs.id,
					set: {
						strategyConfigJson: JSON.stringify(input.input.config),
						executionConfigJson: JSON.stringify(input.executionConfig),
						lastUsedAt: input.completedAt
					}
				})
				.run();

			const runValues = {
				id: input.id,
				strategyConfigId: configId,
				symbol: input.input.symbol,
				startTimestamp: input.input.startDate,
				endTimestamp: input.input.endDate,
				completedAt: input.completedAt,
				configHash: input.validation.provenance.configHash,
				validationVerdict: input.validation.verdict,
				tradeCount: input.metrics.totalTrades,
				winRate: input.metrics.winRate,
				profitFactor: input.metrics.profitFactor,
				expectancyR: input.metrics.expectancyR,
				totalR: input.metrics.totalR,
				maxDrawdownR: input.metrics.maxDrawdownR,
				dataJson: JSON.stringify(input.data),
				metricsJson: JSON.stringify(input.metrics),
				validationJson: JSON.stringify(input.validation)
			};
			transaction
				.insert(backtestRuns)
				.values(runValues)
				.onConflictDoUpdate({
					target: backtestRuns.id,
					set: runValues
				})
				.run();

			for (const setup of latestSetupSnapshots(input.setups)) {
				const values = setupValues(setup, 'BACKTEST', input.id, input.completedAt);
				transaction
					.insert(setupJournal)
					.values(values)
					.onConflictDoUpdate({ target: setupJournal.journalId, set: values })
					.run();
			}

			for (const trade of input.trades) {
				const values = {
					journalId: tradeJournalId(input.id, trade.id),
					domainId: trade.id,
					backtestRunId: input.id,
					setupId: trade.setupId,
					direction: trade.direction,
					result: trade.result,
					rMultiple: trade.rMultiple,
					setupScore: trade.setupScore,
					entryTimestamp: trade.entryTimestamp,
					exitTimestamp: trade.exitTimestamp,
					payloadJson: JSON.stringify(trade)
				};
				transaction
					.insert(backtestTrades)
					.values(values)
					.onConflictDoUpdate({ target: backtestTrades.journalId, set: values })
					.run();
			}
		});
	}

	listSetups(filter: SetupJournalFilter = {}): SetupJournalRecord[] {
		const conditions: SQL[] = [];
		if (filter.source) conditions.push(eq(setupJournal.source, filter.source));
		if (filter.direction) conditions.push(eq(setupJournal.direction, filter.direction));
		if (filter.status) conditions.push(eq(setupJournal.status, filter.status));
		const rows = this.db
			.select()
			.from(setupJournal)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(setupJournal.updatedAt), desc(setupJournal.journalId))
			.limit(resolveLimit(filter.limit))
			.all();
		return rows.map((row) => ({
			journalId: row.journalId,
			source: parseJournalSource(row.source),
			backtestRunId: row.backtestRunId,
			setup: parseTradingSetupJson(row.payloadJson),
			recordedAt: row.recordedAt
		}));
	}

	listTrades(filter: TradeJournalFilter = {}): TradeJournalRecord[] {
		const conditions: SQL[] = [];
		if (filter.direction) conditions.push(eq(backtestTrades.direction, filter.direction));
		if (filter.result) conditions.push(eq(backtestTrades.result, filter.result));
		return this.db
			.select()
			.from(backtestTrades)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(backtestTrades.exitTimestamp), desc(backtestTrades.journalId))
			.limit(resolveLimit(filter.limit))
			.all()
			.map((row) => ({
				journalId: row.journalId,
				backtestRunId: row.backtestRunId,
				trade: parseBacktestTradeJson(row.payloadJson)
			}));
	}

	listBacktestRuns(limit = 12): BacktestRunJournalRecord[] {
		return this.db
			.select()
			.from(backtestRuns)
			.orderBy(desc(backtestRuns.completedAt), desc(backtestRuns.id))
			.limit(resolveLimit(limit))
			.all()
			.map((row) => ({
				id: row.id,
				symbol: row.symbol,
				startTimestamp: row.startTimestamp,
				endTimestamp: row.endTimestamp,
				completedAt: row.completedAt,
				configHash: row.configHash,
				validationVerdict: parseValidationVerdict(row.validationVerdict),
				metrics: JSON.parse(row.metricsJson) as BacktestMetrics,
				data: JSON.parse(row.dataJson) as BacktestDataJournalSummary
			}));
	}
}

function setupValues(
	setup: TradingSetup,
	source: JournalSource,
	backtestRunId: string | null,
	recordedAt: number
) {
	return {
		journalId: setupJournalId(source, backtestRunId, setup.id),
		domainId: setup.id,
		source,
		backtestRunId,
		symbol: setup.symbol,
		direction: setup.direction,
		status: setup.status,
		classification: setup.classification,
		score: setup.score,
		createdAt: setup.createdAt,
		updatedAt: setup.updatedAt,
		invalidationReason: setup.invalidationReason ?? null,
		recordedAt,
		payloadJson: JSON.stringify(setup)
	};
}

function latestSetupSnapshots(setups: readonly TradingSetup[]): TradingSetup[] {
	const snapshots = new Map<string, TradingSetup>();
	for (const setup of setups) {
		const existing = snapshots.get(setup.id);
		if (!existing || setup.updatedAt >= existing.updatedAt) snapshots.set(setup.id, setup);
	}
	return [...snapshots.values()];
}

function setupJournalId(
	source: JournalSource,
	backtestRunId: string | null,
	domainId: string
): string {
	return JSON.stringify(['SETUP_JOURNAL', source, backtestRunId, domainId]);
}

function tradeJournalId(backtestRunId: string, domainId: string): string {
	return JSON.stringify(['TRADE_JOURNAL', backtestRunId, domainId]);
}

function validateSetupContext(
	source: JournalSource,
	backtestRunId: string | null,
	recordedAt: number
): void {
	if (!Number.isSafeInteger(recordedAt) || recordedAt < 0) {
		throw new RangeError('Setup journal recordedAt must be a non-negative safe integer.');
	}
	if (source === 'LIVE' && backtestRunId !== null) {
		throw new TypeError('Live setup journal entries cannot reference a backtest run.');
	}
	if (source === 'BACKTEST' && !backtestRunId) {
		throw new TypeError('Backtest setup journal entries require a run ID.');
	}
}

function validateBacktestInput(input: SaveBacktestJournalInput): void {
	if (!input.id || !Number.isSafeInteger(input.completedAt) || input.completedAt < 0) {
		throw new TypeError('Backtest journal persistence requires an ID and completion timestamp.');
	}
	if (input.validation.provenance.symbol !== input.input.symbol) {
		throw new TypeError('Backtest journal provenance symbol must match its input.');
	}
	if (input.metrics.totalTrades !== input.trades.length) {
		throw new TypeError('Backtest journal trade count must match persisted closed trades.');
	}
}

function parseJournalSource(value: string): JournalSource {
	if (value !== 'LIVE' && value !== 'BACKTEST')
		throw new TypeError(`Unknown journal source: ${value}`);
	return value;
}

function parseValidationVerdict(value: string): BacktestValidationReport['verdict'] {
	if (!['INSUFFICIENT_SAMPLE', 'CANDIDATE', 'NEEDS_REVIEW'].includes(value)) {
		throw new TypeError(`Unknown validation verdict: ${value}`);
	}
	return value as BacktestValidationReport['verdict'];
}

function resolveLimit(limit = DEFAULT_LIST_LIMIT): number {
	if (!Number.isSafeInteger(limit) || limit < 1)
		throw new RangeError('Journal limit must be positive.');
	return Math.min(limit, MAX_LIST_LIMIT);
}
