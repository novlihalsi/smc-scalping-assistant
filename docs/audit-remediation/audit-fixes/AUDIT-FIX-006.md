# AUDIT-FIX-006 — Eligibility vs Quality Scoring

## Required Reading

- `../AUDIT_DECISIONS.md`
- `../REMEDIATION_ARCHITECTURE.md`
- `../REGRESSION_TEST_SPEC.md`
- `../CODEX_REMEDIATION_MASTER_PROMPT.md`

## Implementation Checklist

- [ ] Create EligibilityResult.
- [ ] Move mandatory rules out of quality points.
- [ ] Create QualityScoreResult using decisions table.
- [ ] Centralize thresholds.
- [ ] Update analytics/models.

## Acceptance Criteria

- [ ] Eligible weak/valid/strong setups are all reachable.
- [ ] NO_TRADE is eligibility failure, not numeric bucket.

## Verification

Run typecheck/check, lint, and tests. Add focused regression tests reproducing the audited bug.

## Scope Guard

Implement AUDIT-FIX-006 only. Do not begin realtime tasks or later audit fixes.

## Completion Report

Report root cause, files changed, tests added, commands/results, assumptions, and remaining audit risks.
