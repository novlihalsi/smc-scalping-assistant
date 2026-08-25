# AUDIT-FIX-002 — Pending Setup Lifecycle & Expiry

## Required Reading

- `../AUDIT_DECISIONS.md`
- `../REMEDIATION_ARCHITECTURE.md`
- `../REGRESSION_TEST_SPEC.md`
- `../CODEX_REMEDIATION_MASTER_PROMPT.md`

## Implementation Checklist

- [ ] Keep emitted valid setup active until trigger/invalidation/expiry.
- [ ] Track dependency IDs.
- [ ] Invalidate on bias reversal/FVG invalidation/required OB invalidation.
- [ ] Add maxPendingEntryBars=10 config.
- [ ] Prevent late zombie fills.

## Acceptance Criteria

- [ ] Bias/FVG/OB/expiry tests pass.
- [ ] Backtester can receive real invalidation events.

## Verification

Run typecheck/check, lint, and tests. Add focused regression tests reproducing the audited bug.

## Scope Guard

Implement AUDIT-FIX-002 only. Do not begin realtime tasks or later audit fixes.

## Completion Report

Report root cause, files changed, tests added, commands/results, assumptions, and remaining audit risks.
