# TASK-023 — Realtime Candle State & Aggregation

## Objective

Merge REST bootstrap + WS updates; maintain 1m and 5m realtime candles.

## Dependencies

- TASK-022
- TASK-004

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`
- `../BACKTESTING_SPEC.md`
- `../VALIDATION_PLAN.md`

## Implementation Checklist

- [ ] Bootstrap from REST historical.
- [ ] Merge realtime updates.
- [ ] Update current candle.
- [ ] Close candles correctly.
- [ ] 1m->5m realtime aggregation.
- [ ] Avoid duplicates.

## Acceptance Criteria

- [ ] REST+WS transition clean.
- [ ] 5m aggregation correct.
- [ ] Same Candle model as backtest.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-023 only.

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
