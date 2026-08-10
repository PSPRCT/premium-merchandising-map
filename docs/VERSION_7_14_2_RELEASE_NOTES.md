# Version 7.14.2 — Exact Store Search Restoration

## Store-number search
Restores the earlier intuitive behavior:

1. Type an exact store number, e.g. `1201`.
2. Press Enter.
3. The map flies directly to that exact store.
4. The store popup / Store Intelligence opens automatically.

Exact store-number matching takes priority over addresses, ZIP codes, SiteIDs, and
other text containing the same digits.

## Suggestions
The general suggestion list remains available for:
- partial store numbers,
- addresses,
- SiteIDs,
- cities,
- managers,
- RTS.

When an exact store number is present in the suggestion list, it is promoted visually.

## Click behavior
Selecting a store result now routes through the same direct-open behavior rather than
only placing/focusing the marker.
