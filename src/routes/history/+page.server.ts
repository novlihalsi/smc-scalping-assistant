import { getResearchJournal } from '$lib/server/repositories/index.js';

import type { PageServerLoad } from './$types.js';

const SETUP_STATES = [
	'FORMING',
	'VALID',
	'TRIGGERED',
	'INVALIDATED',
	'TP',
	'SL',
	'EXPIRED_END_OF_RANGE',
	'OPEN_END_OF_RANGE'
] as const;
const TRADE_STATES = ['WIN', 'LOSS'] as const;

export const load: PageServerLoad = ({ url }) => {
	const kind = oneOf(url.searchParams.get('kind'), ['ALL', 'SETUP', 'TRADE'] as const, 'ALL');
	const source = oneOf(url.searchParams.get('source'), ['ALL', 'LIVE', 'BACKTEST'] as const, 'ALL');
	const direction = oneOf(
		url.searchParams.get('direction'),
		['ALL', 'LONG', 'SHORT'] as const,
		'ALL'
	);
	const state = oneOf(
		url.searchParams.get('state'),
		['ALL', ...SETUP_STATES, ...TRADE_STATES] as const,
		'ALL'
	);
	const repository = getResearchJournal();
	const entries: JournalEntry[] = [];

	if (kind !== 'TRADE' && !TRADE_STATES.includes(state as (typeof TRADE_STATES)[number])) {
		const setups = repository.listSetups({
			...(source === 'ALL' ? {} : { source }),
			...(direction === 'ALL' ? {} : { direction }),
			...(state === 'ALL' ? {} : { status: state as (typeof SETUP_STATES)[number] }),
			limit: 500
		});
		entries.push(
			...setups.map((record) => ({
				kind: 'SETUP' as const,
				timestamp: record.setup.updatedAt,
				...record
			}))
		);
	}

	if (
		kind !== 'SETUP' &&
		source !== 'LIVE' &&
		!SETUP_STATES.includes(state as (typeof SETUP_STATES)[number])
	) {
		const trades = repository.listTrades({
			...(direction === 'ALL' ? {} : { direction }),
			...(state === 'ALL' ? {} : { result: state as (typeof TRADE_STATES)[number] }),
			limit: 500
		});
		entries.push(
			...trades.map((record) => ({
				kind: 'TRADE' as const,
				source: 'BACKTEST' as const,
				timestamp: record.trade.exitTimestamp,
				...record
			}))
		);
	}

	entries.sort(
		(left, right) =>
			right.timestamp - left.timestamp || left.journalId.localeCompare(right.journalId)
	);
	return {
		filters: { kind, source, direction, state },
		entries: entries.slice(0, 200),
		runs: repository.listBacktestRuns(8)
	};
};

type Repository = ReturnType<typeof getResearchJournal>;
type SetupRecord = ReturnType<Repository['listSetups']>[number];
type TradeRecord = ReturnType<Repository['listTrades']>[number];
type JournalEntry =
	| ({ kind: 'SETUP'; timestamp: number } & SetupRecord)
	| ({ kind: 'TRADE'; source: 'BACKTEST'; timestamp: number } & TradeRecord);

function oneOf<const Values extends readonly string[]>(
	value: string | null,
	allowed: Values,
	fallback: Values[number]
): Values[number] {
	return value !== null && allowed.includes(value) ? (value as Values[number]) : fallback;
}
