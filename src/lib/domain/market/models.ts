export type Timeframe = '1m' | '5m' | '15m' | '1h';

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
