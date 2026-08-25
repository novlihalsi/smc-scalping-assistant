import {
	CANONICAL_STRATEGY_TIMEFRAME,
	PRIMARY_MARKET_SYMBOL,
	type Candle
} from '../../domain/market/index.js';

export type RealtimeSymbol = typeof PRIMARY_MARKET_SYMBOL;
export type RealtimeTimeframe = typeof CANONICAL_STRATEGY_TIMEFRAME;
export type RealtimeConnectionState =
	'CONNECTING' | 'CONNECTED' | 'STALE' | 'RECONNECTING' | 'DISCONNECTED';

export interface RealtimeCandlesRequest {
	symbol: RealtimeSymbol;
	timeframe: RealtimeTimeframe;
}

export interface RealtimeConnectionStatus {
	state: RealtimeConnectionState;
	changedAt: number;
	reconnectAttempt: number;
}

export interface RealtimeMarketDataListener {
	onCandle(candle: Candle): void;
	onConnectionState(status: RealtimeConnectionStatus): void;
	onError?(error: Error): void;
}

export type Unsubscribe = () => void;

export interface RealtimeMarketDataProvider {
	subscribe(request: RealtimeCandlesRequest, listener: RealtimeMarketDataListener): Unsubscribe;
}
