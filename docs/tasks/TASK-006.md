# TASK-006 — Market Structure Engine

## Objective

Implement HH/HL/LH/LL and market bias state.

## Dependencies

- TASK-005

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Classify HH/LH/HL/LL.
- [ ] Build structure sequence.
- [ ] Maintain MarketBias state.
- [ ] Handle initial neutral state.

## Acceptance Criteria

- [ ] Bullish/bearish/mixed fixtures correct.
- [ ] Confirmed swings only.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-006 only.

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
