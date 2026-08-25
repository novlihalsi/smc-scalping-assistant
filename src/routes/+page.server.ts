import {
	aggregateOneMinuteCandlesToFiveMinutes,
	CANONICAL_STRATEGY_TIMEFRAME,
	PRIMARY_MARKET_SYMBOL,
	prepareContinuousOneMinuteCandles,
	TIMEFRAME_DURATION_MILLISECONDS
} from '$lib/domain/index.js';
import { BinanceHistoricalMarketDataProvider } from '$lib/services/index.js';

import type { PageServerLoad } from './$types.js';

const BOOTSTRAP_CANDLES = 360;

export const load: PageServerLoad = async ({ fetch }) => {
	const duration = TIMEFRAME_DURATION_MILLISECONDS[CANONICAL_STRATEGY_TIMEFRAME];
	const currentOpenTimestamp = Math.floor(Date.now() / duration) * duration;
	const endTimestamp = currentOpenTimestamp - duration;
	const startTimestamp = endTimestamp - (BOOTSTRAP_CANDLES - 1) * duration;

	try {
		const provider = new BinanceHistoricalMarketDataProvider({ fetch });
		const fetched = await provider.getCandles({
			symbol: PRIMARY_MARKET_SYMBOL,
			timeframe: CANONICAL_STRATEGY_TIMEFRAME,
			startTimestamp,
			endTimestamp
		});
		const oneMinuteCandles = prepareContinuousOneMinuteCandles(
			fetched.filter(({ closed }) => closed),
			{ startTimestamp, endTimestamp }
		);
		return {
			oneMinuteCandles,
			fiveMinuteCandles: aggregateOneMinuteCandlesToFiveMinutes(oneMinuteCandles).candles,
			bootstrapError: null
		};
	} catch {
		return {
			oneMinuteCandles: [],
			fiveMinuteCandles: [],
			bootstrapError:
				'Historical bootstrap is temporarily unavailable. Waiting for public realtime data.'
		};
	}
};
