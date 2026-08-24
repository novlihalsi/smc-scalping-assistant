# TASK-005 — Swing Engine

## Objective

Implement confirmed Swing High/Low with rightBars timing.

## Dependencies

- TASK-004

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Implement confirmed swing high/low.
- [ ] Configurable leftBars/rightBars.
- [ ] Record source and confirmation timestamps.
- [ ] Strict comparisons.

## Acceptance Criteria

- [ ] No swing exposed before confirmation.
- [ ] Positive/negative/equal/insufficient tests.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-005 only.

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
