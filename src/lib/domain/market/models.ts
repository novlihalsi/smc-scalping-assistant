import type { Timeframe } from './constants.js';

export type { Timeframe } from './constants.js';

export interface Candle {
	symbol: string;
	timeframe: Timeframe;
	openTimestamp: number;
	closeTimestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	closed: boolean;
}
