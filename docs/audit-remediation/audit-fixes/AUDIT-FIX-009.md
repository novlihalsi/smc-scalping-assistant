# AUDIT-FIX-009 — End-to-End Parity & Regression Gate

## Required Reading

- `../AUDIT_DECISIONS.md`
- `../REMEDIATION_ARCHITECTURE.md`
- `../REGRESSION_TEST_SPEC.md`
- `../CODEX_REMEDIATION_MASTER_PROMPT.md`

## Implementation Checklist

- [ ] Implement remaining regression spec tests.
- [ ] Add LONG/SHORT E2E fixtures.
- [ ] Add FVG invalidation, expiry, bias invalidation, data-gap fixtures.
- [ ] Add historical-vs-realtime-style parity harness.
- [ ] Run full suite.

## Acceptance Criteria

- [ ] All remediation tests pass.
- [ ] No unresolved P1 remains.
- [ ] Ready for independent re-audit before realtime.

## Verification

Run typecheck/check, lint, and tests. Add focused regression tests reproducing the audited bug.

## Scope Guard

Implement AUDIT-FIX-009 only. Do not begin realtime tasks or later audit fixes.

## Completion Report

Report root cause, files changed, tests added, commands/results, assumptions, and remaining audit risks.
