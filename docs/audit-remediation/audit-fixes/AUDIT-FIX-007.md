# AUDIT-FIX-007 — Validation Plan Implementation

## Required Reading
- `../AUDIT_DECISIONS.md`
- `../REMEDIATION_ARCHITECTURE.md`
- `../REGRESSION_TEST_SPEC.md`
- `../CODEX_REMEDIATION_MASTER_PROMPT.md`

## Implementation Checklist
- [ ] Add IS/OOS split.
- [ ] Add month/period robustness.
- [ ] Add LONG/SHORT and score buckets.
- [ ] Add time-of-day analysis.
- [ ] Add fee/slippage sensitivity.
- [ ] Add config hash/provenance.
- [ ] Add outlier concentration analysis.

## Acceptance Criteria
- [ ] Validation report has explicit OOS evidence.
- [ ] Cost sensitivity and provenance visible.

## Verification
Run typecheck/check, lint, and tests. Add focused regression tests reproducing the audited bug.

## Scope Guard
Implement AUDIT-FIX-007 only. Do not begin realtime tasks or later audit fixes.

## Completion Report
Report root cause, files changed, tests added, commands/results, assumptions, and remaining audit risks.
