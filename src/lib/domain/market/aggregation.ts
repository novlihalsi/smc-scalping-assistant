import type { Candle } from './models.js';
import {
	assertValidCandle,
	getCandleIdentity,
	mergeCandleBatches,
	sortCandlesChronologically
} from './candle-utils.js';
import {
	CANONICAL_CANDLES_PER_BIAS_CANDLE,
	CANONICAL_STRATEGY_TIMEFRAME,
	DERIVED_BIAS_TIMEFRAME,
	TIMEFRAME_DURATION_MILLISECONDS
} from './constants.js';

export interface IncompleteFiveMinuteBucket {
	symbol: string;
	openTimestamp: number;
	presentOpenTimestamps: number[];
	missingOpenTimestamps: number[];
	unclosedOpenTimestamps: number[];
}

export interface FiveMinuteAggregationResult {
	candles: Candle[];
	incompleteBuckets: IncompleteFiveMinuteBucket[];
}

export class CandleAggregationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CandleAggregationError';
	}
}

export function aggregateOneMinuteCandlesToFiveMinutes(
	candles: readonly Candle[]
): FiveMinuteAggregationResult {
	for (const candle of candles) {
		assertValidCandle(candle);

		if (candle.timeframe !== CANONICAL_STRATEGY_TIMEFRAME) {
			throw new CandleAggregationError(
				`Expected only 1m source candles, received ${candle.timeframe} for ${getCandleIdentity(candle)}.`
			);
		}
	}

	const deduplicatedCandles = mergeCandleBatches(candles);
	const buckets = new Map<
		string,
		{ symbol: string; openTimestamp: number; candlesByOpenTimestamp: Map<number, Candle> }
	>();

	for (const candle of deduplicatedCandles) {
		const biasDuration = TIMEFRAME_DURATION_MILLISECONDS[DERIVED_BIAS_TIMEFRAME];
		const bucketOpenTimestamp = Math.floor(candle.openTimestamp / biasDuration) * biasDuration;
		const bucketIdentity = JSON.stringify([candle.symbol, bucketOpenTimestamp]);
		let bucket = buckets.get(bucketIdentity);

		if (!bucket) {
			bucket = {
				symbol: candle.symbol,
				openTimestamp: bucketOpenTimestamp,
				candlesByOpenTimestamp: new Map()
			};
			buckets.set(bucketIdentity, bucket);
		}

		bucket.candlesByOpenTimestamp.set(candle.openTimestamp, candle);
	}

	const aggregatedCandles: Candle[] = [];
	const incompleteBuckets: IncompleteFiveMinuteBucket[] = [];

	for (const bucket of buckets.values()) {
		const expectedOpenTimestamps = Array.from(
			{ length: CANONICAL_CANDLES_PER_BIAS_CANDLE },
			(_, index) =>
				bucket.openTimestamp + index * TIMEFRAME_DURATION_MILLISECONDS[CANONICAL_STRATEGY_TIMEFRAME]
		);
		const presentOpenTimestamps = expectedOpenTimestamps.filter((timestamp) =>
			bucket.candlesByOpenTimestamp.has(timestamp)
		);
		const missingOpenTimestamps = expectedOpenTimestamps.filter(
			(timestamp) => !bucket.candlesByOpenTimestamp.has(timestamp)
		);
		const unclosedOpenTimestamps = presentOpenTimestamps.filter(
			(timestamp) => !bucket.candlesByOpenTimestamp.get(timestamp)?.closed
		);

		if (missingOpenTimestamps.length > 0 || unclosedOpenTimestamps.length > 0) {
			incompleteBuckets.push({
				symbol: bucket.symbol,
				openTimestamp: bucket.openTimestamp,
				presentOpenTimestamps,
				missingOpenTimestamps,
				unclosedOpenTimestamps
			});
			continue;
		}

		const sourceCandles = expectedOpenTimestamps.map((timestamp) => {
			const candle = bucket.candlesByOpenTimestamp.get(timestamp);

			if (!candle) {
				throw new CandleAggregationError('Complete aggregation bucket lost a source candle.');
			}

			return candle;
		});
		const firstCandle = sourceCandles[0];
		const lastCandle = sourceCandles[sourceCandles.length - 1];

		if (!firstCandle || !lastCandle) {
			throw new CandleAggregationError('Complete aggregation bucket has no source candles.');
		}

		aggregatedCandles.push({
			symbol: bucket.symbol,
			timeframe: DERIVED_BIAS_TIMEFRAME,
			openTimestamp: bucket.openTimestamp,
			closeTimestamp:
				bucket.openTimestamp + TIMEFRAME_DURATION_MILLISECONDS[DERIVED_BIAS_TIMEFRAME] - 1,
			open: firstCandle.open,
			high: Math.max(...sourceCandles.map(({ high }) => high)),
			low: Math.min(...sourceCandles.map(({ low }) => low)),
			close: lastCandle.close,
			volume: sourceCandles.reduce((total, { volume }) => total + volume, 0),
			closed: true
		});
	}

	return {
		candles: sortCandlesChronologically(aggregatedCandles),
		incompleteBuckets: [...incompleteBuckets].sort(
			(left, right) =>
				left.openTimestamp - right.openTimestamp || left.symbol.localeCompare(right.symbol)
		)
	};
}
