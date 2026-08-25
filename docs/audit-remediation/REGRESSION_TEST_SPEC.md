# Regression & Parity Test Specification

## A. FVG Lifecycle

A1 Filled FVG cannot create future setup.
A2 Strategy resolves latest canonical FVG state.

## B. Pending Setup

B1 Bias reversal invalidates pending.
B2 FVG invalidation invalidates pending.
B3 OB invalidation invalidates when OB required.
B4 Expire after `maxPendingEntryBars`.
B5 Invalid/expired setup cannot fill later.

## C. MTF Ordering

Same 1m dataset with reversed raw delivery must produce identical canonical events, strategy state, setups, trades.

## D. Missing Candle

One missing expected 1m timestamp -> explicit `DATA_GAP`; no further strategy calculation over corrupted sequence.

## E. Aggregation Parity

Known 1m fixture -> exact 5m open/high/low/close/volume/timestamps.

## F. Pre-roll

Warm state before requested start; pre-roll trades not counted.

## G. End Boundary

Pending -> separately expired. Open trade -> `OPEN_END_OF_RANGE`, excluded from realized W/L.

## H. Eligibility / Quality

H1 Mandatory fail -> no setup.
H2 Eligible weak score possible.
H3 Eligible valid score possible.
H4 Eligible strong score possible.

## I. TP Selection

Opposite liquidity exists + RR below minimum -> invalid, no 2R fallback. No opposite liquidity -> 2R fallback allowed.

## J. Displacement ATR

Use previous ATR, excluding displacement candle itself.

## K. Realtime/Backtest Parity Harness

Feed identical closed 1m sequence through historical replay and realtime-style canonical adapter. Compare normalized events, setup lifecycle, final state, trades.

## L. End-to-End Fixtures

At least: successful LONG, successful SHORT, FVG-filled invalidation, bias invalidation, pending expiry, data-gap failure.
