# Version 7.4 — Simulation Binding Fix

Fixed the confirmed startup failure:

```text
simulate is not defined
```

The consolidated command-center button referenced `simulate`, but the implemented
function in the shared codebase is `startSimulation`.

Version 7.4 changes the binding to `startSimulation` and performs a binding-name
scan plus JavaScript syntax validation before packaging.
