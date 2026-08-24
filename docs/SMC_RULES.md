# Deterministic SMC Rules

Dokumen ini adalah source of truth untuk rule trading.

## Swing

Default:

```text
leftBars = 2
rightBars = 2
```

Swing High pada `i`:

```text
high[i] > high[i-1]
high[i] > high[i-2]
high[i] > high[i+1]
high[i] > high[i+2]
```

Swing Low mirror.

Swing hanya known setelah `i + rightBars`.

## Structure

- HH = current swing high > previous swing high
- LH = current swing high < previous swing high
- HL = current swing low > previous swing low
- LL = current swing low < previous swing low

Equal prices dialihkan ke liquidity logic.

## BOS

Bullish BOS:

- prior bias bullish;
- candle close > relevant swing high.

Bearish mirror.

Wick-only bukan BOS.

## CHoCH

Bullish CHoCH:

- prior bias bearish;
- close > relevant LH.

Bearish CHoCH:

- prior bias bullish;
- close < relevant HL.

## Liquidity

Sources:

- Swing High -> BUY_SIDE
- Swing Low -> SELL_SIDE
- Equal High -> BUY_SIDE
- Equal Low -> SELL_SIDE

Default equal-level tolerance:

`0.1%`

## Sweep

Buy-side:

```text
high > liquidity.price
AND
close < liquidity.price
```

Sell-side:

```text
low < liquidity.price
AND
close > liquidity.price
```

Close beyond level adalah breakout, bukan sweep.

## ATR

Period 14.

True Range:

```text
max(
  high-low,
  abs(high-previousClose),
  abs(low-previousClose)
)
```

Smoothing method harus konsisten dan dikunci test.

## Displacement

Bullish:

```text
close > open
AND
abs(close-open) > ATR * multiplier
```

Bearish mirror.

Default multiplier: `1.2`.

## FVG

Bullish:

```text
c3.low > c1.high
```

Zone:

```text
bottom = c1.high
top = c3.low
```

Bearish:

```text
c3.high < c1.low
```

State:

- UNTOUCHED
- PARTIALLY_FILLED
- FILLED

## Order Block

Bullish OB:

- bullish displacement;
- displacement menyebabkan/berkontribusi pada BOS atau CHoCH;
- bearish candle terakhir sebelum displacement sequence.

Bearish mirror.

V1 zone = full candle high-low.

Invalidation:

- bullish: close < OB low
- bearish: close > OB high

## Premium / Discount

```text
equilibrium = (rangeHigh + rangeLow) / 2
```

- below -> DISCOUNT
- above -> PREMIUM
- midpoint -> EQUILIBRIUM

## Entry Zone Priority

1. FVG ∩ OB jika overlap valid.
2. FVG.
3. V1 tidak membuat setup dari OB-only.

## Long Sequence

```text
5m bullish bias
-> sell-side sweep 1m
-> bullish CHoCH 1m
-> bullish displacement
-> bullish FVG
-> retracement
```

Short mirror.

## No Lookahead

Pada waktu `t`, hanya event yang sudah confirmed pada atau sebelum `t` boleh tersedia.

Realtime dan backtest harus menghasilkan event sequence yang sama untuk sequence closed candles yang sama.
