# Version 7.14 — Performance Pass

## Shared calculation cache
- Sequential Optimize Network plan is calculated once per program/radius/roster state and reused.
- Manager and Regional Intelligence reuse cached aggregate rows.
- Cross-manager candidate impact results are cached instead of repeatedly recalculated.

## Lazy rendering
- Manager Intelligence national tables render in animation-frame chunks rather than injecting every row at once.
- Detailed placement impact is deferred until a manager or regional profile is actually opened.
- Heavy national placement logic is not rerun merely because a manager table is opened.

## Cache invalidation
Planning caches clear automatically when the service radius changes. Program reloads naturally rebuild the cache.

## Expected effect
- Faster repeat opens of Optimize Network.
- Faster Manager Intelligence opening and scrolling.
- Less freezing when moving between Regional, Manager, and Optimize views.
