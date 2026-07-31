# Premium Merchandising Map — Data Refresh Guide

The map interface and planning logic live in `index.html`, `css/`, and `js/`.

Routine data updates only require replacing these files:

- `data/stores.json`
- `data/rts.json`
- `data/metadata.json`

## Store JSON structure

Each record in `stores.json` should include:

```json
{
  "siteId": "557773",
  "storeNumber": "1772",
  "retailer": "Target",
  "address": "4608 Highway 280",
  "city": "Birmingham",
  "state": "AL",
  "zip": "35242",
  "manager": "Manager Name",
  "managerEmail": "manager@example.com",
  "lat": 33.4192,
  "lng": -86.6861
}
```

## RTS JSON structure

Each record in `rts.json` should include:

```json
{
  "name": "RTS Name",
  "id": "123456",
  "email": "rts@example.com",
  "lat": 33.5,
  "lng": -86.8,
  "active": true,
  "status": "Active",
  "rtm": "RTM Name",
  "remoteCapable": false
}
```

## Metadata structure

Update `metadata.json` each time the data changes:

```json
{
  "application": "Premium Merchandising Coverage Command Center",
  "release": "Data Refresh YYYY-MM-DD",
  "dataUpdated": "YYYY-MM-DD",
  "storeCount": 9473,
  "rtsCount": 45,
  "coverageRadiusMiles": 75,
  "managementGroup": "Premium Merchandising",
  "managementGroupID": 245
}
```

## GitHub refresh steps

1. Open the `premium-merchandising-map` repository.
2. Open the `data` folder.
3. Replace `stores.json`, `rts.json`, and `metadata.json`.
4. Commit the changes.
5. Wait for GitHub Pages deployment to complete.
6. Open the live map and confirm the header shows the new data date and counts.
7. Test one store search, one city search, one RTS territory, and one planning tool.

## Version backups

Before replacing data, download or copy the existing three JSON files into a dated backup folder outside the published repository, for example:

```text
backups/
  2026-07-31/
    stores.json
    rts.json
    metadata.json
```

The published repository should continue to use the simple paths under `data/`.
