# TASK-008 — CHoCH Engine

## Objective

Implement bias-aware CHoCH distinct from BOS.

## Dependencies

- TASK-007

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Bullish/bearish CHoCH.
- [ ] Require prior opposite bias.
- [ ] Separate CHoCH from BOS.
- [ ] Update bias intentionally.

## Acceptance Criteria

- [ ] BOS-vs-CHoCH fixtures pass.
- [ ] No wick-only event.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-008 only.

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
