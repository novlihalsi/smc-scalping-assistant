import type { BacktestTrade, TradingSetup } from '$lib/domain/index.js';

const SETUP_STATUSES = new Set<TradingSetup['status']>([
	'FORMING',
	'VALID',
	'TRIGGERED',
	'INVALIDATED',
	'TP',
	'SL',
	'EXPIRED_END_OF_RANGE',
	'OPEN_END_OF_RANGE'
]);

export function parseTradingSetup(value: unknown): TradingSetup {
	if (!isRecord(value)) throw new TypeError('Setup journal payload must be an object.');
	if (
		!isString(value.id) ||
		!isString(value.symbol) ||
		!isFiniteNumber(value.createdAt) ||
		!isFiniteNumber(value.updatedAt) ||
		(value.direction !== 'LONG' && value.direction !== 'SHORT') ||
		!SETUP_STATUSES.has(value.status as TradingSetup['status']) ||
		!isFiniteNumber(value.score) ||
		!['WEAK', 'VALID', 'STRONG'].includes(String(value.classification)) ||
		!isFiniteNumber(value.entryPrice) ||
		!isFiniteNumber(value.stopLoss) ||
		!isFiniteNumber(value.takeProfit) ||
		!isFiniteNumber(value.riskReward) ||
		!Number.isSafeInteger(value.pendingEntryBars) ||
		!Array.isArray(value.reasons) ||
		!value.reasons.every(isSetupReason) ||
		!Array.isArray(value.sourceEventIds) ||
		!value.sourceEventIds.every(isString) ||
		!isEntryZone(value.entryZone) ||
		!isEligibility(value.eligibility) ||
		!isDependencies(value.dependencies)
	) {
		throw new TypeError('Setup journal payload does not match TradingSetup.');
	}
	if (value.triggeredAt !== undefined && !isFiniteNumber(value.triggeredAt)) {
		throw new TypeError('Setup triggeredAt must be finite when present.');
	}
	if (value.invalidationReason !== undefined && !isString(value.invalidationReason)) {
		throw new TypeError('Setup invalidationReason must be text when present.');
	}
	return structuredClone(value) as unknown as TradingSetup;
}

export function parseTradingSetupJson(value: string): TradingSetup {
	return parseTradingSetup(JSON.parse(value) as unknown);
}

export function parseBacktestTradeJson(value: string): BacktestTrade {
	const parsed = JSON.parse(value) as unknown;
	if (!isRecord(parsed)) throw new TypeError('Trade journal payload must be an object.');
	if (
		!isString(parsed.id) ||
		!isString(parsed.setupId) ||
		(parsed.direction !== 'LONG' && parsed.direction !== 'SHORT') ||
		(parsed.result !== 'WIN' && parsed.result !== 'LOSS') ||
		!isFiniteNumber(parsed.entry) ||
		!isFiniteNumber(parsed.stopLoss) ||
		!isFiniteNumber(parsed.takeProfit) ||
		!isFiniteNumber(parsed.exitPrice) ||
		!isFiniteNumber(parsed.rMultiple) ||
		!isFiniteNumber(parsed.entryTimestamp) ||
		!isFiniteNumber(parsed.exitTimestamp) ||
		!isFiniteNumber(parsed.setupScore) ||
		!Array.isArray(parsed.setupReasons) ||
		!parsed.setupReasons.every(isSetupReason) ||
		!['TAKE_PROFIT', 'STOP_LOSS'].includes(String(parsed.exitReason)) ||
		typeof parsed.intrabarAmbiguous !== 'boolean' ||
		!isFiniteNumber(parsed.feesPaid) ||
		!isFiniteNumber(parsed.slippagePaid)
	) {
		throw new TypeError('Trade journal payload does not match BacktestTrade.');
	}
	return structuredClone(parsed) as unknown as BacktestTrade;
}

function isSetupReason(value: unknown): boolean {
	return (
		isRecord(value) &&
		isString(value.key) &&
		isString(value.label) &&
		isFiniteNumber(value.score) &&
		typeof value.valid === 'boolean' &&
		isString(value.description)
	);
}

function isEntryZone(value: unknown): boolean {
	return isRecord(value) && isFiniteNumber(value.min) && isFiniteNumber(value.max);
}

function isEligibility(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.eligible === 'boolean' &&
		Array.isArray(value.failures) &&
		value.failures.every(
			(failure) =>
				isRecord(failure) &&
				isString(failure.key) &&
				isString(failure.label) &&
				isString(failure.description)
		)
	);
}

function isDependencies(value: unknown): boolean {
	return (
		isRecord(value) &&
		isString(value.sequenceId) &&
		isString(value.fvgId) &&
		(value.orderBlockId === null || isString(value.orderBlockId)) &&
		isString(value.sweepId) &&
		isString(value.structureBreakId) &&
		isString(value.displacementId) &&
		isString(value.protectedSwingId) &&
		isFiniteNumber(value.protectedSwingPrice) &&
		isString(value.protectedBosId)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
