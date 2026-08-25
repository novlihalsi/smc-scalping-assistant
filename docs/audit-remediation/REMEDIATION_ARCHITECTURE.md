# Remediation Architecture

## Canonical market timeline

`closed 1m -> continuity validation -> 1m state update -> 5m aggregation -> if 5m closes: process 5m first -> process 1m`.
Historical dan realtime harus memakai contract ini.

## Canonical entity references

Strategy state sebaiknya menyimpan `activeFvgId`, `activeOrderBlockId`, `activeSetupId` lalu resolve ke canonical state. Dilarang menyimpan stale snapshot sementara engine memperbarui object lain.

## Active setup registry

Pending setup perlu first-class state dan dependency IDs: FVG, OB optional, sweep, structure break.

Update tiap closed 1m:
`update entities -> validate pending setup dependencies -> invalidate/expire or trigger -> search/build new setup`.

## Data quality layer

`normalize -> sort -> deduplicate -> continuity validation -> canonical aggregation`.

## Shared replay contract

Suggested API: `processCanonicalMinute(engineState, closed1mCandle, config) -> PipelineResult`.

## Backtest lifecycle

`load pre-roll+range -> validate -> replay -> suppress pre-start metrics -> censor/expire at end -> analytics`.

## Scoring architecture

`EligibilityResult` terpisah dari `QualityScoreResult`.

## Provenance

Setup simpan IDs untuk HTF structure, sweep, CHoCH, displacement, FVG, OB optional, target liquidity optional.
