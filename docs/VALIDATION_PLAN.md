# Strategy Validation Plan

## Purpose

Menentukan apakah SMC Scalping V1 layak digunakan sebagai live trading assistant.

## Stage 1 — Baseline

Gunakan default config tanpa parameter tuning berlebihan.

Record:

- trade count;
- win rate;
- PF;
- expectancy R;
- max DD;
- longest losing streak;
- LONG/SHORT split.

## Stage 2 — Minimum Sample Gate

Jangan menarik kesimpulan kuat dari sampel kecil.

Target:

- 500 trades: evaluasi awal;
- 1,000+ trades: lebih baik.

## Stage 3 — Time Segmentation

Pisahkan data secara kronologis:

- development/in-sample = first 70% of the requested UTC time range;
- validation/out-of-sample = final 30% of the requested UTC time range.

Jangan tune parameter pada seluruh data lalu menganggap result unbiased.

## Stage 4 — Robustness

Bandingkan performa:

- different months;
- high-volatility vs low-volatility periods;
- LONG vs SHORT;
- hour/session;
- score bands.

Every validation report must retain the IS/OOS metrics, UTC-month metrics, LONG/SHORT, score,
UTC-hour, and UTC-session breakdowns.

## Stage 5 — Cost and Concentration Sensitivity

Replay the same canonical candle sequence with:

- zero costs;
- configured baseline costs;
- 2x configured costs, or 4 bps fee plus 2 bps slippage when the baseline is zero.

Report expectancy and total-R deltas against the configured baseline. Also report how much of
gross winning R is contributed by the top 5% of trades; concentration above 50% is a review
warning, not an automatic rejection.

## Stage 6 — Candidate Improvement

Tambahkan hanya satu filter per experiment.

Example:

```text
Experiment A = baseline
Experiment B = baseline + OB
Experiment C = baseline + discount/premium
```

## Experiment Provenance

Every report records the strategy identifier, symbol, UTC range, strategy config, execution-cost
config, validation schema version, and a deterministic configuration fingerprint. The fingerprint
is for reproducibility and change detection, not cryptographic authentication.

## Go / No-Go Questions

Sebelum live scanner dianggap meaningful:

- Apakah expectancy > 0 pada validation set?
- Apakah PF masuk akal dan tidak hanya didorong beberapa outlier?
- Apakah drawdown dapat diterima?
- Apakah result tetap cukup stabil antar periode?
- Apakah signal count cukup untuk scalping use case?
- Apakah fee/slippage berpotensi menghapus edge?

## Paper Trading Gate

Setelah historical validation:

```text
historical backtest
-> paper/live observation
-> compare expected vs actual signal behavior
-> only then consider future execution integration
```

Automatic execution tetap di luar scope V1.
