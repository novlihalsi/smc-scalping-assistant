# TASK-003 — Historical Market Data Provider

## Objective

Implement public historical BTCUSDT 1m/5m data provider and normalization.

## Dependencies

- TASK-002

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Define HistoricalMarketDataProvider.
- [ ] Implement public REST adapter.
- [ ] Support BTCUSDT 1m/5m.
- [ ] Normalize Candle.
- [ ] Sort ascending.
- [ ] Deduplicate.
- [ ] Explicit error handling.

## Acceptance Criteria

- [ ] Can fetch historical range.
- [ ] Provider types do not leak.
- [ ] Normalization tests pass.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-003 only.

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
