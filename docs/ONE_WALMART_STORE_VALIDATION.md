# One Walmart Store-Universe Validation

## Correct physical-store count

**4,598 unique stores**

The source workbook contains **7,092 rows**, but dedicated-team rows
repeat physical stores already present under `WM - One Walmart`.

## Source rows

- WM - One Walmart: 4,598
- WM - DRT - P&G: 761
- WM - DRT - Tyson: 1,733
- WM - DRT - Unilever: 0

## Stored model

Each SiteID is written once to `data/one-walmart/stores.json`.

Dedicated-team relationships are retained in:

```json
"dedicatedTeams": ["P&G", "Tyson"]
```

The main One Walmart coverage calculation treats the store as one physical
location. Dedicated-team analysis can separately apply the Acosta RTS roster
to the overlay fields.
