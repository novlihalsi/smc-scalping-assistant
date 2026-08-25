import type { Candle } from '../../domain/market/index.js';

export type HistoricalSymbol = 'BTCUSDT';
export type HistoricalTimeframe = '1m' | '5m';

export interface HistoricalCandlesRequest {
	symbol: HistoricalSymbol;
	timeframe: HistoricalTimeframe;
	startTimestamp: number;
	endTimestamp: number;
}

export interface HistoricalMarketDataProvider {
	getCandles(request: HistoricalCandlesRequest): Promise<Candle[]>;
}
