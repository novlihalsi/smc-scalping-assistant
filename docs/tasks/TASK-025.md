# TASK-025 — Current Live Setup Panel

## Objective

Display bias, state, score, reasons, entry, SL, TP, RR, invalidation.

## Dependencies

- TASK-024

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`
- `../BACKTESTING_SPEC.md`
- `../VALIDATION_PLAN.md`

## Implementation Checklist

- [ ] Show symbol/bias/structure/state.
- [ ] Show score/classification.
- [ ] Show reasons.
- [ ] Show entry/SL/TP/RR.
- [ ] Show waiting conditions/invalidation.
- [ ] Use same realtime strategy engine.

## Acceptance Criteria

- [ ] User understands WHY setup exists.
- [ ] No SMC/scoring duplication in UI.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-025 only.

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
