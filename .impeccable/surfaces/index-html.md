---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["style.css","app.js"]
---

# Surface: VN2000 converter app (index.html)

Mode: Operate. Audience: surveyors/cadastral staff, EIA consultants, students, field phone users. Task: convert single or batch coordinates, place/draw/measure on the map, export files. Constraint: map stays the dominant workspace (owner); phone keeps the map full-screen under a sheet.

## Direction contract

THESIS: The live map is a VN-2000 map sheet. A graduated neatline with lettered grid ticks frames it and re-letters itself in the active projection as you pan; the panel is the sheet's margin column (title, data, legend). Refuses the category default: a floating rounded glass card over an unframed web map.

OWN-WORLD: Sheet paper #fafaf7, ink #111, contour brown #a0522d for the sheet's own voice (meridian, sheet title, active rules), hydrography blue #1f6fb2 for lines and selection, vegetation green #6e9f4b for areas, survey red #c8102e for points. Overpass lettering in small caps for labels, Overpass Mono tabular figures for every coordinate, aligned on the decimal point. 2px ink rules between blocks, dotted leaders in result rows, square corners everywhere, a double rule where margin meets sheet.

STORY: The user sees which projection the sheet is in before anything else (meridian lettered in brown in the margin and on the neatline), types or pastes coordinates, reads all three systems in aligned figures, and sees the point land inside the graduated frame; exports leave from the same column.

FIRST VIEWPORT: Left margin column 380px: title block, meridian block (province select, meridian in large brown mono), tabs, input system, inputs, results with dotted leaders, black primary action, legend, copyright. Right: map inside a 30px collar; ticks every grid interval lettered in km on all four sides; a red cursor tick slides along top and left edges; sheet title line in the top collar, cursor readout and scale in the bottom collar; controls are square paper buttons inside the neatline's top-right corner; fly-to field top-left inside the frame.

FORM: Topographic sheet collar, grounded candidate 1 of 7 (IMPECCABLE'S PICK, chosen over the roll), seed:1efd7d81dc735e17. Kept raises: fixed tabular digit cells on the decimal point; phone sheet snaps peek/half/full.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

Live graduated neatline: ticks and km labels recomputed in the active VN-2000 zone on every move/zoom (interval 100 m to 10 km by zoom), optional km grid drawn inside; cursor ticks track the pointer.

## Unresolved

Dark theme dropped (paper sheet, office/field daylight scene).
