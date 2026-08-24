# TASK-007 — BOS Engine

## Objective

Implement close-based BOS with duplicate level consumption prevention.

## Dependencies

- TASK-006

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Bullish and bearish BOS.
- [ ] Close-only rule.
- [ ] Relevant structural level.
- [ ] Prevent duplicate break events.

## Acceptance Criteria

- [ ] Wick-only rejected.
- [ ] Consumed level not repeatedly emitted.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-007 only.

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
