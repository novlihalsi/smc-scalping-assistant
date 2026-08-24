# TASK-012 — Displacement Engine

## Objective

Implement ATR-relative bullish/bearish displacement.

## Dependencies

- TASK-011

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Bullish/bearish displacement using body vs ATR multiplier.
- [ ] Return explicit event/value.
- [ ] Use config.

## Acceptance Criteria

- [ ] Threshold boundary tests.
- [ ] No magic 1.2 inside logic.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-012 only.

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
