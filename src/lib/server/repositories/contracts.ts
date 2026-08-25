import type {
	BacktestExecutionConfig,
	BacktestMetrics,
	BacktestTrade,
	BacktestValidationReport,
	SMCStrategyConfig,
	TradingSetup
} from '$lib/domain/index.js';

export type JournalSource = 'LIVE' | 'BACKTEST';

export interface BacktestDataJournalSummary {
	oneMinuteCandles: number;
	preRollCandles: number;
	fiveMinuteCandles: number;
	processedCandles: number;
	pendingTrades: number;
	openTrades: number;
	expiredPendingTrades: number;
	censoredOpenTrades: number;
	preRollTradesExcluded: number;
}

export interface SaveSetupJournalInput {
	setups: readonly TradingSetup[];
	source: JournalSource;
	backtestRunId?: string | null;
	recordedAt: number;
}

export interface SaveBacktestJournalInput {
	id: string;
	completedAt: number;
	input: {
		symbol: string;
		startDate: number;
		endDate: number;
		config: SMCStrategyConfig;
	};
	executionConfig: BacktestExecutionConfig;
	data: BacktestDataJournalSummary;
	metrics: BacktestMetrics;
	validation: BacktestValidationReport;
	setups: readonly TradingSetup[];
	trades: readonly BacktestTrade[];
}

export interface SetupJournalRecord {
	journalId: string;
	source: JournalSource;
	backtestRunId: string | null;
	setup: TradingSetup;
	recordedAt: number;
}

export interface TradeJournalRecord {
	journalId: string;
	backtestRunId: string;
	trade: BacktestTrade;
}

export interface BacktestRunJournalRecord {
	id: string;
	symbol: string;
	startTimestamp: number;
	endTimestamp: number;
	completedAt: number;
	configHash: string;
	validationVerdict: BacktestValidationReport['verdict'];
	metrics: BacktestMetrics;
	data: BacktestDataJournalSummary;
}

export interface SetupJournalFilter {
	source?: JournalSource;
	direction?: TradingSetup['direction'];
	status?: TradingSetup['status'];
	limit?: number;
}

export interface TradeJournalFilter {
	direction?: BacktestTrade['direction'];
	result?: BacktestTrade['result'];
	limit?: number;
}

export interface SetupJournalRepository {
	upsertSetups(input: SaveSetupJournalInput): void;
	listSetups(filter?: SetupJournalFilter): SetupJournalRecord[];
}

export interface BacktestJournalRepository {
	saveBacktest(input: SaveBacktestJournalInput): void;
	listTrades(filter?: TradeJournalFilter): TradeJournalRecord[];
	listBacktestRuns(limit?: number): BacktestRunJournalRecord[];
}

export type ResearchJournalRepository = SetupJournalRepository & BacktestJournalRepository;
