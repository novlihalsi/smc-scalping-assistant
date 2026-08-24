# TASK-024 — Trading Chart & SMC Overlays

## Objective

Build chart with candlesticks and toggleable domain overlays.

## Dependencies

- TASK-023
- TASK-018

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`
- `../BACKTESTING_SPEC.md`
- `../VALIDATION_PLAN.md`

## Implementation Checklist

- [ ] Integrate TradingView Lightweight Charts.
- [ ] Historical + realtime candles.
- [ ] 1m/5m switch.
- [ ] Render swings, structure, BOS, CHoCH, liquidity, sweep, FVG, OB, entry/SL/TP.
- [ ] Overlay toggles.

## Acceptance Criteria

- [ ] No business logic in UI.
- [ ] Overlays align with timestamps.
- [ ] No duplicate candles.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-024 only.

Do not opportunistically implement later realtime/UI tasks.

Do not add live trading execution or trading credentials.

## Completion Report

Report:

1. files changed;
2. behavior implemented;
3. tests added;
4. commands/results;
5. assumptions;
6. unresolved ambiguities;
7. lookahead-bias review.
