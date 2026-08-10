# Version 7.11 — Expanded Position Pipeline & Posting Markets

## Regional Manager drill-down
- District/Area Manager rows on the Regional Manager dashboard now open the full
  Manager Coverage & Placement Intelligence profile directly.
- No separate map filtering step is required.

## Broader authorized-position pipeline
The sequential optimizer now continues through three actionable tiers:

- High Priority
  - 35+ incremental net-new stores
  - Position Value 72+
- Strong Candidate
  - 25+ incremental net-new stores
  - Position Value 58+
- Expansion Candidate
  - 15+ incremental net-new stores
  - Position Value 42+

Monitor-only candidates remain hidden from the recommended position portfolio.

The optimizer still:
- protects all existing RTS positions,
- recalculates after every hypothetical placement,
- prevents duplicate credit for the same gaps,
- stops when the next candidate falls below the Expansion Candidate threshold,
- respects the 100-position maximum independently for each program.

## Recommended posting market
Coverage-center coordinates and recruiting location are now separate concepts.

For each proposed position the model:
1. preserves the mathematically useful 75-mile coverage-center coordinates;
2. looks for a practical major recruiting metro within approximately 95 miles;
3. displays that metro as the Recommended Posting Market;
4. retains the original coverage center for simulation and mapping.

Example:
Coverage center: Lenoir City, TN
Recommended posting market: Knoxville, TN

If no practical major metro is nearby, the model falls back to the strongest local store market.
