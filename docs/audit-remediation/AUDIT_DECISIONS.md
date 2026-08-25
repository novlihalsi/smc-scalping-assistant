# Audit Decisions — Source of Truth

Dokumen ini mengunci ambiguity yang ditemukan saat audit.

## 1. Initial Bias

Initial market bias = `NEUTRAL` sampai structure cukup terbentuk. Jangan infer bullish/bearish dari satu high/low comparison.

## 2. Protected Swing

Bullish: protected swing = HL terbaru yang secara struktural mendukung bullish BOS.
Bearish: protected swing = LH terbaru yang secara struktural mendukung bearish BOS.

## 3. Strategy Stage Ordering

LONG: `HTF bullish bias -> sell-side sweep -> bullish CHoCH -> bullish displacement -> bullish FVG -> setup VALID -> first entry-zone touch -> TRIGGERED`.
SHORT mirror.

Same-candle dependent stages hanya boleh maju bila OHLC cukup membuktikan ordering. Jika tidak, gunakan interpretasi konservatif dan jangan advance beberapa stage sekaligus.

## 4. FVG Provenance

FVG untuk setup harus berasal dari displacement sequence yang sama setelah CHoCH. Jangan gunakan unrelated older FVG.

## 5. FVG Lifecycle

Canonical state direferensikan by id, bukan stale snapshot.

- UNTOUCHED: eligible
- PARTIALLY_FILLED: masih eligible sesuai lifecycle
- FILLED: tidak eligible untuk setup baru
  Pending setup yang bergantung pada FVG harus invalid jika lifecycle FVG mengharuskan invalidation.

## 6. Order Block Provenance

OB harus berasal dari displacement/structure sequence yang sama. Historical unrelated OB tidak boleh menjadi confluence baru.

## 7. Entry Mechanics

V1 = first touch setelah setup menjadi VALID. Tidak ada confirmed retracement lalu retouch kedua.
Default fill = first touched zone boundary agar tidak menambahkan favorable hidden assumption.

## 8. Pending Setup Lifecycle

`FORMING -> VALID/PENDING -> TRIGGERED -> TP|SL` atau `VALID/PENDING -> INVALIDATED`.
Setup valid/pending tetap menjadi active lifecycle object.

## 9. Pending Invalidation

Invalid bila:

- HTF bias reversal;
- protected structure invalid;
- dependent FVG invalid/FILLED;
- dependent OB invalid bila required for entry intersection;
- thesis dependency rusak;
- expiry tercapai.

## 10. Pending Expiry

Tambahkan `maxPendingEntryBars`, default 10 entry-timeframe bars. Setelah itu `INVALIDATED`, reason `PENDING_EXPIRED`.

## 11. TP / 2R Fallback

Jika nearest opposite liquidity ada tetapi RR < minimum, setup invalid. Jangan fallback ke 2R.
2R fallback hanya jika tidak ada valid opposite liquidity target.

## 12. Displacement ATR Reference

Bandingkan current candle body dengan ATR dari data sebelum current candle: `body(current) > previousATR * multiplier`.

## 13. Dealing Range

Bullish: range low = protected HL; range high = relevant HH/expansion high.
Bearish: range high = protected LH; range low = relevant LL/expansion low.

## 14. Eligibility vs Quality Score

Pisahkan mandatory eligibility dari quality scoring.

Mandatory eligibility:

- aligned HTF bias
- liquidity sweep
- CHoCH
- displacement
- causal FVG
- valid entry geometry
- RR >= minimum

Jika gagal: NO SETUP.

Quality score V1:

- OB overlap quality: 25
- Premium/Discount: 20
- Sweep quality: 15
- Displacement strength: 15
- FVG quality: 10
- Target quality: 10
- Reserved/session-ready: 5

Classification: 0–59 WEAK, 60–79 VALID, 80–100 STRONG. `NO_TRADE` bukan score bucket.

## 15. Canonical Timeframe Construction

1m adalah canonical source. 5m strategy state harus derived dari 1m aggregation path. Native 5m hanya diagnostic comparison.

## 16. Same-Close Ordering

Pada close timestamp sama: derived 5m diproses sebelum 1m strategy candle. Arrival order WebSocket tidak boleh memengaruhi domain result.

## 17. Historical Continuity

Expected 1m candle harus kontinu. Duplicate/gap = explicit data-quality error. Baseline research fail-fast pada gap.

## 18. Backtest Pre-roll

Load warm-up sebelum requested start. Suggested minimum 500 x 1m bars atau kebutuhan maksimum indikator/structure. Pre-roll trades tidak dihitung.

## 19. End-of-Range

Pending at end -> `EXPIRED_END_OF_RANGE`, report separately.
Triggered open trade -> `OPEN_END_OF_RANGE`, censored, excluded dari realized win/loss.

## 20. Validation Gate

Wajib mencakup OOS split, period/month robustness, LONG vs SHORT, score buckets, time-of-day, fee/slippage sensitivity, experiment provenance/config hash, outlier concentration.
