# GATE-003 — Real Historical vs Realtime Parity Harness

## Goal
Close one minimum blocker before realtime.

## Required Reading
- `../REALTIME_GATE.md`
- `../CODEX_MASTER_PROMPT.md`

## Checklist

- [ ] Build distinct in-memory realtime ingestion adapter.
- [ ] Model REST bootstrap.
- [ ] Model open-candle WS updates.
- [ ] Model close/finalization.
- [ ] Model duplicate delivery.
- [ ] Model out-of-order arrival.
- [ ] Model same-close ordering.
- [ ] Use canonical 1m -> derived 5m.
- [ ] Compare to historical replay.

## Acceptance
- [ ] Empty-state LONG fixture matches.
- [ ] Empty-state SHORT fixture matches.
- [ ] Invalidation fixture matches.
- [ ] Duplicate/reversed arrival yields same canonical result.
- [ ] Compare events, lifecycle, final state, and trades.


## Scope Guard
Implement GATE-003 only.
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
