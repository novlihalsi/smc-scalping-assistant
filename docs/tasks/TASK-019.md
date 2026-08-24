# TASK-019 — Backtesting Engine

## Objective

Chronologically replay historical candles through the same domain engine.

## Dependencies

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

- [ ] Replay candles chronologically.
- [ ] Reuse domain pipeline.
- [ ] Respect rightBars.
- [ ] Simulate pending/open trades.
- [ ] Conservative ambiguous intrabar handling.
- [ ] Fee/slippage extension config.

## Acceptance Criteria

- [ ] Lookahead trap test.
- [ ] Deterministic results.
- [ ] No second strategy engine.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-019 only.

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
