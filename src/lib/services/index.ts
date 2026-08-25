export {
	BinanceHistoricalMarketDataProvider,
	type BinanceHistoricalMarketDataProviderOptions
} from './exchange/index.js';
export { runHistoricalBacktest } from './backtest/index.js';
export type { HistoricalBacktestReport, HistoricalBacktestRequest } from './backtest/index.js';
export { HistoricalMarketDataError, InMemoryHistoricalCandleStore } from './historical/index.js';
export type {
	HistoricalCandleQuery,
	HistoricalCandleStore,
	HistoricalCandlesRequest,
	HistoricalMarketDataErrorCode,
	HistoricalMarketDataProvider,
	HistoricalSymbol,
	HistoricalTimeframe
} from './historical/index.js';
