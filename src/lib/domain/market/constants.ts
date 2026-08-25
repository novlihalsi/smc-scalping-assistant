export const TIMEFRAME_DURATION_MILLISECONDS = {
	'1m': 60_000,
	'5m': 300_000,
	'15m': 900_000,
	'1h': 3_600_000
} as const;

export type Timeframe = keyof typeof TIMEFRAME_DURATION_MILLISECONDS;

export const CANONICAL_STRATEGY_TIMEFRAME = '1m' as const satisfies Timeframe;
export const DERIVED_BIAS_TIMEFRAME = '5m' as const satisfies Timeframe;
export const PRIMARY_MARKET_SYMBOL = 'BTCUSDT' as const;
export const MILLISECONDS_PER_DAY = TIMEFRAME_DURATION_MILLISECONDS['1h'] * 24;
export const CANONICAL_CANDLES_PER_BIAS_CANDLE =
	TIMEFRAME_DURATION_MILLISECONDS[DERIVED_BIAS_TIMEFRAME] /
	TIMEFRAME_DURATION_MILLISECONDS[CANONICAL_STRATEGY_TIMEFRAME];

export function getTimeframeDurationMilliseconds(timeframe: Timeframe): number {
	return TIMEFRAME_DURATION_MILLISECONDS[timeframe];
}

export function isTimeframe(value: unknown): value is Timeframe {
	return (
		typeof value === 'string' &&
		Object.prototype.hasOwnProperty.call(TIMEFRAME_DURATION_MILLISECONDS, value)
	);
}
