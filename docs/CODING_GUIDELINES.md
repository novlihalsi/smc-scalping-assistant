# Coding Guidelines

- TypeScript strict.
- No `any`.
- Pure domain functions whenever practical.
- No Svelte/DB/network imports in domain.
- No magic strategy numbers.
- Regression test every domain bug.
- UTC timestamps internally.
- Avoid direct floating-point equality where computed prices are involved.
- One task = focused change.
- Do not implement future tasks opportunistically.
- No live trading execution.
- No private keys or trading secrets.
- Report assumptions and lookahead risk after every strategy-related task.
