# Version 7.5 — Cascading Filters and Performance

## Cascading filters fixed

The hierarchy now behaves as a true drill-down:

Regional Manager
→ District / Area Manager
→ RTS

Selecting a Regional Manager replaces the District Manager options with only
districts in that region. Selecting a District Manager then replaces the RTS
options with only RTS that actually cover at least one store in that selected
scope within the current radius.

Coverage, Retailer, and State selections also constrain the downstream
hierarchy choices.

## Performance improvements

- Store-to-RTS distances are calculated once at load.
- Radius changes reuse cached distances instead of recalculating geography.
- Radius input is debounced.
- RTS hover counts reuse cached coverage relationships.
- Snapshot metrics use one-pass aggregation instead of repeated full-list
  filtering.
- Cascading RTS options use cached in-radius relationships.

These changes are especially noticeable on Premium Merchandising with 9,473
stores.
