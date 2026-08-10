# Version 7.14.4 — First-Search Store Popup Fix

Fixes the remaining exact store-number search issue where:

- First Enter: map zoomed to the correct store but no popup opened.
- Second Enter: popup opened correctly.

Cause:
On the first jump the store marker was still represented inside the Leaflet
MarkerCluster layer. `marker.openPopup()` was being called before the cluster
finished resolving the individual marker.

Fix:
- Wait for the map `moveend` event after the initial fly-to.
- Use MarkerCluster `zoomToShowLayer()` to expose the individual store marker.
- Open the popup only after the marker is confirmed visible.
- Retain a timed fallback for browser timing differences.

Expected behavior:
Type exact store number -> Enter once -> suggestion list closes -> map flies to
store -> individual marker resolves -> popup opens automatically.
