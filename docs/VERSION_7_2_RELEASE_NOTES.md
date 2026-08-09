# Version 7.2 — Hierarchy Filters and Tool Binding Fix

## Regional hierarchy

- Added visible Regional Manager filter.
- Renamed Manager filter to Area Manager / RDM.
- Area Manager choices cascade from the selected Regional Manager.
- Regional and Area Manager selections update map pins, snapshot metrics,
  planning tools, saved views, and exports.
- Organization Navigator map actions now set the actual filters.

## Tool warning fix

The remaining inherited legacy bindings previously ran inside one shared
`try/catch`. A single absent retired button stopped all later bindings and
displayed the generic optional-tool warning.

Version 7.2 binds every control independently:

- absent retired controls are ignored,
- unavailable handlers disable only the affected button,
- one tool cannot interrupt another,
- status reports the actual count of unavailable tools,
- successful startup reports that all tools loaded.
