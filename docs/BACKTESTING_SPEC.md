# Backtesting Specification

## Objective

Validate strategy behavior before building a polished realtime assistant.

## Chronological replay

For each closed candle:

```text
append candle
-> confirm swing if eligible
-> update structure
-> BOS / CHoCH
-> liquidity / sweep
-> ATR / displacement
-> FVG
-> Order Block
-> premium / discount
-> strategy state
-> scoring
-> risk
-> trade simulation
```

## No lookahead

`rightBars=2` means swing at index i appears only after index i+2 is available.

## Same engine requirement

Backtest and realtime must reuse the same domain pipeline.

No separate "simplified backtest strategy".

## Intrabar ambiguity

If entry, TP and SL ordering cannot be determined from OHLC:

- use conservative outcome;
- record ambiguity if model supports it.

Never assume TP wins the ambiguity.

## Fees & slippage

Baseline may be zero, but architecture must allow future:

- fee bps;
- slippage bps.

Report must state assumptions.

## Metrics

- total trades;
- wins/losses;
- win rate;
- profit factor;
- expectancy R;
- avg R;
- total R;
- max drawdown;
- max consecutive wins/losses;
- avg RR;
- avg trade duration.

## Breakdowns

- LONG vs SHORT;
- score bands;
- hour;
- day;
- session-ready bucket.

## Equity curve

Use cumulative closed-trade R.

## Sample guidance

- minimum useful: 500 trades;
- preferred: 1,000+;
- multiple market periods/regimes.

## Optimization discipline

Do not optimize 10 parameters simultaneously.

Test one change at a time:

- baseline;
- - OB confluence;
- - premium/discount;
- - session;
- - volume.

Compare expectancy and drawdown, not win rate only.
