# Version 7.10 — Sequential Authorized Position Optimizer

## Position portfolio
- Existing RTS positions remain fixed/protected.
- Each program retains its 100-position maximum independently.
- Only remaining authorized capacity is considered for new placements.
- Candidate placements are evaluated sequentially.
- After each hypothetical placement, coverage is recalculated before ranking the next candidate.
- Proposed positions within roughly 40 miles of another proposed placement are suppressed to reduce overlapping recommendations.
- The optimizer stops automatically when the next candidate no longer meets the Competitive threshold, even if authorized capacity remains.

## Position Value
Portfolio ranking emphasizes:
- incremental net-new covered stores,
- share of remaining gaps captured,
- useful backup coverage.

## Marginal coverage curve
Optimize Network now shows:
- current positions and coverage,
- coverage after each qualifying hypothetical placement,
- incremental gain contributed by each additional position,
- projected coverage at the point where the model stops.

## Actions
- Click any proposed placement to open Simulate New RTS.
- Export the sequential position plan to CSV.
- Simulate the top candidate directly.

This version treats 100 positions as a ceiling, not a hiring target.
