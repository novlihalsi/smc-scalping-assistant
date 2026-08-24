# TASK-022 — Realtime WebSocket Market Feed

## Objective

Implement public realtime BTCUSDT feed with reconnect/stale handling.

## Dependencies

- TASK-021

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`
- `../BACKTESTING_SPEC.md`
- `../VALIDATION_PLAN.md`

## Implementation Checklist

- [ ] Public BTCUSDT WebSocket.
- [ ] Connection states.
- [ ] Reconnect.
- [ ] Stale detection.
- [ ] Cleanup.
- [ ] No trading auth.

## Acceptance Criteria

- [ ] Realtime events received.
- [ ] Reconnect isolated/testable.
- [ ] Public data only.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-022 only.

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
