# AUDIT-FIX-008 — Constants & Market-State Path Cleanup

## Required Reading
- `../AUDIT_DECISIONS.md`
- `../REMEDIATION_ARCHITECTURE.md`
- `../REGRESSION_TEST_SPEC.md`
- `../CODEX_REMEDIATION_MASTER_PROMPT.md`

## Implementation Checklist
- [ ] Centralize timeframe durations.
- [ ] Centralize score thresholds.
- [ ] Remove remaining native 5m strategy paths.
- [ ] Centralize shared market constants.

## Acceptance Criteria
- [ ] One timeframe source.
- [ ] One quality threshold source.
- [ ] One strategy 5m construction path.

## Verification
Run typecheck/check, lint, and tests. Add focused regression tests reproducing the audited bug.

## Scope Guard
Implement AUDIT-FIX-008 only. Do not begin realtime tasks or later audit fixes.

## Completion Report
Report root cause, files changed, tests added, commands/results, assumptions, and remaining audit risks.
