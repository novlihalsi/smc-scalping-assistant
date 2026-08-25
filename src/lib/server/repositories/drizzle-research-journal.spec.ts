import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	analyzeBacktest,
	DEFAULT_SMC_STRATEGY_CONFIG,
	generateBacktestValidationReport,
	type BacktestExecutionConfig,
	type BacktestTrade,
	type TradingSetup
} from '$lib/domain/index.js';

import { createResearchDatabase, type ResearchDatabaseConnection } from '../db/client.js';
import { DrizzleResearchJournalRepository } from './drizzle-research-journal.js';

const START = Date.UTC(2025, 0, 1);
const END = START + 86_400_000;
const migrationsFolder = resolve(process.cwd(), 'drizzle');
const temporaryDirectories: string[] = [];
const openConnections: ResearchDatabaseConnection[] = [];

afterEach(() => {
	for (const connection of openConnections.splice(0)) connection.close();
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('DrizzleResearchJournalRepository', () => {
	it('applies migrations to a new SQLite database', () => {
		const { connection } = openTemporaryDatabase();
		const tables = connection.sqlite
			.prepare("select name from sqlite_master where type = 'table' order by name")
			.all()
			.map((row) => (row as { name: string }).name);

		expect(tables).toEqual(
			expect.arrayContaining([
				'__drizzle_migrations',
				'backtest_runs',
				'backtest_trades',
				'setup_journal',
				'strategy_configs'
			])
		);
	});

	it('upserts the latest live setup snapshot and survives a database restart', () => {
		const { connection, filename } = openTemporaryDatabase();
		const repository = new DrizzleResearchJournalRepository(connection.db);
		const validSetup = setupFixture();
		const invalidatedSetup: TradingSetup = {
			...validSetup,
			status: 'INVALIDATED',
			updatedAt: validSetup.updatedAt + 60_000,
			invalidationReason: 'Protected swing was violated by a finalized 1m candle.'
		};

		repository.upsertSetups({ setups: [validSetup], source: 'LIVE', recordedAt: END });
		repository.upsertSetups({
			setups: [invalidatedSetup],
			source: 'LIVE',
			recordedAt: END + 60_000
		});
		repository.upsertSetups({ setups: [validSetup], source: 'LIVE', recordedAt: END + 120_000 });
		connection.close();
		openConnections.splice(openConnections.indexOf(connection), 1);

		const restarted = createResearchDatabase(filename, migrationsFolder);
		openConnections.push(restarted);
		const records = new DrizzleResearchJournalRepository(restarted.db).listSetups({
			source: 'LIVE',
			direction: 'LONG',
			status: 'INVALIDATED'
		});

		expect(records).toHaveLength(1);
		expect(records[0].setup).toMatchObject({
			id: validSetup.id,
			status: 'INVALIDATED',
			invalidationReason: invalidatedSetup.invalidationReason,
			reasons: validSetup.reasons
		});
	});

	it('persists a completed backtest with its config, setup reasoning, run metrics, and trade', () => {
		const { connection } = openTemporaryDatabase();
		const repository = new DrizzleResearchJournalRepository(connection.db);
		const setup = setupFixture();
		const trade = tradeFixture(setup);
		const analytics = analyzeBacktest([trade]);
		const executionConfig: BacktestExecutionConfig = { feeBps: 1, slippageBps: 0.5 };
		const input = {
			symbol: 'BTCUSDT' as const,
			startDate: START,
			endDate: END,
			config: DEFAULT_SMC_STRATEGY_CONFIG
		};
		const validation = generateBacktestValidationReport({
			input,
			trades: [trade],
			analytics,
			executionConfig,
			costRuns: [
				{
					key: 'ZERO_COST',
					label: 'Zero cost',
					executionConfig: { feeBps: 0, slippageBps: 0 },
					analytics
				},
				{ key: 'BASELINE', label: 'Baseline', executionConfig, analytics },
				{
					key: 'STRESS_2X',
					label: 'Stress',
					executionConfig: { feeBps: 2, slippageBps: 1 },
					analytics
				}
			]
		});

		repository.saveBacktest({
			id: 'run-1',
			completedAt: END + 1,
			input,
			executionConfig,
			data: {
				oneMinuteCandles: 1_440,
				preRollCandles: 500,
				fiveMinuteCandles: 288,
				processedCandles: 1_940,
				pendingTrades: 0,
				openTrades: 0,
				expiredPendingTrades: 0,
				censoredOpenTrades: 0,
				preRollTradesExcluded: 0
			},
			metrics: analytics.metrics,
			validation,
			setups: [setup],
			trades: [trade]
		});

		expect(repository.listBacktestRuns()).toEqual([
			expect.objectContaining({ id: 'run-1', symbol: 'BTCUSDT', metrics: analytics.metrics })
		]);
		expect(repository.listSetups({ source: 'BACKTEST' })[0].setup.reasons).toEqual(setup.reasons);
		expect(repository.listTrades({ result: 'WIN' })[0]).toMatchObject({
			backtestRunId: 'run-1',
			trade
		});
		const storedConfig = connection.sqlite
			.prepare('select strategy_config_json from strategy_configs')
			.get() as { strategy_config_json: string };
		expect(JSON.parse(storedConfig.strategy_config_json)).toEqual(DEFAULT_SMC_STRATEGY_CONFIG);
	});
});

function openTemporaryDatabase(): {
	connection: ResearchDatabaseConnection;
	filename: string;
} {
	const directory = mkdtempSync(join(tmpdir(), 'smc-research-journal-'));
	const filename = join(directory, 'journal.sqlite');
	const connection = createResearchDatabase(filename, migrationsFolder);
	temporaryDirectories.push(directory);
	openConnections.push(connection);
	return { connection, filename };
}

function setupFixture(): TradingSetup {
	return {
		id: 'setup-1',
		symbol: 'BTCUSDT',
		createdAt: START + 420_000,
		updatedAt: START + 420_000,
		direction: 'LONG',
		status: 'VALID',
		eligibility: { eligible: true, failures: [] },
		score: 75,
		classification: 'VALID',
		entryZone: { min: 99, max: 100 },
		entryPrice: 100,
		stopLoss: 98,
		takeProfit: 104,
		riskReward: 2,
		reasons: [
			{
				key: 'LIQUIDITY_SWEEP',
				label: 'Liquidity sweep',
				score: 20,
				valid: true,
				description: 'Sell-side liquidity was swept before bullish confirmation.'
			}
		],
		sourceEventIds: ['sweep-1', 'bos-1', 'fvg-1'],
		dependencies: {
			sequenceId: 'sequence-1',
			fvgId: 'fvg-1',
			orderBlockId: null,
			sweepId: 'sweep-1',
			structureBreakId: 'bos-1',
			displacementId: 'displacement-1',
			protectedSwingId: 'protected-low-1',
			protectedSwingPrice: 98,
			protectedBosId: 'protecting-bos-1'
		},
		pendingEntryBars: 0
	};
}

function tradeFixture(setup: TradingSetup): BacktestTrade {
	return {
		id: 'trade-1',
		setupId: setup.id,
		direction: setup.direction,
		entry: setup.entryPrice,
		stopLoss: setup.stopLoss,
		takeProfit: setup.takeProfit,
		exitPrice: setup.takeProfit,
		result: 'WIN',
		rMultiple: 2,
		entryTimestamp: START + 480_000,
		exitTimestamp: START + 600_000,
		setupScore: setup.score,
		setupReasons: setup.reasons,
		exitReason: 'TAKE_PROFIT',
		intrabarAmbiguous: false,
		feesPaid: 0.01,
		slippagePaid: 0.005
	};
}
