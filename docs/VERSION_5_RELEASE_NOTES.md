# Version 5 — Production Stabilization

Version 5 preserves the full Version 4.1 feature-parity release and fixes the
startup failure caused by direct references to tool names that had different
implementations in the shared codebase.

## Fixed

- `managerRollups is not defined`
- `gapFinder is not defined`
- `resiliencySimulator is not defined`
- one missing tool can no longer prevent the map and data from loading
- perpetual loading screen now becomes a readable startup error
- runtime tool errors are isolated to the affected tool

## Added

- implemented compatibility aliases for preserved One Walmart tools
- guarded tool binding
- startup data/map validation
- unhandled-error and promise-rejection logging
- Version 5 cache-busting references

## Preserved

- Premium Merchandising and One Walmart programs
- all-roster planning rule
- dedicated-team eligibility
- One Walmart address enrichment
- Operational Focus
- saved/shareable views
- dedicated-team exposure
- executive dashboards
- planning, resiliency, health, reporting, and export tools
