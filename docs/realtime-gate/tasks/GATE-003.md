# GATE-003 — Real Historical vs Realtime Parity Harness

## Goal

Close one minimum blocker before realtime.

## Required Reading

- `../REALTIME_GATE.md`
- `../CODEX_MASTER_PROMPT.md`

## Checklist

- [x] Build distinct in-memory realtime ingestion adapter.
- [x] Model REST bootstrap.
- [x] Model open-candle WS updates.
- [x] Model close/finalization.
- [x] Model duplicate delivery.
- [x] Model out-of-order arrival.
- [x] Model same-close ordering.
- [x] Use canonical 1m -> derived 5m.
- [x] Compare to historical replay.

## Acceptance

- [x] Empty-state LONG fixture matches.
- [x] Empty-state SHORT fixture matches.
- [x] Invalidation fixture matches.
- [x] Duplicate/reversed arrival yields same canonical result.
- [x] Compare events, lifecycle, final state, and trades.

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
