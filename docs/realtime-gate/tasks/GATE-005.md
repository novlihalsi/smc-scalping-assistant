# GATE-005 — Cost Stress & Formal Gate Cleanup

## Goal

Close one minimum blocker before realtime.

## Required Reading

- `../REALTIME_GATE.md`
- `../CODEX_MASTER_PROMPT.md`

## Checklist

- [x] If both baseline fee/slippage are zero, use documented fallback.
- [x] Otherwise double configured fee and slippage exactly.
- [x] Complete blocker regression suite.
- [x] Make declared lint pass, including Markdown formatting.
- [x] Run typecheck/check.
- [x] Run full tests.
- [x] Update gate/remediation status only for completed items.

## Acceptance

- [x] 2x cost scenario correct.
- [x] All blocker regression tests pass.
- [x] Typecheck passes.
- [x] Declared lint passes.
- [x] Full tests pass.
- [x] No blocker in REALTIME_GATE.md remains.

## Scope Guard

Implement GATE-005 only.
Do not start production realtime features.
Do not implement deferred analytics/features.

## Completion Report

Report:

1. blocker fixed;
2. root cause;
3. files changed;
4. tests added;
5. commands/results;
6. remaining realtime blockers.
