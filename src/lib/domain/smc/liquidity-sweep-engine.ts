import type { Candle } from '../market/index.js';
import type { LiquidityState } from './liquidity-engine.js';
import type { LiquidityLevel, LiquiditySweep } from './models.js';

export type LiquidityInteractionType = 'TOUCH' | 'SWEEP' | 'BREAKOUT';

export interface LiquidityInteraction {
	liquidityId: string;
	timestamp: number;
	type: LiquidityInteractionType;
	direction: LiquidityLevel['type'];
	liquidityPrice: number;
}

export interface LiquiditySweepProcessingResult {
	state: LiquidityState;
	interactions: readonly LiquidityInteraction[];
	sweeps: readonly LiquiditySweep[];
}

export class LiquiditySweepError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LiquiditySweepError';
	}
}

export function processLiquiditySweepCandle(
	state: LiquidityState,
	candle: Candle
): LiquiditySweepProcessingResult {
	if (!candle.closed) {
		return { state, interactions: [], sweeps: [] };
	}

	assertCompatibleInput(state, candle);

	const interactions: LiquidityInteraction[] = [];
	const sweeps: LiquiditySweep[] = [];
	const levels = state.levels.map((level) => {
		if (level.status !== 'ACTIVE') {
			return level;
		}

		const interactionType = classifyInteraction(level, candle);

		if (!interactionType) {
			return level;
		}

		interactions.push({
			liquidityId: level.id,
			timestamp: candle.closeTimestamp,
			type: interactionType,
			direction: level.type,
			liquidityPrice: level.price
		});

		if (interactionType === 'SWEEP') {
			sweeps.push(createSweep(level, candle));

			return {
				...level,
				status: 'SWEPT' as const,
				sweptAt: candle.closeTimestamp
			};
		}

		if (interactionType === 'BREAKOUT') {
			return { ...level, status: 'INVALIDATED' as const };
		}

		return level;
	});

	return {
		state: {
			...state,
			symbol: state.symbol ?? candle.symbol,
			timeframe: state.timeframe ?? candle.timeframe,
			levels,
			lastSweepProcessedTimestamp: candle.closeTimestamp
		},
		interactions,
		sweeps
	};
}

function classifyInteraction(
	level: LiquidityLevel,
	candle: Candle
): LiquidityInteractionType | null {
	if (level.type === 'BUY_SIDE') {
		if (candle.close > level.price) {
			return 'BREAKOUT';
		}

		if (candle.high > level.price && candle.close < level.price) {
			return 'SWEEP';
		}

		return candle.high >= level.price ? 'TOUCH' : null;
	}

	if (candle.close < level.price) {
		return 'BREAKOUT';
	}

	if (candle.low < level.price && candle.close > level.price) {
		return 'SWEEP';
	}

	return candle.low <= level.price ? 'TOUCH' : null;
}

function createSweep(level: LiquidityLevel, candle: Candle): LiquiditySweep {
	return {
		id: JSON.stringify([
			'LIQUIDITY_SWEEP',
			candle.symbol,
			candle.timeframe,
			candle.closeTimestamp,
			level.id
		]),
		liquidityId: level.id,
		timestamp: candle.closeTimestamp,
		direction: level.type,
		liquidityPrice: level.price,
		extremePrice: level.type === 'BUY_SIDE' ? candle.high : candle.low,
		closePrice: candle.close
	};
}

function assertCompatibleInput(state: LiquidityState, candle: Candle): void {
	if (state.symbol !== null && state.symbol !== candle.symbol) {
		throw new LiquiditySweepError(
			`Cannot process ${candle.symbol} candle in ${state.symbol} liquidity state.`
		);
	}

	if (state.timeframe !== null && state.timeframe !== candle.timeframe) {
		throw new LiquiditySweepError(
			`Cannot process ${candle.timeframe} candle in ${state.timeframe} liquidity state.`
		);
	}

	if (
		state.lastSweepProcessedTimestamp !== null &&
		candle.closeTimestamp <= state.lastSweepProcessedTimestamp
	) {
		throw new LiquiditySweepError('Closed candles must be processed once in chronological order.');
	}

	if (
		state.lastProcessedTimestamp !== null &&
		state.lastProcessedTimestamp > candle.closeTimestamp
	) {
		throw new LiquiditySweepError('Liquidity state contains a future-confirmed swing.');
	}

	for (const level of state.levels) {
		if (level.createdAt > candle.closeTimestamp) {
			throw new LiquiditySweepError(
				'Liquidity state contains a level not yet created by this candle.'
			);
		}

		if (level.sweptAt !== undefined && level.sweptAt > candle.closeTimestamp) {
			throw new LiquiditySweepError('Liquidity state contains a future sweep.');
		}
	}
}
