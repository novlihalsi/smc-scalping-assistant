import {
	CANONICAL_STRATEGY_TIMEFRAME,
	DERIVED_BIAS_TIMEFRAME,
	PRIMARY_MARKET_SYMBOL,
	type Candle
} from '../../domain/market/index.js';

export type HistoricalSymbol = typeof PRIMARY_MARKET_SYMBOL;
/** Derived-bias candles may be fetched for diagnostics, never as strategy-state input. */
export type HistoricalTimeframe =
	typeof CANONICAL_STRATEGY_TIMEFRAME | typeof DERIVED_BIAS_TIMEFRAME;

export interface HistoricalCandlesRequest {
	symbol: HistoricalSymbol;
	timeframe: HistoricalTimeframe;
	startTimestamp: number;
	endTimestamp: number;
}

export interface HistoricalMarketDataProvider {
	getCandles(request: HistoricalCandlesRequest): Promise<Candle[]>;
}
