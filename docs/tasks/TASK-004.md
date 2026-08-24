# TASK-004 — Historical Candle Store & Utilities

## Objective

Deduplicate, merge, sort, validate, and aggregate historical candles including 1m -> 5m.

## Dependencies

- TASK-003

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Implement candle identity.
- [ ] Deduplicate/merge historical batches.
- [ ] Implement validation.
- [ ] Implement 1m->5m aggregation.
- [ ] Handle missing/partial buckets explicitly.

## Acceptance Criteria

- [ ] Aggregation fixtures correct.
- [ ] No duplicates.
- [ ] Chronological ordering guaranteed.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-004 only.

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
