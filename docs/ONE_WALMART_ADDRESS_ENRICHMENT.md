# One Walmart Address Enrichment

## Results

- Map stores: 4,598
- Master rows: 4,587
- Matched stores: 4,582
- Unique store-number matches: 4,579
- Duplicate store numbers resolved by coordinates: 3
- Unmatched stores: 16

## Matching method

1. Match Walmart store number.
2. When a store number appears more than once in the master, choose the record
   nearest to the existing map coordinate.
3. Preserve unmatched stores with their existing city, ZIP, and coordinates.

## Unmatched store numbers

1822, 1854, 2026, 2067, 2072, 2085, 2240, 2346, 2423, 2501, 2997, 3693, 5793, 5803, 7254, 7259

## Output

The enriched store records now include:

- street address
- city
- state
- ZIP
- store name
- MDM Store ID
- master Site ID
- master coordinates
- address match method
