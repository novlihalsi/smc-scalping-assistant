# GATE-001 — Protected Structure & Dealing Range

## Goal
Close one minimum blocker before realtime.

## Required Reading
- `../REALTIME_GATE.md`
- `../CODEX_MASTER_PROMPT.md`

## Checklist

- [ ] Add explicit protected high/low swing IDs/state.
- [ ] Establish protected HL/LH from causal BOS context.
- [ ] Store protected dependency in pending setup.
- [ ] Invalidate LONG on close below protected low.
- [ ] Invalidate SHORT on close above protected high.
- [ ] Bullish dealing range = protected low -> relevant expansion high.
- [ ] Bearish dealing range = protected high -> relevant expansion low.
- [ ] Add regression tests.

## Acceptance
- [ ] Protected swing is not merely latest swing.
- [ ] Pending invalidation works.
- [ ] Premium/discount uses protected structure.
- [ ] Typecheck/lint/tests pass.


## Scope Guard
Implement GATE-001 only.
Do not start production realtime features.
Do not implement deferred analytics/features.

## Completion Report
Report:
1. blocker fixed;
2. root cause;
3. files changed;
4. tests added;
5. commands/results;
6. remaining realtime blockers.
