# Startup Diagnostics

When Version 5 loads successfully, the browser console reports:

```text
[V5] Startup diagnostics passed
```

The validation confirms:

- program configuration loaded
- store data loaded
- RTS data loaded
- metadata loaded
- Leaflet map initialized

A failing optional tool no longer stops the map. The affected button displays a
tool-specific error while the rest of the application remains usable.
