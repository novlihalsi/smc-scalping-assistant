# TASK-026 — Persistence, History & Journal Foundation

## Objective

Add SQLite/Drizzle repositories and setup history page.

## Dependencies

- TASK-025

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`
- `../BACKTESTING_SPEC.md`
- `../VALIDATION_PLAN.md`

## Implementation Checklist

- [ ] Configure SQLite + Drizzle.
- [ ] Repository interfaces.
- [ ] Persist strategy configs/setups/backtest metadata as appropriate.
- [ ] Create /history.
- [ ] Filters and detail.
- [ ] Store reasoning/invalidation.

## Acceptance Criteria

- [ ] Domain has no Drizzle imports.
- [ ] Migrations work.
- [ ] History survives restart.
- [ ] Past reasoning preserved.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-026 only.

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
