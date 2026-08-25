# AUDIT-FIX-004 — Historical Continuity & Canonical Aggregation

## Required Reading

- `../AUDIT_DECISIONS.md`
- `../REMEDIATION_ARCHITECTURE.md`
- `../REGRESSION_TEST_SPEC.md`
- `../CODEX_REMEDIATION_MASTER_PROMPT.md`

## Implementation Checklist

- [ ] Validate 1m continuity.
- [ ] Reject duplicates/gaps explicitly.
- [ ] Eliminate native 5m as strategy state path.
- [ ] Use canonical 1m->5m aggregation.

## Acceptance Criteria

- [ ] Missing minute fails explicitly.
- [ ] Historical 5m matches canonical aggregator.

## Verification

Run typecheck/check, lint, and tests. Add focused regression tests reproducing the audited bug.

## Scope Guard

Implement AUDIT-FIX-004 only. Do not begin realtime tasks or later audit fixes.

## Completion Report

Report root cause, files changed, tests added, commands/results, assumptions, and remaining audit risks.
