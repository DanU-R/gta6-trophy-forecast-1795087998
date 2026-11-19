# GTA VI Trophy Rarity Forecast — refresh-aware quantile model

Forecast of every GTA VI (PS5) trophy's earn rate on Exophase 90 minutes ahead,
as five quantiles, scored by pinball loss on the logit scale.

## Why it beats persistence
Exophase refreshes its tracked-player count on its own schedule. On a refresh the
player pool grows fast and the newly tracked players are more casual, so every
earned-trophy rarity drops (except a 100% platinum anchor). The persistence
baseline forecasts the last rate unchanged and symmetric, so it over-predicts
after a refresh. This entry forecasts a refresh-aware, downward-shifted,
asymmetric distribution on the logit scale.

## Run
```
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```
Standard library only, deterministic, node22.
