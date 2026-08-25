# AUDIT-FIX-003 — Canonical Multi-Timeframe Ordering

## Required Reading
- `../AUDIT_DECISIONS.md`
- `../REMEDIATION_ARCHITECTURE.md`
- `../REGRESSION_TEST_SPEC.md`
- `../CODEX_REMEDIATION_MASTER_PROMPT.md`

## Implementation Checklist
- [ ] Introduce canonical 1m orchestration.
- [ ] Derive 5m from 1m.
- [ ] Process same-close 5m before 1m.
- [ ] Historical replay uses same path.
- [ ] Design for future WebSocket reuse.

## Acceptance Criteria
- [ ] Reversed raw delivery produces identical state/events/trades.
- [ ] Parity tests pass.

## Verification
Run typecheck/check, lint, and tests. Add focused regression tests reproducing the audited bug.

## Scope Guard
Implement AUDIT-FIX-003 only. Do not begin realtime tasks or later audit fixes.

## Completion Report
Report root cause, files changed, tests added, commands/results, assumptions, and remaining audit risks.
