# Final Re-audit Prompt

Use in a fresh Codex session after AUDIT-FIX-001 through 009.

```text
Perform an independent pre-realtime audit. Do not change files.

Read the product docs and all docs/audit-remediation source-of-truth files.

Audit:
1. FVG lifecycle/stale references.
2. Pending setup lifecycle/invalidation/expiry.
3. Canonical 1m -> derived 5m construction.
4. Same-close MTF ordering.
5. Historical continuity/data-gap handling.
6. Pre-roll/end-range censoring.
7. Eligibility vs quality semantics.
8. Validation plan including OOS/cost sensitivity.
9. Duplicate constants/alternate state paths.
10. Historical replay vs realtime-style parity.
11. Direct/indirect lookahead bias.
12. Unresolved SMC assumptions.

Return findings P0/P1/P2/P3 with file/line references and fix direction.
Then provide lookahead assessment, parity assessment, validation-readiness assessment, and final GO/NO-GO for realtime.
```
