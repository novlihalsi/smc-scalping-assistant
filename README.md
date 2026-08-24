# SMC Scalping Assistant

Backtest-first SvelteKit application for deterministic Smart Money Concept research. TASK-001
provides project tooling and architecture boundaries only; strategy and market-data behavior are
implemented by later tasks.

## Requirements

- Node.js (verified with 24.19.0)
- pnpm (verified with 11.20.0)

## Commands

```sh
pnpm install
pnpm dev
pnpm test
pnpm check
pnpm lint
pnpm build
```

The MVP is analysis-only. It does not execute trades or handle exchange credentials.
