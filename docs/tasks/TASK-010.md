# TASK-010 — Liquidity Sweep Engine

## Objective

Implement sweep detection vs touch/breakout.

## Dependencies

- TASK-009

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Buy-side sweep rule.
- [ ] Sell-side sweep rule.
- [ ] Track extreme/close.
- [ ] Mark swept once.
- [ ] Differentiate touch/breakout.

## Acceptance Criteria

- [ ] Sweep/touch/breakout fixtures pass.
- [ ] Repeated sweep prevented.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-010 only.

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
