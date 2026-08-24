# Codex Task Prompt Template

```text
Read:
- docs/CODEX_MASTER_PROMPT.md
- docs/PRD.md
- docs/SMC_RULES.md
- docs/ARCHITECTURE.md
- docs/DATA_MODELS.md
- docs/BACKTESTING_SPEC.md
- docs/VALIDATION_PLAN.md
- docs/CODING_GUIDELINES.md
- docs/tasks/TASK-XXX.md

Inspect the existing repository.

Implement TASK-XXX only.

This project is backtest-first. Do not build later realtime/UI features early.

Run typecheck, lint, and tests.
Review the change for lookahead bias.
Report files changed, tests, assumptions, and remaining work.
```
