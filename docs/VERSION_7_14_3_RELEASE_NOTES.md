# Version 7.14.3 — Exact Store Search Completion

Exact store-number search now matches the actual application DOM and marker architecture.

For an exact store number:
1. Search results collapse to the single exact store.
2. Pressing Enter or clicking that result closes the suggestion list.
3. The map flies to the store.
4. The existing Leaflet store popup opens automatically.

Fixes:
- Uses the real `results` dropdown element.
- Uses the real `markerById` map.
- Numeric store numbers short-circuit generic address/ZIP/SiteID matching.
- Store-result clicks use the same direct-open behavior.
