# Historical Snapshot Specification

For actual time-based analysis, create a folder per snapshot:

```text
data/history/2026-07-31/
  premium-merchandising-stores.json
  premium-merchandising-rts.json
  one-walmart-stores.json
  one-walmart-rts.json
  metadata.json
```

Recommended metadata fields:

- snapshotDate
- sourceFiles
- storeCount
- rtsCount
- notes
- major roster changes
- major store-universe changes

Version 6 intentionally does not display trend claims until dated snapshots
exist.
