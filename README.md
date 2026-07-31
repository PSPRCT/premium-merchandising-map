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
