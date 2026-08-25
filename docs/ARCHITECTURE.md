# Architecture Specification — Backtest First

## Core architectural requirement

Satu analysis pipeline harus dapat digunakan oleh:

1. historical replay;
2. realtime candle stream.

Canonical strategy API:

```text
processCanonicalMinute(state, closed1mCandle, config)
-> nextState + domainEvents
```

The strategy accepts only canonical closed 1m input. A UTC-aligned 5m candle is derived inside
that orchestration and processed before the same-close 1m candle. Native exchange 5m data is
diagnostic only and is not a strategy-state input.

Timeframe durations, canonical/bias timeframe identifiers, the primary research symbol, and
derived aggregation ratios are defined in `src/lib/domain/market/constants.ts`. Quality
classification boundaries are defined only by `QUALITY_SCORE_BANDS` in the scoring domain.

## Recommended modules

```text
src/lib/domain/
  market/
  smc/
  strategy/
  scoring/
  risk/
  backtest/

src/lib/services/
  exchange/
  historical/
  realtime/

src/lib/server/
  db/
  repositories/

src/lib/components/
  chart/
  setup/
  backtest/
```

## Development order

```text
Historical Provider
-> Candle utilities
-> SMC primitives
-> Strategy
-> Risk
-> Backtest
-> Analytics
-> Realtime Adapter
-> UI
```

## Dependency direction

```text
UI -> application/services -> domain
Infrastructure -> domain interfaces
```

Domain cannot import:

- Svelte;
- Drizzle;
- browser WebSocket;
- exchange SDK;
- SQLite.

## Research execution flow

```text
REST Historical Data
-> normalized Candle[]
-> chronological replay
-> domain events
-> setup state
-> trade simulation
-> metrics
```

## Live execution flow

```text
REST bootstrap + WebSocket updates
-> Candle State
-> same domain pipeline
-> setup output
-> chart/panel
```

## Exchange isolation

Market provider must be replaceable.

Interfaces:

```ts
interface HistoricalMarketDataProvider {
  getCandles(...): Promise<Candle[]>;
}

interface RealtimeMarketDataProvider {
  subscribe(...): Unsubscribe;
}
```

## Persistence

Repositories live outside domain.

Backtest run persistence and setup persistence should not change strategy behavior.

## Event model

Recommended events:

- SWING_CONFIRMED
- BOS_CONFIRMED
- CHOCH_CONFIRMED
- LIQUIDITY_CREATED
- LIQUIDITY_SWEPT
- DISPLACEMENT_DETECTED
- FVG_CREATED
- FVG_MITIGATED
- ORDER_BLOCK_CREATED
- ORDER_BLOCK_INVALIDATED
- STRATEGY_STATE_CHANGED
- SETUP_CREATED
- SETUP_INVALIDATED
