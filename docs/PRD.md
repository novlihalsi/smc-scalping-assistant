# Product Requirements Document — SMC Scalping Assistant

## 1. Product Overview

SMC Scalping Assistant adalah aplikasi analisis trading untuk scalping crypto berbasis Smart Money Concept (SMC) yang deterministic dan explainable.

Produk dibangun dengan pendekatan **backtest-first**:

1. definisikan rule;
2. implementasikan engine;
3. replay historical market;
4. ukur statistical edge;
5. baru aktifkan realtime scanner dan chart.

MVP tidak melakukan automatic trade execution.

## 2. Primary Goals

### Phase A — Research & Validation

- Historical BTCUSDT data.
- SMC detection engine.
- Strategy state machine.
- Setup scoring.
- Risk engine.
- Backtesting tanpa lookahead bias.
- Backtest analytics.
- Strategy validation report.

### Phase B — Live Assistant

- Realtime public market feed.
- 1m + 5m candle state.
- Trading chart.
- SMC overlays.
- Current setup panel.
- Live signal state.
- History / journal foundation.

## 3. Initial Market

- Asset: Crypto
- Symbol: BTCUSDT
- Bias timeframe: 5m
- Entry timeframe: 1m

## 4. SMC Scalping V1

### LONG

```text
5m bullish bias
-> 1m sell-side liquidity sweep
-> bullish CHoCH
-> bullish displacement
-> bullish FVG
-> retracement to entry zone
-> valid RR
```

Optional confluence:

- bullish Order Block;
- discount zone.

### SHORT

Mirror dari LONG.

## 5. Eligibility and Quality Score

Mandatory eligibility is evaluated before scoring: aligned HTF bias, liquidity sweep, CHoCH,
displacement, causal FVG, valid entry geometry, and RR at or above the configured minimum. A
failure produces no setup; `NO_TRADE` is not a numeric classification.

| Quality dimension        |   Score |
| ------------------------ | ------: |
| Order Block overlap      |      25 |
| Premium / Discount       |      20 |
| Sweep quality            |      15 |
| Displacement strength    |      15 |
| FVG quality              |      10 |
| Target quality           |      10 |
| Reserved / session-ready |       5 |
| **Total**                | **100** |

Eligible setup classification:

- 0–59 `WEAK`
- 60–79 `VALID`
- 80–100 `STRONG`

## 6. Risk Rules

Default:

- minimum RR: 1.5
- ATR period: 14
- displacement multiplier: 1.2
- SL ATR buffer: 0.1

LONG SL:

```text
sweepLow - ATR * buffer
```

SHORT SL:

```text
sweepHigh + ATR * buffer
```

Primary TP:

- LONG -> nearest active buy-side liquidity
- SHORT -> nearest active sell-side liquidity

Fallback: 2R.

## 7. Backtest-First Development Principle

Realtime UI bukan milestone validasi strategi.

Urutan product development:

```text
DEFINE
-> DETECT
-> REPLAY
-> MEASURE
-> VALIDATE
-> VISUALIZE LIVE
```

Bukan:

```text
DEFINE
-> BUILD LIVE CHART
-> ASSUME STRATEGY WORKS
```

## 8. Validation Gate

Sebelum menganggap strategy ready untuk live assistant:

Minimum target sample:

- 500 trades minimum useful sample;
- 1,000+ preferred.

Measure:

- Win Rate
- Profit Factor
- Expectancy R
- Average R
- Total R
- Maximum Drawdown
- Maximum Consecutive Losses
- LONG vs SHORT
- score buckets
- hour/session
- regime/time period robustness

Tidak ada hard requirement bahwa strategy harus profitable pada backtest pertama. Hasil negatif tetap valid sebagai research output.

## 9. Application Pages

### `/backtest`

Page pertama yang benar-benar penting:

- date range;
- config;
- run backtest;
- metrics;
- equity curve;
- breakdown;
- trade list.

### `/`

Setelah realtime phase:

- candlestick chart;
- current market bias;
- current setup;
- score;
- reasons;
- entry / SL / TP / RR;
- connection state.

### `/history`

Historical signals/trades.

### `/settings`

Strategy config.

## 10. Live Assistant Usage

Saat live:

```text
Market Data
-> deterministic engine
-> current strategy state
-> setup score
-> risk parameters
-> user evaluates
-> manual execution outside application
```

Aplikasi tidak membutuhkan Binance trading API key untuk MVP.

## 11. Non-Goals

- auto execution;
- leverage automation;
- private key/seed phrase;
- AI price prediction;
- martingale;
- grid;
- copy trading;
- portfolio management.

## 12. Definition of Done

Research MVP selesai pada Task 021 jika:

- historical data tersedia;
- SMC core tested;
- strategy/risk engine tested;
- backtester chronological;
- no lookahead;
- analytics lengkap;
- validation report dapat dibuat.

Live MVP selesai setelah Task 026 jika:

- realtime feed stabil;
- chart berjalan;
- overlays tersedia;
- live setup panel tersedia;
- setup/history dapat disimpan.

## 13. Product Principle

**Explainability > Prediction**

AI/LLM dapat dipakai kelak untuk journal summary dan pattern analysis, tetapi bukan BUY/SELL decision engine.
