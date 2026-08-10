# Version 7.10.1 — Optimize Network Roster Fix

Fixed the Optimize Network runtime error:

`rts is not defined`

The shared platform roster variable is `RTS`. The new sequential optimizer now uses
the correct roster reference through a defensive `v710Roster()` accessor.

The 100-position cap, protected existing roster policy, sequential placement ranking,
diminishing-return stop rule, and marginal coverage curve are unchanged.
