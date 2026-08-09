# Version 7.6.1 — Startup Handler Restoration

Fixed the startup error `modelPlacement is not defined`.

The same v7.6 cleanup had also removed three other handlers still referenced by compatibility controls. Version 7.6.1 restores all four using the current cached, radius-based engine:

- modelPlacement
- territoryProfiles
- compareTerritories
- resiliency

Validation performed before packaging:

- JavaScript syntax check passed.
- All bare startup binding handlers resolve to defined functions.
- Restored territory and resiliency tools use Unique/Shared in-radius coverage, not legacy nearest-owned logic.
