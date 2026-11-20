# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Surveyors and cadastral staff: batch lists of parcel corners and control points pasted from Excel or opened from TXT/CSV, converted and exported to DXF/KML/CSV for land files. Mostly office desktop.
- EIA and environment consultants: project sites, monitoring and sensitive-receptor points, KML for reports and Google Earth.
- Students in the owner's GIS / remote-sensing courses: learning VN-2000, UTM and WGS84; need explanation and clear feedback.
- Field users on phones: quick single-point checks and GPS location outdoors.

## Product Purpose

Convert coordinates between VN-2000 (central meridians of the 34 provinces after the 1 July 2025 merger), UTM (zone auto-detected) and WGS84, and carry the result straight to the map, to drawings and measurements, and to exchange files. Success: a user pastes messy coordinates and gets correct, PROJ-matching numbers and a usable file in seconds, with no account, key or install.

## Positioning

Built for the post-merger 34-province meridian table, with the VN-2000 7-parameter transformation in the EPSG:6960 convention (matches QGIS/PROJ to about 1 mm, round trip exact) and a switch for the legacy Position Vector convention. Forgiving input that cleans Vietnamese-style data (decimal commas, DMS, mixed separators, swapped X/Y). Entirely client-side.

## Operating Context

Data arrives from Excel sheets, survey TXT/CSV, Word tables and KML; results go to AutoCAD/MicroStation (DXF), Google Earth (KML), QGIS (GeoJSON) and Excel (CSV). Vietnamese X = Northing, Y = Easting convention. Hosted as static files on the owner's academic web space (plain HTTP; geolocation and Clipboard API unavailable there without HTTPS).

## Capabilities and Constraints

- Single-point live conversion; batch conversion with auto-correction and skipped-line report.
- Map-first layout with satellite, satellite + labels, OSM and topo basemaps (no API keys); cursor readout in three systems; fly-to coordinate; GPS.
- Draw points, lines, polygons; length/area on the VN-2000 grid; vertex editing; snapping to existing points.
- Export KML (with styling options), CSV, GeoJSON, DXF R12; import KML/GeoJSON.
- Bilingual: Vietnamese default, English.
- Must keep: map-first layout (full-screen map with the working panel over it) — confirmed by owner.
- Lai Châu meridian 103°00′ (sources conflict; flagged in the app).
- Static HTML/CSS/JS, Leaflet; no build step.

## Brand Commitments

- Author: Trần Anh Quân (Quan Tran-Anh), Department of Environment, Hanoi University of Mining and Geology (HUMG); REMOSAT Lab, University of Science and Technology of Hanoi (USTH); quantrananh.humg@gmail.com.
- Copyright: © 2026 Trần Anh Quân (Quan Tran-Anh). All rights reserved.
- The app is listed on the owner's homepage (remosat.usth.edu.vn/~quanta/) with a dedicated page and a card in Software; that page belongs to the homepage's existing visual system (css/main.css).

## Evidence on Hand

- Verification: test/core.test.js against pyproj reference values (test/ref.json); worst WGS→VN-2000 difference 1.07 mm.
- Sources for meridians: rtkvn.vn, viet-thanh.vn, dodacrtk.com, tracdiathanhdat.vn; EPSG:6960, EPSG:5896.
- No user counts, testimonials or adoption figures exist; do not invent them.

## Product Principles

1. Correct numbers first: every figure traceable to a stated method and parameter set.
2. Forgive the input, never the output: clean messy data, but skip rather than guess a coordinate.
3. The map is the workspace; the panel serves it.
4. One tool for office, classroom and field: dense where it helps a surveyor, explained where it helps a student.

## Accessibility & Inclusion

Vietnamese diacritics everywhere; readable outdoors on a phone; keyboard operable drawing (Enter/Esc/Backspace).
