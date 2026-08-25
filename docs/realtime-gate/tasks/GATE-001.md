# GATE-001 — Protected Structure & Dealing Range

## Goal

Close one minimum blocker before realtime.

## Required Reading

- `../REALTIME_GATE.md`
- `../CODEX_MASTER_PROMPT.md`

## Checklist

- [x] Add explicit protected high/low swing IDs/state.
- [x] Establish protected HL/LH from causal BOS context.
- [x] Store protected dependency in pending setup.
- [x] Invalidate LONG on close below protected low.
- [x] Invalidate SHORT on close above protected high.
- [x] Bullish dealing range = protected low -> relevant expansion high.
- [x] Bearish dealing range = protected high -> relevant expansion low.
- [x] Add regression tests.

## Acceptance

- [x] Protected swing is not merely latest swing.
- [x] Pending invalidation works.
- [x] Premium/discount uses protected structure.
- [x] Typecheck/lint/tests pass.

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
