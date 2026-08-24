# Global Acceptance Checklist

## Core

- [ ] TypeScript strict passes
- [ ] lint passes
- [ ] tests pass
- [ ] no new `any`
- [ ] no Svelte/DB/network dependency in domain
- [ ] no duplicated realtime/backtest rule engine

## SMC

- [ ] swing respects rightBars confirmation
- [ ] BOS uses close
- [ ] CHoCH uses prior bias
- [ ] liquidity sweep is distinct from breakout
- [ ] FVG lifecycle tested
- [ ] OB causal rule tested
- [ ] strategy sequencing tested

## Backtest

- [ ] chronological replay
- [ ] no future candle
- [ ] conservative intrabar ambiguity
- [ ] metrics tested
- [ ] fee/slippage assumptions visible

## Live

- [ ] realtime consumes same engine
- [ ] chart only renders domain output
- [ ] connection state visible
- [ ] setup reasoning visible
