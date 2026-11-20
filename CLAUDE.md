# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static, client-only web app (no build step, no package.json) converting coordinates between VN-2000 (central meridians of Vietnam's 34 provinces after the 1 July 2025 merger), UTM and WGS84, with map drawing/measuring, KML/CSV/GeoJSON/SHP/DXF export, SHP import and a framed PNG map image. Bilingual (Vietnamese default, English). Hosted on GitHub Pages from this public repo (`quanta1985/vn2000`, all rights reserved — see LICENSE): `git push` to `main` deploys https://quanta1985.github.io/vn2000/. `homepage/` (gitignored, local only) holds the owner's separate personal-site pages that link to the app.

## Commands

```bash
node test/core.test.js            # geodesy/parser/exporter tests vs pyproj reference values (no deps)
node test/shp.test.js             # shapefile/zip/.prj round trips (no deps)
python test/shp_check.py          # cross-check shp.js against GDAL via geopandas; regenerates test/fixtures/gdal_vn2000.zip
python test/e2e.py [out_dir]      # Playwright smoke test: serves the folder, drives single/batch/KML/draw/DXF/SHP/PNG/lang/mobile, screenshots
python test/make_ref.py           # regenerate test/ref.json with pyproj (only when changing reference points)
python -m http.server 8765        # run locally → http://127.0.0.1:8765/index.html
git push                          # deploys the app (GitHub Pages, branch main, root); Actions runs the node tests
bash deploy.sh                    # local-only script: uploads the university-site redirect + homepage page/cards
```

There is no single-test runner: the test files are flat assert scripts (stop at the first failure). Syntax-check JS with `node --check <file>`.

The repo is public: never commit `homepage/`, `deploy.sh` or server details (all gitignored). The old university URL `/~quanta/vn2000/` is now only a redirect page (`homepage/vn2000/index.html`).

## Architecture

Script load order in `index.html` matters (plain globals, no modules): `vendor/leaflet` → `core.js` (`window.Core`) → `shp.js` (`window.Shp`) → `i18n.js` (`window.I18N`) → `collar.js` (`window.Collar`) → `mapimage.js` (`window.MapImage`) → `app.js` (IIFE, all UI).

- **`core.js`** — pure, dependency-free, also `require`-able from Node (that's what the tests use). Contains:
  - `PROVINCES`: the 34-province meridian table (name, merged-from, lon0). Lai Châu = 103°00′ is a deliberate owner decision (sources conflict).
  - Datum: 7-parameter Helmert VN-2000→WGS84 from TT 973/2001 = EPSG:6960, **Coordinate Frame** convention by default (`conv: 'cf'`); `'pv'` (Position Vector, legacy software) differs by ~0.7 m. Plain proj4 `+towgs84` with these signs is PV — don't "simplify" to proj4 without flipping rotation signs. Both datums use the WGS84 ellipsoid; height is dropped (2D).
  - `wgsToVn` iterates so that `vnToWgs(wgsToVn(p)) === p` exactly (round trip must return the user's digits); vs PROJ the forward result is within ~1.1 mm, which the tests tolerate.
  - Transverse Mercator: Krüger/Karney 6th-order series (`tmForward`/`tmInverse`). CRS objects from `CRS.wgs/utm/vnTm3/vnUtm`; for projected CRS the API uses Vietnamese convention **x = Northing (X), y = Easting (Y)**.
  - `parseText`: tolerant parser (any of space/tab/comma/semicolon/pipe, decimal commas, DMS with °′″, header lines, name/ID columns, swapped order). It scans adjacent numeric pairs for plausibility; for geo input it prefers a pair that fits Vietnam so a numeric ID column isn't read as latitude. Unparseable lines are reported as skipped, never guessed.
  - Exporters: `toKml` (escaped names, KML aabbggrr colors), `toCsv` (UTF-8 BOM, formula-injection guard), `toGeoJson`, `toDxf` (R12 ASCII; non-ASCII names encoded as `\U+XXXX` for AutoCAD), importers `fromKmlDoc`/`fromGeoJson`.
- **`app.js`** — Leaflet map, state, rendering, wiring. State object `S` persisted to `localStorage` key `vn2000-converter.v1` (features, settings, last map view); always validated on load. Converted batch results (`results`) are not persisted. User-supplied names must never reach HTML strings: build DOM with the `h()` helper; Leaflet tooltips get `Core.esc(name)` (Leaflet renders tooltip strings as HTML). Drawing is a small state machine (`tool`, `draft`, `finishDraft` with a double-click guard and snapping to existing points).
- **`collar.js`** — the map "sheet collar": a graduated neatline around the map with ticks/labels in the active VN-2000 grid (zoom ≥ 10, km) or lat/lon graticule (below), optional km grid lines, red cursor ticks, and the scale bar. `build(frame)` returns drawing primitives; the screen renders them as SVG (reading sizes from the map container's offsets, so CSS `--c-top/--c-side/--c-bottom` drive it) and `mapimage.js` renders the same primitives on a canvas.
- **`shp.js`** — dependency-free Shapefile writer/reader (Point/PolyLine/Polygon, Z/M and MultiPoint read; polygon holes dropped on read), UTF-8 `.dbf` + `.cpg`, ESRI-dialect `.prj` writer/parser (VN-2000 = `D_Vietnam_2000`, identical to GDAL's output; HN-72 rejected), and a ZIP writer (stored) / reader (deflate via the browser's `DecompressionStream`, passed in as `inflateRaw`). Coordinates are `[x=E|lon, y=N|lat]`. Node-requireable like core.js.
- **`mapimage.js`** — PNG export of the current view: refetches tiles with CORS one zoom finer for 2× output (all basemap layers are created with `crossOrigin: 'anonymous'` so the canvas is never tainted), draws features, the collar primitives, title, legend, scale bar, north arrow and credits.
- **`i18n.js`** — strings keyed for `data-i18n`, `data-i18n-ph`, `data-i18n-title` attributes and `t(key)`; add every new key to both `vi` and `en`.
- **`style.css`** — tokens on `:root`; light theme only (paper-sheet world). On ≤760px the margin column becomes a bottom sheet (`#panel[data-snap=peek|half|full]`); hover rules live in `@media (hover: hover)`.

## Design system

`DESIGN.md` (+ `.impeccable/design.json`) documents the visual system ("topographic sheet collar": paper/ink, square corners, Overpass + Overpass Mono tabular figures, contour-brown accent, map symbology red points / blue lines / green areas). `PRODUCT.md` holds product truth (users, constraints, copyright). The surface brief with the direction contract is `.impeccable/surfaces/index-html.md`. Follow these when changing UI. Fonts and Leaflet are self-hosted (`fonts/`, `vendor/`) — don't reintroduce CDN dependencies; only basemap tiles (Esri, OSM, OpenTopoMap, all keyless) load externally.

## homepage/

Local copies of the owner's personal site pages (`vn2000.html` app page, plus edited `index.html`/`software.html`) and `css/main.css`, which is that site's own design system — homepage pages must use its classes/tokens, not the app's style. Screenshots for it live in `homepage/img/software/vn2000*.webp` (provenance sidecars `*.webp.json` stay local). Before editing `index.html`/`software.html`, re-download them from the server, since the owner edits that site independently.

## Copyright

© 2026 Trần Anh Quân (Quan Tran-Anh), HUMG · REMOSAT Lab, USTH. All rights reserved (free to use online). Keep the footer/meta/README notices intact.
