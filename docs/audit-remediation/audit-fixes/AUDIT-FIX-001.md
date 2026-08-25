# AUDIT-FIX-001 — Canonical FVG Lifecycle

## Required Reading

- `../AUDIT_DECISIONS.md`
- `../REMEDIATION_ARCHITECTURE.md`
- `../REGRESSION_TEST_SPEC.md`
- `../CODEX_REMEDIATION_MASTER_PROMPT.md`

## Implementation Checklist

- [ ] Replace stale FVG snapshot dependencies with canonical state/reference.
- [ ] Ensure FILLED FVG is ineligible for new setup.
- [ ] Ensure retracement/risk use current FVG state.
- [ ] Preserve FVG provenance id.

## Acceptance Criteria

- [ ] Filled FVG cannot create future setup.
- [ ] Canonical state regression tests pass.

## Verification

Run typecheck/check, lint, and tests. Add focused regression tests reproducing the audited bug.

## Scope Guard

Implement AUDIT-FIX-001 only. Do not begin realtime tasks or later audit fixes.

## Completion Report

Report root cause, files changed, tests added, commands/results, assumptions, and remaining audit risks.
