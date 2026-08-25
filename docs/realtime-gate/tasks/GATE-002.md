# GATE-002 — Causal FVG & Order Block Provenance

## Goal

Close one minimum blocker before realtime.

## Required Reading

- `../REALTIME_GATE.md`
- `../CODEX_MASTER_PROMPT.md`

## Checklist

- [x] Add explicit sequence/provenance linkage for displacement, FVG, OB, setup.
- [x] FVG used by setup must belong to active CHoCH/displacement sequence.
- [x] OB confluence must belong to same causal sequence.
- [x] Add adversarial newer/older unrelated FVG tests.
- [x] Add adversarial unrelated OB tests.
- [x] Unrelated zones cannot alter entry geometry, eligibility, or score.

## Acceptance

- [x] Setup consumes causal FVG/OB only.
- [x] Adversarial tests pass.
- [x] Existing valid LONG/SHORT fixtures still pass.

## Scope Guard

Implement GATE-002 only.
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
