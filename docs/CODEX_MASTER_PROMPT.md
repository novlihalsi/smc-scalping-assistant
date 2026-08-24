# Codex Master Instruction — Backtest First

Read:

- `docs/PRD.md`
- `docs/SMC_RULES.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODELS.md`
- `docs/BACKTESTING_SPEC.md`
- `docs/VALIDATION_PLAN.md`
- `docs/CODING_GUIDELINES.md`
- requested `docs/tasks/TASK-XXX.md`

## Important product priority

This project is **backtest-first**.

Do not prioritize realtime UI before the historical strategy pipeline, backtester, and analytics are complete.

## Constraints

- SvelteKit
- TypeScript strict
- Vitest
- deterministic SMC logic
- no lookahead bias
- shared realtime/backtest engine
- no auto trading
- public market data only
- no secret/private-key handling

## Task protocol

1. inspect repo;
2. check dependencies;
3. plan;
4. implement requested task only;
5. tests;
6. typecheck;
7. lint;
8. review for lookahead/cross-layer issues;
9. report changed files, commands, assumptions.

Do not proceed to the next task.
