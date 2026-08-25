# SMC Scalping Assistant — Audit Remediation Pack

Gunakan pack ini setelah milestone backtesting selesai dan sebelum memulai realtime implementation.

## Tujuan

1. Memperbaiki temuan audit P1/P2/P3.
2. Mengunci ambiguity SMC yang masih terbuka.
3. Menjadikan historical/backtest baseline yang stabil.
4. Memastikan realtime nanti menghasilkan state/event yang sama untuk market data yang sama.

## Stop Gate

Jangan lanjut realtime sampai `AUDIT-FIX-001` s.d. `AUDIT-FIX-009` selesai dan regression suite lulus.

## Urutan baca

1. `AUDIT_DECISIONS.md`
2. `REMEDIATION_ARCHITECTURE.md`
3. `REGRESSION_TEST_SPEC.md`
4. `CODEX_REMEDIATION_MASTER_PROMPT.md`
5. `audit-fixes/AUDIT-FIX-001.md` ... `009.md`
6. `FINAL_REAUDIT_PROMPT.md`

## Execution pattern

```text
Read docs/audit-remediation/CODEX_REMEDIATION_MASTER_PROMPT.md
and docs/audit-remediation/audit-fixes/AUDIT-FIX-001.md.

Inspect the repository.
Implement AUDIT-FIX-001 only.
Run typecheck, lint, and tests.
Do not implement later audit fixes.
```
