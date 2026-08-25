# GATE-004 — Remove Stale & Zombie State Paths

## Goal
Close one minimum blocker before realtime.

## Required Reading
- `../REALTIME_GATE.md`
- `../CODEX_MASTER_PROMPT.md`

## Checklist

- [ ] Remove/internalize public API that accepts stale full FVG lifecycle snapshots.
- [ ] Prefer IDs + canonical lookup.
- [ ] Terminalize pending setup at end-of-range.
- [ ] Terminalize open setup/trade at end-of-range.
- [ ] Prevent EOR checkpoint from zombie-triggering later.
- [ ] Add regression tests.

## Acceptance
- [ ] No unsafe public stale-FVG path remains.
- [ ] Canonical final state matches report.
- [ ] Expired/invalid/EOR setup cannot later trigger.


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
