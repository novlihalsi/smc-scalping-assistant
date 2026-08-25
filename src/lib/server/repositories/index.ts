import type { ResearchDatabaseConnection } from '../db/client.js';
import { createResearchDatabase } from '../db/client.js';
import type { ResearchJournalRepository } from './contracts.js';
import { DrizzleResearchJournalRepository } from './drizzle-research-journal.js';

let connection: ResearchDatabaseConnection | null = null;
let repository: ResearchJournalRepository | null = null;

export function getResearchJournal(): ResearchJournalRepository {
	if (!connection) connection = createResearchDatabase();
	if (!repository) repository = new DrizzleResearchJournalRepository(connection.db);
	return repository;
}

export { DrizzleResearchJournalRepository } from './drizzle-research-journal.js';
export type {
	BacktestDataJournalSummary,
	BacktestJournalRepository,
	BacktestRunJournalRecord,
	JournalSource,
	ResearchJournalRepository,
	SaveBacktestJournalInput,
	SaveSetupJournalInput,
	SetupJournalFilter,
	SetupJournalRecord,
	SetupJournalRepository,
	TradeJournalFilter,
	TradeJournalRecord
} from './contracts.js';
export {
	parseBacktestTradeJson,
	parseTradingSetup,
	parseTradingSetupJson
} from './serialization.js';
