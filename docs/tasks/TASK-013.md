# TASK-013 — FVG Engine

## Objective

Implement FVG detection and mitigation lifecycle.

## Dependencies

- TASK-012

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Bullish/bearish 3-candle FVG.
- [ ] Zone/midpoint.
- [ ] Lifecycle states.
- [ ] Chronological mitigation.

## Acceptance Criteria

- [ ] Gap/no-gap tests.
- [ ] Mitigation tests.
- [ ] No future data.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-013 only.

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
