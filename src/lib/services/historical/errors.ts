export type HistoricalMarketDataErrorCode =
	'INVALID_REQUEST' | 'NETWORK_ERROR' | 'HTTP_ERROR' | 'INVALID_RESPONSE' | 'DUPLICATE_CANDLE';

export class HistoricalMarketDataError extends Error {
	readonly code: HistoricalMarketDataErrorCode;

	constructor(code: HistoricalMarketDataErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'HistoricalMarketDataError';
		this.code = code;
	}
}
