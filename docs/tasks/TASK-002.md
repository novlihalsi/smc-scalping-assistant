# TASK-002 — Core Domain Models

## Objective

Implement framework-independent domain types and strategy config.

## Dependencies

- TASK-001

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Implement all models in DATA_MODELS.md.
- [ ] Implement default config.
- [ ] Keep domain framework-independent.

## Acceptance Criteria

- [ ] No Svelte/Drizzle/network imports.
- [ ] Strict TS passes.
- [ ] Defaults match spec.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-002 only.

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
