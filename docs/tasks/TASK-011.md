# TASK-011 — ATR Engine

## Objective

Implement TR and ATR.

## Dependencies

- TASK-004

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] True Range.
- [ ] ATR period from config.
- [ ] Document smoothing.
- [ ] Handle insufficient data.

## Acceptance Criteria

- [ ] Known fixture passes.
- [ ] No unsafe default before enough data.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-011 only.

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
