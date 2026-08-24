# TASK-016 — SMC Strategy State Machine

## Objective

Implement long/short sequence and invalidation state machine.

## Dependencies

- TASK-015
- TASK-010
- TASK-012
- TASK-013

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Implement all strategy states.
- [ ] 5m bias + 1m sequence.
- [ ] Long and short.
- [ ] Reset/invalidation rules.
- [ ] Emit transition events.

## Acceptance Criteria

- [ ] Correct ordered sequence reaches ready.
- [ ] Out-of-order does not.
- [ ] Invalidation tested.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-016 only.

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
