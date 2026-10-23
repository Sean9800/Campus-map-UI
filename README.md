# Campus-map-UI

The repository contains a standalone campus explorer (`campus UI.html` with
`campus UI.js` and `campus UI.css`) and a single-file embeddable version
(`Embedded campus UI.html`).

## Campus-specific data

The bundled places and map coordinates are sample data, and the viewer creates
illustrative placeholder panoramas when a place has no `pano` URL. Before using
this as a real campus guide, replace the `nodes` array in both JavaScript
versions with verified campus locations, walking links, coordinates, and
licensed 360-degree equirectangular images. Each node can provide:

- `pano`: panorama image URL (omit it only when a generated placeholder is
  acceptable)
- `yaw`: rotation in degrees to align the panorama with the map
- `x` / `y`: position in the 400-by-300 map viewBox
- `links`: IDs of directly walkable neighboring nodes

Set `METERS_PER_MAP_UNIT` to a value calibrated against known walking distances
on the map. When hosting panorama images on another origin, that host must
allow cross-origin image loading. Keep the data and scale consistent in the
standalone and embedded versions.
