# GATE-004 — Remove Stale & Zombie State Paths

## Goal

Close one minimum blocker before realtime.

## Required Reading

- `../REALTIME_GATE.md`
- `../CODEX_MASTER_PROMPT.md`

## Checklist

- [x] Remove/internalize public API that accepts stale full FVG lifecycle snapshots.
- [x] Prefer IDs + canonical lookup.
- [x] Terminalize pending setup at end-of-range.
- [x] Terminalize open setup/trade at end-of-range.
- [x] Prevent EOR checkpoint from zombie-triggering later.
- [x] Add regression tests.

## Acceptance

- [x] No unsafe public stale-FVG path remains.
- [x] Canonical final state matches report.
- [x] Expired/invalid/EOR setup cannot later trigger.

## Scope Guard

Implement GATE-004 only.
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
