# TASK-020 — Backtest Analytics

## Objective

Implement metrics, equity curve data, score/hour/direction breakdowns.

## Dependencies

- TASK-019

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`
- `../BACKTESTING_SPEC.md`
- `../VALIDATION_PLAN.md`

## Implementation Checklist

- [ ] Metrics: trade count, win rate, PF, expectancy, avg/total R, max DD, streaks, avg RR, duration.
- [ ] Cumulative R curve.
- [ ] Breakdowns direction/score/hour/day.

## Acceptance Criteria

- [ ] Metric fixtures pass.
- [ ] Drawdown tested.
- [ ] PF zero-loss handled explicitly.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-020 only.

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
