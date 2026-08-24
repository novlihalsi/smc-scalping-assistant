# SMC Scalping Assistant — Codex Implementation Pack v2

Versi ini menggunakan pendekatan **backtest-first**.

Tujuan utama: validasi strategi SMC Scalping V1 secara statistik terlebih dahulu sebelum menginvestasikan banyak effort ke realtime chart dan live scanner.

## Product flow

```text
Historical Data
-> SMC Engine
-> Strategy + Risk
-> Backtest
-> Analytics
-> Strategy Validation
-> Realtime WebSocket
-> Chart + Live Scanner
-> History / Journal
```

## Kenapa backtest-first?

Chart realtime yang terlihat bagus belum membuktikan strategi memiliki edge.

MVP engineering diprioritaskan untuk menjawab:

- Apakah setup SMC menghasilkan positive expectancy?
- Berapa win rate dan profit factor?
- Berapa max drawdown?
- Score setup mana yang paling baik?
- LONG atau SHORT yang lebih kuat?
- Jam/session mana yang lebih efektif?

Baru setelah baseline strategy layak, aplikasi realtime dibangun di atas engine yang sama.

## Stack

- SvelteKit
- TypeScript strict
- Tailwind CSS
- shadcn-svelte
- Vitest
- SQLite
- Drizzle ORM
- TradingView Lightweight Charts
- Public exchange REST + WebSocket market data

## Urutan dokumen

1. `PRD.md`
2. `SMC_RULES.md`
3. `ARCHITECTURE.md`
4. `DATA_MODELS.md`
5. `BACKTESTING_SPEC.md`
6. `VALIDATION_PLAN.md`
7. `CODING_GUIDELINES.md`
8. `CODEX_MASTER_PROMPT.md`
9. `TASK_INDEX.md`
10. `tasks/TASK-001.md` sampai `tasks/TASK-026.md`

## Milestones

- Milestone 1 — Foundation & Historical Data: Task 001–004
- Milestone 2 — SMC Core Engine: Task 005–015
- Milestone 3 — Strategy, Scoring & Risk: Task 016–018
- Milestone 4 — Backtesting & Validation: Task 019–021
- Milestone 5 — Realtime Market & Live UI: Task 022–025
- Milestone 6 — History / Journal Foundation: Task 026

## Go / No-Go Gate

Setelah Task 021, lakukan strategy validation.

Jika baseline tidak memiliki evidence of edge, **jangan** lanjut mengoptimalkan live scanner seolah-olah strategi sudah valid. Perbaiki rule/config secara terukur dan rerun backtest.

## Contoh eksekusi Codex

```text
Read docs/CODEX_MASTER_PROMPT.md and docs/tasks/TASK-001.md.
Inspect the repository.
Implement TASK-001 only.
Run typecheck, lint, and tests.
Do not implement later tasks.
```
