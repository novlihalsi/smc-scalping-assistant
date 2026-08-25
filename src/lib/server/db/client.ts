import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { researchSchema } from './schema.js';

export type ResearchDatabase = BetterSQLite3Database<typeof researchSchema>;

export interface ResearchDatabaseConnection {
	db: ResearchDatabase;
	sqlite: Database.Database;
	close(): void;
}

export function createResearchDatabase(
	filename = defaultDatabasePath(),
	migrationsFolder = resolve(process.cwd(), 'drizzle')
): ResearchDatabaseConnection {
	if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
	const sqlite = new Database(filename);
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('journal_mode = WAL');
	const db = drizzle(sqlite, { schema: researchSchema });
	migrate(db, { migrationsFolder });
	return { db, sqlite, close: () => sqlite.close() };
}

function defaultDatabasePath(): string {
	return process.env.SMC_DATABASE_PATH ?? resolve(process.cwd(), 'data', 'smc-research.sqlite');
}
