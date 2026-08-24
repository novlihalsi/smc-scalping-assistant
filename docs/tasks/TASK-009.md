# TASK-009 — Liquidity Detection

## Objective

Implement swing/equal high-low liquidity levels.

## Dependencies

- TASK-008

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Liquidity from swing highs/lows.
- [ ] Equal High/Low clustering.
- [ ] Configurable tolerance.
- [ ] Track active/swept state.

## Acceptance Criteria

- [ ] Tolerance tested.
- [ ] No duplicate cluster spam.
- [ ] Confirmed swing only.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-009 only.

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
