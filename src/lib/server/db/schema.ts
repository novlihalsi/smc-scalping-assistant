import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const strategyConfigs = sqliteTable('strategy_configs', {
	id: text('id').primaryKey(),
	strategy: text('strategy').notNull(),
	strategyConfigJson: text('strategy_config_json').notNull(),
	executionConfigJson: text('execution_config_json').notNull(),
	createdAt: integer('created_at').notNull(),
	lastUsedAt: integer('last_used_at').notNull()
});

export const backtestRuns = sqliteTable(
	'backtest_runs',
	{
		id: text('id').primaryKey(),
		strategyConfigId: text('strategy_config_id')
			.notNull()
			.references(() => strategyConfigs.id),
		symbol: text('symbol').notNull(),
		startTimestamp: integer('start_timestamp').notNull(),
		endTimestamp: integer('end_timestamp').notNull(),
		completedAt: integer('completed_at').notNull(),
		configHash: text('config_hash').notNull(),
		validationVerdict: text('validation_verdict').notNull(),
		tradeCount: integer('trade_count').notNull(),
		winRate: real('win_rate').notNull(),
		profitFactor: real('profit_factor'),
		expectancyR: real('expectancy_r').notNull(),
		totalR: real('total_r').notNull(),
		maxDrawdownR: real('max_drawdown_r').notNull(),
		dataJson: text('data_json').notNull(),
		metricsJson: text('metrics_json').notNull(),
		validationJson: text('validation_json').notNull()
	},
	(table) => [
		index('backtest_runs_completed_at_idx').on(table.completedAt),
		index('backtest_runs_symbol_idx').on(table.symbol)
	]
);

export const setupJournal = sqliteTable(
	'setup_journal',
	{
		journalId: text('journal_id').primaryKey(),
		domainId: text('domain_id').notNull(),
		source: text('source').notNull(),
		backtestRunId: text('backtest_run_id').references(() => backtestRuns.id, {
			onDelete: 'cascade'
		}),
		symbol: text('symbol').notNull(),
		direction: text('direction').notNull(),
		status: text('status').notNull(),
		classification: text('classification').notNull(),
		score: integer('score').notNull(),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull(),
		invalidationReason: text('invalidation_reason'),
		recordedAt: integer('recorded_at').notNull(),
		payloadJson: text('payload_json').notNull()
	},
	(table) => [
		index('setup_journal_updated_at_idx').on(table.updatedAt),
		index('setup_journal_source_idx').on(table.source),
		index('setup_journal_direction_idx').on(table.direction),
		index('setup_journal_status_idx').on(table.status),
		index('setup_journal_domain_id_idx').on(table.domainId)
	]
);

export const backtestTrades = sqliteTable(
	'backtest_trades',
	{
		journalId: text('journal_id').primaryKey(),
		domainId: text('domain_id').notNull(),
		backtestRunId: text('backtest_run_id')
			.notNull()
			.references(() => backtestRuns.id, { onDelete: 'cascade' }),
		setupId: text('setup_id').notNull(),
		direction: text('direction').notNull(),
		result: text('result').notNull(),
		rMultiple: real('r_multiple').notNull(),
		setupScore: integer('setup_score').notNull(),
		entryTimestamp: integer('entry_timestamp').notNull(),
		exitTimestamp: integer('exit_timestamp').notNull(),
		payloadJson: text('payload_json').notNull()
	},
	(table) => [
		index('backtest_trades_exit_timestamp_idx').on(table.exitTimestamp),
		index('backtest_trades_direction_idx').on(table.direction),
		index('backtest_trades_result_idx').on(table.result),
		index('backtest_trades_run_idx').on(table.backtestRunId)
	]
);

export const researchSchema = {
	strategyConfigs,
	backtestRuns,
	setupJournal,
	backtestTrades
};
