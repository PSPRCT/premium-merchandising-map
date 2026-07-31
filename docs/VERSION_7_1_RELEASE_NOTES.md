# Version 7.1 — Startup Architecture Fix

Version 7 correctly added the organization hierarchy, but the inherited app
still installed many optional button handlers before `init()` executed. A
single missing or renamed optional function could therefore prevent stores,
RTS coverage, metrics, and markers from loading.

Version 7.1 changes startup order:

1. Load program datasets.
2. Initialize stores, RTS, coverage, filters, and map.
3. Remove the loading overlay.
4. Install optional tools through guarded handlers.
5. Run saved-view and Operational Focus tasks.

An optional tool failure can no longer block the core map.
