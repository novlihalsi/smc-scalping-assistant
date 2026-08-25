# Codex Master Prompt — Realtime Gate

Read:

- `docs/realtime-gate/REALTIME_GATE.md`
- requested `docs/realtime-gate/tasks/GATE-XXX.md`
- existing SMC/backtest source-of-truth docs.

Implement only the requested gate task.

Priority:

- correctness;
- deterministic behavior;
- historical/realtime parity;
- minimal robust fix.

Do not add:

- production realtime features yet;
- auto trading;
- unrelated validation/UI improvements;
- unrelated refactors.

For each gate:

1. inspect repo;
2. reproduce issue with tests where practical;
3. implement smallest robust fix;
4. run typecheck/check;
5. run declared lint;
6. run full tests;
7. report remaining realtime blockers.
