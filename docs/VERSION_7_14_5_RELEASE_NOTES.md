# Version 7.14.5 — Canonical Manager Identity

Fixes Regional Manager rows that showed 0 stores for managers who actually had stores.

Example:
- Performance hierarchy: `GIESKE, DAWN`
- Store hierarchy: `Gieske, Dawn`

These now resolve to the same canonical manager key.

## Canonical identity behavior
Manager names are normalized for joins by:
- case,
- repeated spaces,
- punctuation,
- `Last, First` formatting,
- common `First Last` formatting,
- diacritics.

## Applied to
- Regional Manager dashboard store counts / coverage / gaps
- Manager Intelligence rollups
- Manager Coverage & Placement Intelligence scope resolution
- Regional manager rollups
- common organization hierarchy comparisons

The preferred human-readable display name is preserved separately from the canonical join key.
