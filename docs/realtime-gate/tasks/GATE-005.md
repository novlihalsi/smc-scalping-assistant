# GATE-005 — Cost Stress & Formal Gate Cleanup

## Goal
Close one minimum blocker before realtime.

## Required Reading
- `../REALTIME_GATE.md`
- `../CODEX_MASTER_PROMPT.md`

## Checklist

- [ ] If both baseline fee/slippage are zero, use documented fallback.
- [ ] Otherwise double configured fee and slippage exactly.
- [ ] Complete blocker regression suite.
- [ ] Make declared lint pass, including Markdown formatting.
- [ ] Run typecheck/check.
- [ ] Run full tests.
- [ ] Update gate/remediation status only for completed items.

## Acceptance
- [ ] 2x cost scenario correct.
- [ ] All blocker regression tests pass.
- [ ] Typecheck passes.
- [ ] Declared lint passes.
- [ ] Full tests pass.
- [ ] No blocker in REALTIME_GATE.md remains.


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
