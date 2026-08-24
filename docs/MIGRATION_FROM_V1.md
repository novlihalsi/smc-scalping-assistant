# Migration from Documentation Pack v1

Perubahan utama v2:

## Old priority

```text
historical/realtime
-> chart
-> SMC
-> backtest later
```

## New priority

```text
historical
-> SMC
-> strategy/risk
-> backtest
-> analytics
-> validation gate
-> realtime
-> chart
-> history
```

## Task renumbering

Task IDs v2 tidak kompatibel satu-ke-satu dengan v1.

Jika implementation belum dimulai, gunakan v2 sepenuhnya.

Jika repository sudah mengerjakan task dari v1, mapping harus dilakukan berdasarkan **feature name**, bukan task number.

## Reason

Tujuan revisi adalah memastikan product tidak menghabiskan effort pada realtime visualization sebelum rule strategy dapat diukur secara statistik.
