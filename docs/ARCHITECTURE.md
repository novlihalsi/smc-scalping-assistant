# Architecture Specification — Backtest First

## Core architectural requirement

Satu analysis pipeline harus dapat digunakan oleh:

1. historical replay;
2. realtime candle stream.

Ideal API shape:

```text
processClosedCandle(state, candle, config)
-> nextState + domainEvents
```

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
