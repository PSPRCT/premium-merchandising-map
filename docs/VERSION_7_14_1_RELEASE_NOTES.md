# Version 7.14.1 — Performance Regression Fix

## Optimize Network
Fixed `Maximum call stack size exceeded`.

Cause:
The v7.14 cached optimizer accidentally called `v714CachedSequentialPlan()` from inside
itself after a global replacement. It now correctly calls the underlying
`v710SequentialPlan()` once, stores the result, and reuses it.

## Manager Intelligence
Chunked/lazy row rendering is retained for performance, but manager and regional
drilldowns now use delegated click handling with data attributes.

This means:
- Regional Manager rows open Regional Manager Intelligence.
- Area Manager / RDM / District Manager rows open Manager Coverage & Placement Intelligence.
- Rows remain clickable even though they are inserted asynchronously in chunks.

## Performance improvements retained
- Shared sequential-plan cache
- Manager/Regional aggregate cache
- Candidate-impact cache
- Chunked national manager-list rendering
