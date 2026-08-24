# TASK-021 — Backtest Dashboard & Validation Report

## Objective

Build /backtest page and make research results inspectable.

## Dependencies

- TASK-020

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`
- `../BACKTESTING_SPEC.md`
- `../VALIDATION_PLAN.md`

## Implementation Checklist

- [ ] Create /backtest.
- [ ] Date range and config inputs.
- [ ] Run backtest.
- [ ] Render key metrics.
- [ ] Equity curve.
- [ ] Breakdowns.
- [ ] Inspectable trade list.
- [ ] Show fee/slippage assumptions.
- [ ] Generate validation summary.

## Acceptance Criteria

- [ ] User can evaluate expectancy/drawdown.
- [ ] Every trade inspectable.
- [ ] Works before realtime features exist.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-021 only.

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
