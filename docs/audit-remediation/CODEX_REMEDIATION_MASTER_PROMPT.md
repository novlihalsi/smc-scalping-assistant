# Codex Remediation Master Prompt

Read:
- `docs/audit-remediation/AUDIT_DECISIONS.md`
- `docs/audit-remediation/REMEDIATION_ARCHITECTURE.md`
- `docs/audit-remediation/REGRESSION_TEST_SPEC.md`
- existing PRD/SMC/BACKTESTING/VALIDATION docs
- requested `AUDIT-FIX-XXX.md`

Priority: correctness, deterministic behavior, and historical/realtime parity.

Rules:
- one audit fix at a time;
- no realtime feature implementation yet;
- no live trading;
- no future-candle reads;
- add regression tests;
- prefer canonical IDs/state over stale snapshots;
- canonical research path is 1m -> derived 5m.

Run typecheck/check, lint, tests.
Report files changed, finding addressed, before/after behavior, tests, API impact, assumptions, remaining risks.
Do not implement next audit fix.
