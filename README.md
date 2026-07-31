# Premium Merchandising Coverage Command Center

This is the modular GitHub Pages version of the working Sprint 4 map.

## Repository structure

- `index.html` — page layout and external library references
- `css/app.css` — all visual styling
- `js/app.js` — map, search, filters, territory, planning, and report logic
- `js/data.js` — data loader
- `data/stores.json` — Premium Merchandising store data
- `data/rts.json` — Premium Merchandising RTS roster
- `data/metadata.json` — release and dataset summary

## Publish on GitHub Pages

1. Create a new repository or clear the files from the existing Premium Merchandising repository.
2. Upload the complete contents of this folder while preserving the folder structure.
3. In **Settings → Pages**, select:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/(root)**
4. Open the published Pages URL after deployment finishes.

## Important

Do not open `index.html` directly from the computer with a `file://` address. Browser security normally blocks the JSON fetches. Test through GitHub Pages or another local web server.

## Updating data later

Replace `data/stores.json` and/or `data/rts.json`. The HTML and application logic do not need to be rebuilt when only the data changes.


## Maintenance release

This release loads and validates `metadata.json`, shows the data-update date and record counts in the header, and displays a clear error when a required data file is missing or invalid.

See `DATA_REFRESH_GUIDE.md` for the recurring refresh process.


## Sprint 6 — Network Optimization

This release adds:

- Executive Mode
- Network Optimizer
- Multi-Hire Coverage Planner
- Territory Health Scores
- RTM Dashboard
- Exportable store-transfer recommendations

The recommendations are geographic planning outputs based on the current data, filters, active RTS roster, and selected radius. They are not automatic staffing decisions.
