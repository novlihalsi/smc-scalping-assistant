import type { Timeframe } from '../market/index.js';
import type { LiquidityLevel, SwingPoint } from './models.js';

export interface LiquidityDetectionConfig {
	tolerancePercent: number;
}

export interface LiquidityState {
	symbol: string | null;
	timeframe: Timeframe | null;
	levels: readonly LiquidityLevel[];
	processedSwingIds: readonly string[];
	lastProcessedTimestamp: number | null;
	lastSweepProcessedTimestamp: number | null;
}

export interface LiquidityProcessingResult {
	state: LiquidityState;
	liquidityLevel: LiquidityLevel | null;
}

export class LiquidityDetectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LiquidityDetectionError';
	}
}

export function createLiquidityState(): LiquidityState {
	return {
		symbol: null,
		timeframe: null,
		levels: [],
		processedSwingIds: [],
		lastProcessedTimestamp: null,
		lastSweepProcessedTimestamp: null
	};
}

/** Adds one already-confirmed swing to active swing/equal-level liquidity. */
export function processLiquiditySwing(
	state: LiquidityState,
	swing: SwingPoint,
	config: LiquidityDetectionConfig
): LiquidityProcessingResult {
	validateConfig(config);
	assertValidSwing(swing);

	if (state.processedSwingIds.includes(swing.id)) {
		return { state, liquidityLevel: null };
	}

	assertCompatibleSwing(state, swing);

	const liquidityType = swing.type === 'HIGH' ? 'BUY_SIDE' : 'SELL_SIDE';
	const matchingLevels = state.levels.filter(
		(level) =>
			level.status === 'ACTIVE' &&
			level.type === liquidityType &&
			isWithinTolerance(level.price, swing.price, config.tolerancePercent)
	);
	const liquidityLevel =
		matchingLevels.length === 0
			? createSwingLevel(swing)
			: createOrExtendEqualCluster(matchingLevels, swing);
	const matchedIds = new Set(matchingLevels.map(({ id }) => id));
	const levels = [...state.levels.filter(({ id }) => !matchedIds.has(id)), liquidityLevel].sort(
		(left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)
	);

	return {
		state: {
			symbol: state.symbol ?? swing.symbol,
			timeframe: state.timeframe ?? swing.timeframe,
			levels,
			processedSwingIds: [...state.processedSwingIds, swing.id],
			lastProcessedTimestamp: swing.confirmedTimestamp,
			lastSweepProcessedTimestamp: state.lastSweepProcessedTimestamp
		},
		liquidityLevel
	};
}

function createSwingLevel(swing: SwingPoint): LiquidityLevel {
	return {
		id: JSON.stringify(['LIQUIDITY', swing.symbol, swing.timeframe, swing.id]),
		type: swing.type === 'HIGH' ? 'BUY_SIDE' : 'SELL_SIDE',
		price: swing.price,
		createdAt: swing.confirmedTimestamp,
		source: swing.type === 'HIGH' ? 'SWING_HIGH' : 'SWING_LOW',
		sourceSwingIds: [swing.id],
		status: 'ACTIVE'
	};
}

function createOrExtendEqualCluster(
	matchingLevels: readonly LiquidityLevel[],
	swing: SwingPoint
): LiquidityLevel {
	const sortedLevels = [...matchingLevels].sort(
		(left, right) =>
			Number(isEqualCluster(right)) - Number(isEqualCluster(left)) ||
			left.createdAt - right.createdAt ||
			left.id.localeCompare(right.id)
	);
	const baseLevel = sortedLevels[0];

	if (!baseLevel) {
		throw new LiquidityDetectionError('Equal cluster requires at least one matching level.');
	}

	const sourceSwingIds = [
		...new Set([...matchingLevels.flatMap(({ sourceSwingIds }) => sourceSwingIds), swing.id])
	];
	const prices = [...matchingLevels.map(({ price }) => price), swing.price];
	const extendingOneCluster = matchingLevels.length === 1 && isEqualCluster(baseLevel);

	return {
		id: baseLevel.id,
		type: baseLevel.type,
		price: baseLevel.type === 'BUY_SIDE' ? Math.max(...prices) : Math.min(...prices),
		createdAt: extendingOneCluster ? baseLevel.createdAt : swing.confirmedTimestamp,
		source: baseLevel.type === 'BUY_SIDE' ? 'EQUAL_HIGH' : 'EQUAL_LOW',
		sourceSwingIds,
		status: 'ACTIVE'
	};
}

function isEqualCluster(level: LiquidityLevel): boolean {
	return level.source === 'EQUAL_HIGH' || level.source === 'EQUAL_LOW';
}

function isWithinTolerance(
	existingPrice: number,
	incomingPrice: number,
	tolerancePercent: number
): boolean {
	const differencePercent = (Math.abs(incomingPrice - existingPrice) / existingPrice) * 100;
	return differencePercent <= tolerancePercent;
}

function validateConfig(config: LiquidityDetectionConfig): void {
	if (!Number.isFinite(config.tolerancePercent) || config.tolerancePercent < 0) {
		throw new RangeError('Liquidity tolerancePercent must be a finite non-negative number.');
	}
}

function assertValidSwing(swing: SwingPoint): void {
	if (!Number.isFinite(swing.price) || swing.price <= 0) {
		throw new LiquidityDetectionError('Swing price must be a finite positive number.');
	}

	if (swing.confirmedTimestamp < swing.sourceTimestamp) {
		throw new LiquidityDetectionError('Swing confirmation cannot precede its source timestamp.');
	}
}

function assertCompatibleSwing(state: LiquidityState, swing: SwingPoint): void {
	if (state.symbol !== null && state.symbol !== swing.symbol) {
		throw new LiquidityDetectionError(
			`Cannot process ${swing.symbol} swing in ${state.symbol} liquidity state.`
		);
	}

	if (state.timeframe !== null && state.timeframe !== swing.timeframe) {
		throw new LiquidityDetectionError(
			`Cannot process ${swing.timeframe} swing in ${state.timeframe} liquidity state.`
		);
	}

	if (
		state.lastProcessedTimestamp !== null &&
		swing.confirmedTimestamp < state.lastProcessedTimestamp
	) {
		throw new LiquidityDetectionError('Confirmed swings must be processed chronologically.');
	}

	if (
		state.lastSweepProcessedTimestamp !== null &&
		swing.confirmedTimestamp <= state.lastSweepProcessedTimestamp
	) {
		throw new LiquidityDetectionError(
			'Confirmed swings must be added before sweep processing for their candle.'
		);
	}
}
