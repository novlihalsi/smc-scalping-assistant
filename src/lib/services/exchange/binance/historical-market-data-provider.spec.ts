import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { HistoricalMarketDataProvider } from '../../historical/index.js';
import { BinanceHistoricalMarketDataProvider } from './historical-market-data-provider.js';

function kline(openTimestamp: number, closeTimestamp: number, close = '101.00'): unknown[] {
	return [
		openTimestamp,
		'100.00',
		'102.00',
		'99.00',
		close,
		'10.50',
		closeTimestamp,
		'0',
		0,
		'0',
		'0',
		'0'
	];
}

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function requestUrl(input: string | URL | Request): URL {
	return new URL(input instanceof Request ? input.url : String(input));
}

describe('BinanceHistoricalMarketDataProvider', () => {
	it('paginates, normalizes, deduplicates, and sorts 1m candles', async () => {
		const fetchMock = vi.fn<typeof fetch>();

		fetchMock.mockImplementation(async (input) => {
			const startTimestamp = Number(requestUrl(input).searchParams.get('startTime'));

			switch (startTimestamp) {
				case 0:
					return jsonResponse([kline(60_000, 119_999), kline(0, 59_999)]);
				case 120_000:
					return jsonResponse([
						kline(120_000, 179_999, '101.00'),
						kline(120_000, 179_999, '101.50')
					]);
				case 180_000:
					return jsonResponse([kline(180_000, 239_999)]);
				default:
					return jsonResponse([]);
			}
		});

		const provider = new BinanceHistoricalMarketDataProvider({
			fetch: fetchMock,
			now: () => 239_999,
			pageLimit: 2
		});

		expectTypeOf(provider).toMatchTypeOf<HistoricalMarketDataProvider>();

		const candles = await provider.getCandles({
			symbol: 'BTCUSDT',
			timeframe: '1m',
			startTimestamp: 0,
			endTimestamp: 180_000
		});

		expect(candles.map(({ openTimestamp }) => openTimestamp)).toEqual([
			0, 60_000, 120_000, 180_000
		]);
		expect(candles[2]).toMatchObject({
			symbol: 'BTCUSDT',
			timeframe: '1m',
			open: 100,
			high: 102,
			low: 99,
			close: 101.5,
			volume: 10.5,
			closed: true
		});
		expect(candles[3]?.closed).toBe(false);

		const urls = fetchMock.mock.calls.map(([input]) => requestUrl(input));
		expect(urls.map((url) => url.searchParams.get('startTime'))).toEqual(['0', '120000', '180000']);
		expect(urls[0]?.origin).toBe('https://data-api.binance.vision');
		expect(urls[0]?.pathname).toBe('/api/v3/klines');
		expect(urls[0]?.searchParams.get('symbol')).toBe('BTCUSDT');
		expect(urls[0]?.searchParams.get('interval')).toBe('1m');
		expect(urls[0]?.searchParams.get('endTime')).toBe('180000');
		expect(urls[0]?.searchParams.get('limit')).toBe('2');
	});

	it('supports normalized 5m candles', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([kline(0, 299_999)]));
		const provider = new BinanceHistoricalMarketDataProvider({
			fetch: fetchMock,
			now: () => 300_000
		});

		const candles = await provider.getCandles({
			symbol: 'BTCUSDT',
			timeframe: '5m',
			startTimestamp: 0,
			endTimestamp: 0
		});

		expect(candles).toEqual([
			{
				symbol: 'BTCUSDT',
				timeframe: '5m',
				openTimestamp: 0,
				closeTimestamp: 299_999,
				open: 100,
				high: 102,
				low: 99,
				close: 101,
				volume: 10.5,
				closed: true
			}
		]);
		expect(requestUrl(fetchMock.mock.calls[0]?.[0] ?? '').searchParams.get('interval')).toBe('5m');
	});

	it('rejects invalid ranges before making a network request', async () => {
		const fetchMock = vi.fn<typeof fetch>();
		const provider = new BinanceHistoricalMarketDataProvider({ fetch: fetchMock });

		await expect(
			provider.getCandles({
				symbol: 'BTCUSDT',
				timeframe: '1m',
				startTimestamp: 2,
				endTimestamp: 1
			})
		).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('wraps network and HTTP failures in explicit provider errors', async () => {
		const networkProvider = new BinanceHistoricalMarketDataProvider({
			fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
		});
		const httpProvider = new BinanceHistoricalMarketDataProvider({
			fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ code: -1003 }, 429))
		});
		const request = {
			symbol: 'BTCUSDT',
			timeframe: '1m',
			startTimestamp: 0,
			endTimestamp: 0
		} as const;

		await expect(networkProvider.getCandles(request)).rejects.toMatchObject({
			name: 'HistoricalMarketDataError',
			code: 'NETWORK_ERROR'
		});
		await expect(httpProvider.getCandles(request)).rejects.toMatchObject({
			name: 'HistoricalMarketDataError',
			code: 'HTTP_ERROR'
		});
	});

	it('rejects malformed exchange payloads without leaking raw rows', async () => {
		const invalidShapeProvider = new BinanceHistoricalMarketDataProvider({
			fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ candles: [] }))
		});
		const invalidRowProvider = new BinanceHistoricalMarketDataProvider({
			fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([kline(0, 59_999, 'NaN')]))
		});
		const request = {
			symbol: 'BTCUSDT',
			timeframe: '1m',
			startTimestamp: 0,
			endTimestamp: 0
		} as const;

		await expect(invalidShapeProvider.getCandles(request)).rejects.toMatchObject({
			code: 'INVALID_RESPONSE'
		});
		await expect(invalidRowProvider.getCandles(request)).rejects.toMatchObject({
			code: 'INVALID_RESPONSE'
		});
	});
});
