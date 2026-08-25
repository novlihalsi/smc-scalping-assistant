# Realtime Gate

## MUST FIX BEFORE REALTIME

### 1. Protected Structure
- Explicit protected HL/LH.
- Setup stores protected-structure dependency.
- Pending setup invalidates on protected structure breach.
- Premium/discount uses protected swing + expansion extreme.

### 2. Causal FVG / OB Provenance
- FVG linked to active displacement/sequence.
- OB linked to causal structure break/displacement.
- Setup only consumes FVG/OB from active causal sequence.
- Unrelated same-direction zones cannot hijack setup.

### 3. Real Historical vs Realtime Parity
Create distinct realtime ingestion adapter that models:
- REST bootstrap;
- WS open-candle updates;
- candle finalization;
- duplicates;
- out-of-order arrival;
- same-close ordering;
- 1m -> derived 5m.

Compare against historical replay:
- domain events;
- setup lifecycle;
- final state;
- trades.

### 4. Remove Stale / Zombie State Paths
- Remove/internalize stale public FVG snapshot route.
- Prefer IDs + canonical lookup.
- Terminalize pending/open EOR states.
- Expired/invalid/EOR setups cannot trigger later.

### 5. Backtest Consistency / Formal Gate
- Fix 2x cost stress.
- Complete blocker regression tests.
- Declared lint command must pass.
- Typecheck and full tests must pass.

## CAN DEFER AFTER MVP
- perfect quality-score formulas;
- session-ready scoring;
- volatility-regime dashboard;
- walk-forward/nested validation UI;
- advanced outlier analytics;
- zero-signal-month UX polish;
- AI journal;
- multi-pair scanner;
- alerts;
- auto trading;
- cosmetic refactors.

## GO criteria
- [ ] Protected structure correct
- [ ] Causal FVG/OB provenance correct
- [ ] Real ingestion parity passes
- [ ] No stale public lifecycle path
- [ ] No zombie EOR setup state
- [ ] Cost stress correct
- [ ] Full regression suite passes
- [ ] Typecheck passes
- [ ] Declared lint passes
