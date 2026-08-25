# AUDIT-FIX-005 — Backtest Boundary Handling

## Required Reading

- `../AUDIT_DECISIONS.md`
- `../REMEDIATION_ARCHITECTURE.md`
- `../REGRESSION_TEST_SPEC.md`
- `../CODEX_REMEDIATION_MASTER_PROMPT.md`

## Implementation Checklist

- [ ] Load configurable pre-roll.
- [ ] Warm ATR/structure/liquidity/HTF state.
- [ ] Exclude pre-roll trades from metrics.
- [ ] Expire pending at end.
- [ ] Censor open trades and report separately.

## Acceptance Criteria

- [ ] Pre-roll regression passes.
- [ ] Right-censored states visible and excluded from realized W/L.

## Verification

Run typecheck/check, lint, and tests. Add focused regression tests reproducing the audited bug.

## Scope Guard

Implement AUDIT-FIX-005 only. Do not begin realtime tasks or later audit fixes.

## Completion Report

Report root cause, files changed, tests added, commands/results, assumptions, and remaining audit risks.
