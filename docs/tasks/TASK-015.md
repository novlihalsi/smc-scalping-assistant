# TASK-015 — Premium Discount Engine

## Objective

Implement dealing range and premium/discount confluence.

## Dependencies

- TASK-014

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Define deterministic dealing range.
- [ ] Calculate equilibrium.
- [ ] Return PREMIUM/DISCOUNT/EQUILIBRIUM.
- [ ] Expose range source.

## Acceptance Criteria

- [ ] Midpoint/range updates tested.
- [ ] Assumption documented.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-015 only.

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
