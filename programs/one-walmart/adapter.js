/*
One Walmart adapter placeholder.

This file intentionally does not reuse the Premium radius-only rules.
One Walmart requires a dedicated business-rule routing engine that accounts for:
- shared One Walmart PSP routing,
- dedicated Tyson/P&G/Unilever teams,
- team normalization,
- legacy Acosta restrictions,
- remote trainer eligibility and capacity,
- management-group-specific behavior.

The shared dashboards, map rendering, exports, resiliency views, and reports can
consume the adapter once those routing outputs are normalized.
*/

export function createOneWalmartAdapter() {
  throw new Error(
    "One Walmart routing adapter has not yet been migrated into Version 3."
  );
}
