# Version 7.6 — Performance, Drilldowns, Address Simulation

## Performance
- Coverage Model, health scores, resiliency, territory reports, and executive
  tools now reuse cached store-to-RTS distance relationships.
- Gap placement planning uses a spatial grid rather than national gap × gap
  distance scans.
- Placement plans are cached by program, radius, and filtered scope.
- Filter metrics update first; heavy marker rendering moves to the next browser
  animation frame.
- Simulated RTS impact recalculates on marker drag-end rather than on every
  mouse movement.

## Drill-downs
Clickable rows now include:
- State / Territory Intelligence
- District / Area Manager Intelligence
- Gap Summary
- RTS Resiliency
- RTS Territory Profiles
- Territory Report
- Territory Health cards
- Gap Finder
- Model New RTS Placement

## Corrections
- Territory Health no longer displays `undefined stores within radius`.
- Resiliency uses actual in-radius Unique vs Shared coverage rather than
  nearest-owned stores.
- Manager Intelligence groups by the active District/Area hierarchy so clicking
  a manager correctly sets the hierarchy filters.
- Operational Focus no longer depends on UI ribbon elements that were removed
  during consolidation.

## Simulator
Simulate New RTS now supports:
- full address search,
- latitude / longitude,
- current map center,
- map click,
- draggable marker,
- exported coverage impact.

The address workflow restores the planning behavior from the mature One Walmart
map while keeping the shared platform's current coverage model.
