# TASK-018 — Risk Engine

## Objective

Implement entry zone, SL, TP, RR, position size.

## Dependencies

- TASK-017

## Required Reading

- `../PRD.md`
- `../SMC_RULES.md`
- `../ARCHITECTURE.md`
- `../DATA_MODELS.md`
- `../CODING_GUIDELINES.md`

## Implementation Checklist

- [ ] Entry zone FVG∩OB else FVG.
- [ ] SL ATR buffer from sweep.
- [ ] Nearest opposite liquidity TP.
- [ ] 2R fallback.
- [ ] RR.
- [ ] Position sizing.
- [ ] Enforce min RR.

## Acceptance Criteria

- [ ] Long/short tests.
- [ ] Invalid geometry fails explicitly.
- [ ] RR threshold enforced.

## Verification

Run repository-equivalent commands for:

```text
typecheck / svelte-check
lint
unit tests
```

## Scope Guard

Implement TASK-018 only.

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
