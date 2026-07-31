# PSP Coverage Intelligence Platform v3.1

Both programs are now available from the header program selector.

## Planning roster rule

Every RTS row present on the applicable roster is included in coverage planning.
The `ActiveForRouting` source value is retained as metadata but does not remove
a person from the modeled network.

## Premium Merchandising

- Uses the complete Premium Merchandising RTS roster.
- Every store uses the full Premium RTS pool.
- Coverage radius: 75 miles.

## One Walmart

- `WM - One Walmart` stores use the complete combined One Walmart roster from
  `RCT_RTS (25).csv`.
- P&G, Unilever, and Tyson stores use the complete Acosta roster from
  `RCT_RTS (24).csv`.
- Acosta RTS members present in both rosters can support both One Walmart and
  dedicated-team calculations.
- Coverage radius: 75 miles.

## Active One Walmart data

- 4,598 unique physical Walmart stores
- 7,092 source rows before deduplication
- P&G and Tyson rows are retained as overlays on the matching SiteID
- One Walmart core coverage uses the combined One Walmart RTS roster
- Dedicated-team coverage uses the Acosta RTS roster
- All roster rows are included in planning

The current workbook includes 761 P&G overlay stores and 1,733 Tyson overlay
stores. Some stores have both overlays. The workbook supplied for this release
does not include an Unilever management-group row.

Street address and state fields remain blank until the richer store-address
master is connected.


## Version 3.3 — Walmart address enrichment

- 4,582 of 4,598 stores enriched from `RCT_WM_Store_Master (9).csv`
- 16 stores remain unmatched
- Duplicate store numbers were resolved using the existing map coordinates
- Full match details are in `docs/ONE_WALMART_ADDRESS_MATCH_REPORT.csv`
