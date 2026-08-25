import type { Timeframe } from '../market/index.js';

export interface SwingPoint {
	id: string;
	symbol: string;
	timeframe: Timeframe;
	sourceIndex: number;
	sourceTimestamp: number;
	confirmedTimestamp: number;
	price: number;
	type: 'HIGH' | 'LOW';
	strength: number;
}

export type StructureType = 'HH' | 'HL' | 'LH' | 'LL';
export type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface MarketStructurePoint {
	swingId: string;
	timestamp: number;
	price: number;
	structure: StructureType;
}

export interface StructureBreak {
	id: string;
	timestamp: number;
	direction: 'BULLISH' | 'BEARISH';
	type: 'BOS' | 'CHOCH';
	brokenSwingId: string;
	brokenLevel: number;
	closePrice: number;
}

export interface LiquidityLevel {
	id: string;
	type: 'BUY_SIDE' | 'SELL_SIDE';
	price: number;
	createdAt: number;
	source: 'EQUAL_HIGH' | 'EQUAL_LOW' | 'SWING_HIGH' | 'SWING_LOW';
	sourceSwingIds: string[];
	status: 'ACTIVE' | 'SWEPT' | 'INVALIDATED';
	sweptAt?: number;
}

export interface LiquiditySweep {
	id: string;
	liquidityId: string;
	timestamp: number;
	direction: 'BUY_SIDE' | 'SELL_SIDE';
	liquidityPrice: number;
	extremePrice: number;
	closePrice: number;
}

export interface FairValueGap {
	id: string;
	type: 'BULLISH' | 'BEARISH';
	createdAt: number;
	sourceCandleTimestamps: readonly [number, number, number];
	bottom: number;
	top: number;
	midpoint: number;
	state: 'UNTOUCHED' | 'PARTIALLY_FILLED' | 'FILLED';
	lastUpdatedAt: number;
	causalSequenceId: string | null;
	causalStructureBreakId: string | null;
	causalDisplacementId: string | null;
}

export interface OrderBlock {
	id: string;
	type: 'BULLISH' | 'BEARISH';
	createdAt: number;
	sourceCandleTimestamp: number;
	high: number;
	low: number;
	midpoint: number;
	state: 'ACTIVE' | 'MITIGATED' | 'INVALIDATED';
	causalStructureBreakId: string;
	causalDisplacementId: string;
	causalSequenceId: string | null;
}
