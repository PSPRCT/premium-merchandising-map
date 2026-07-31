# One Walmart Migration Guide

The current One Walmart HTML is preserved outside this Version 3 release.
Do not replace its routing rules with the Premium radius-only model.

## Required migration inputs

1. Latest working One Walmart HTML
2. Current store dataset
3. Current RTS roster
4. Dedicated-team assignments and management groups
5. Remote trainer pool and eligibility fields
6. Team-normalization rules

## Migration steps

1. Extract One Walmart data into:
   - `data/one-walmart/stores.json`
   - `data/one-walmart/rts.json`
   - `data/one-walmart/metadata.json`
2. Implement `programs/one-walmart/adapter.js`.
3. Normalize adapter outputs for the shared dashboard modules.
4. Validate dedicated-team routing separately from shared-team routing.
5. Enable `available: true` in `programs/one-walmart/config.js`.
6. Test program switching and all shared dashboards.

## What carries over automatically

- interface shell,
- map rendering,
- search,
- filters,
- reports,
- executive views,
- simulations,
- export utilities.

## What does not carry over automatically

- dedicated-team eligibility,
- remote routing,
- legacy team restrictions,
- intake workflow logic,
- assignment ownership rules.
