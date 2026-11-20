---
name: VN2000 ⇄ WGS84
description: Coordinate converter whose live map is lettered and framed like a VN-2000 topographic map sheet.
colors:
  paper: "#fafaf7"
  paper-2: "#f0eee6"
  paper-3: "#e4e1d6"
  white: "#ffffff"
  ink: "#111111"
  ink-2: "#3a3935"
  ink-3: "#66655e"
  hair: "#cfccc1"
  map-ground: "#dcd8cc"
  brown: "#a0522d"
  blue: "#1f6fb2"
  green: "#5d8f3d"
  red: "#c8102e"
typography:
  display:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "25px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 800
  title:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    letterSpacing: "0.06em"
  body:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.1em"
  button:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 700
    letterSpacing: "0.06em"
  figure-display:
    fontFamily: "Overpass Mono, ui-monospace, Consolas, monospace"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  figure:
    fontFamily: "Overpass Mono, ui-monospace, Consolas, monospace"
    fontSize: "15.5px"
    fontWeight: 400
    fontFeature: "tnum"
  figure-small:
    fontFamily: "Overpass Mono, ui-monospace, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "tnum"
  collar:
    fontFamily: "Overpass Mono, ui-monospace, Consolas, monospace"
    fontSize: "10.5px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  none: "0px"
spacing:
  margin-column: "380px"
  gutter: "22px"
  gutter-phone: "16px"
  pane-gap: "14px"
  stack-gap: "12px"
  control-gap: "8px"
  collar-top: "44px"
  collar-side: "46px"
  collar-bottom: "44px"
  phone-peek: "104px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.brown}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
    height: "38px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-2}"
  button-ghost:
    textColor: "{colors.ink-2}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "5px 9px"
    height: "32px"
  input-field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
    padding: "7px 9px"
  segment-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "6px 12px"
  tab:
    textColor: "{colors.ink-3}"
    typography: "{typography.label}"
    padding: "11px 0 10px"
  tab-active:
    textColor: "{colors.ink}"
  map-control:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    size: "36px"
  map-control-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "9px 16px"
  toast-error:
    backgroundColor: "{colors.red}"
    textColor: "{colors.paper}"
---

# Design System: VN2000 ⇄ WGS84

## Overview

**Creative North Star: "The Topographic Sheet Collar"**

The live web map is treated as a printed VN-2000 map sheet. A graduated neatline frames it on all four sides, lettered in kilometres of the active VN-2000 zone (or in degrees and minutes when zoomed out), and it re-letters itself on every pan and zoom. The working panel is the sheet's margin column: title block, meridian block, data, legend and copyright, stacked and separated by heavy ink rules the way a sheet's marginalia are. Everything a surveyor reads is a figure; every figure is set in tabular monospace.

The palette is cartographic, not decorative: warm sheet paper and near-black plate ink carry the structure, contour brown is the sheet's own voice (the active meridian, the projection name, section heads), and survey red, hydrography blue and vegetation green are reserved for what lands on the map. The world is light only; a paper sheet in office and field daylight. Density is a surveyor's density: small tracked capitals for labels, compact rows with dotted leaders, no cards and no rounded corners.

The world refuses the category default for map tools: a floating, rounded, translucent card over an unframed web map.

**Key Characteristics:**
- Live graduated neatline around the map: thin inner line, heavy outer frame, ticks lettered in km, red cursor ticks on every edge, alternating-segment scale bar in the bottom band.
- Margin column at 380px, divided by 2px ink rules, meeting the sheet with a 4px double rule.
- Overpass lettering in tracked small capitals for labels; Overpass Mono tabular figures for every coordinate, meridian, parameter and count.
- Square corners everywhere; solid ink fill marks the active, selected or primary state.
- Shadows only on objects that float over the map; the paper itself is flat.
- On phones the margin column becomes a bottom sheet snapping peek / half / full over a full-screen map.

## Colors

A printed-sheet palette: paper and ink do the work, one brown speaks for the sheet, three symbology hues speak for the data.

### Primary
- **Contour Brown** (`brown`): the sheet's own voice. The large central-meridian figure, the projection name in the sheet title line, result group heads, the "km" unit on the collar, the active basemap and sub-tab rules, the caret, text selection tint, the drop-zone outline and the primary button's hover. Never used to symbolise a data feature, except as the dashed draft line while a feature is being drawn.

### Secondary
- **Hydrography Blue** (`blue`): lines on the map and in the legend, the selected point marker, the GPS dot and accuracy circle, links, and every focus ring (2px outline or 2px ring on fields).

### Tertiary
- **Survey Red** (`red`): points. Converted points (trig-triangle symbol), drawn points (cross-hair symbol), result dots, the red cursor ticks on the neatline, destructive actions, error toasts and out-of-range warnings.
- **Vegetation Green** (`green`): polygons. Area outlines and their 22% fill on the map, the legend swatch.

### Neutral
- **Sheet Paper** (`paper`): page, margin column, collar bands, floating controls, dialogs, popups, and the text colour on ink fills.
- **Margin Tint** (`paper-2`): hover wash, selected list row, pre/log wells, scrollbar track.
- **Pressed Paper** (`paper-3`): hover on the small copy buttons.
- **Field White** (`white`): input and select wells only, so that writable fields read as cut into the paper.
- **Plate Ink** (`ink`): text, every rule and border, the neatline, primary buttons and all active fills.
- **Soft Ink** (`ink-2`): secondary text, ghost button text, legend text, collar corner lettering.
- **Collar Grey** (`ink-3`): labels, hints, inactive tabs, dotted leaders, secondary figures in tables.
- **Hairline** (`hair`): 1px dividers inside lists, tables, control stacks and popups.
- **Unprinted Ground** (`map-ground`): the map canvas before tiles load.

### Named Rules
**The Sheet Voice Rule.** Contour brown belongs to the sheet, not the data: meridian, projection name, section heads, active rules. If a brown mark could be mistaken for a feature, it is wrong.

**The Symbology Rule.** Red is points, blue is lines (and selection and focus), green is areas, on the map, in the legend and in the feature list icons alike. These hues never decorate.

**The Ink Fill Rule.** Active, selected, pressed-on and primary states are solid plate ink with paper text. There is no tinted "selected" colour.

## Typography

**Lettering Font:** Overpass (with system-ui, sans-serif), self-hosted, weights 400 / 600 / 800 (700 rendered from the same files), Vietnamese, Latin and Latin-Extended subsets.
**Figure Font:** Overpass Mono (with ui-monospace, Consolas, monospace), self-hosted with the same subsets, always with `font-variant-numeric: tabular-nums`.

**Character:** Overpass is highway-signage lettering, which reads like the engraved capitals of a map collar; its mono sibling gives every coordinate a fixed digit cell so columns of figures line up. Full Vietnamese diacritic coverage is a requirement, not an option.

### Hierarchy
- **Display** (800, 25px, 1.1; 21px on phones): the product name in the title block. The ⇄ in it is brown at 600.
- **Headline** (800, 19px): section heads in the Info tab.
- **Title** (800, 15px, uppercase, 0.06em): dialog titles; popup titles at 14px (set in mono when the title is a coordinate).
- **Body** (400, 14px, 1.45): running text; Info paragraphs at 13.5px in soft ink; hints at 12.5px in collar grey.
- **Label** (700, 11px, uppercase, 0.08 to 0.1em): field labels, table heads, legend-adjacent lettering, sub-heads in brown at 11.5 to 12px. The sheet title line in the top collar is the same lettering at 800, 11px, 0.14em.
- **Button** (700, 12.5px, uppercase, 0.06em; 11.5px small): every button and tool label.
- **Figure Display** (mono 600, 30px, 1, -0.02em, brown): the active central meridian.
- **Figure** (mono 400, 15.5px): single-point results and coordinate inputs (15px).
- **Figure Small** (mono, 11.5 to 12px): tables, meta lines, DMS, popups, the bottom-collar readout.
- **Collar** (mono, 10.5px; corner lettering 9px): neatline tick labels and scale-bar figures.

### Named Rules
**The Figures-Are-Mono Rule.** Every coordinate, meridian, parameter, length, area and count is Overpass Mono with tabular numerals; numeric table columns are right-aligned. Proportional digits never carry a measured value.

**The Lettering Rule.** Uppercase with tracking is for small lettering only (labels, buttons, tabs, sheet title, dialog titles, at 15px and below). Running text and the display title stay in sentence case.

## Layout

The page itself never scrolls: the root is clipped to the viewport on sheet paper, and only the tab body, tables and lists scroll inside the margin column. Two fixed regions on desktop. The margin column sits at the left (`margin-column`, 380px), full height, with a 22px side gutter; it stacks title block, meridian block, tabs, a scrolling tab body and a footer (legend + copyright), each block separated by a 2px ink rule. The sheet fills the rest. Inside it the map is inset by the collar (`collar-top` 44px, `collar-side` 46px, `collar-bottom` 44px): an inner 18px tick band holds ticks and lettering, the outer band holds the sheet title line (top, 22px tall) and the three-system cursor readout (bottom, right-aligned) with the scale bar below the map.

Over the map, inside the neatline: the fly-to field top-left (38px tall, up to 360px wide), the control column top-right (36px square buttons in stacked groups, 8px apart, basemap list opening below), the drawing HUD bottom-centre. Rhythm inside the column is tight and regular: 14px between pane sections, 12px between stacked rows, 6 to 8px between paired controls.

**Phone (≤760px).** The map goes full-screen; side and bottom collar bands collapse (the top band shrinks to 26px and the left band keeps a 34px strip), the sheet title and readout are hidden and Leaflet's own scale line returns. The margin column becomes a bottom sheet 90dvh tall with a 4px double top rule and a drag handle, snapping to peek (104px visible), half (translated 42dvh) and full; gutters drop to 16px; export buttons stay in three columns (CSV, KML…, GeoJSON / SHP…, DXF…, PNG).

### Named Rules
**The Framed Map Rule.** The map is never shown unframed on desktop: the neatline, its lettering and the cursor ticks are always drawn around it.

**The Margin Column Rule.** The panel is the sheet's margin, attached to the edge and divided by rules; it is never a floating card over the map.

## Elevation & Depth

The paper is flat. The margin column, the collar and every block inside the column carry no shadow; hierarchy comes from rule weight (4px double, 2px ink, 1px ink, 1px hairline) and from solid ink fills. Soft ink-tinted shadows appear only on objects that float over the map surface, scaled by how far they float.

### Shadow Vocabulary
- **Control lift** (`box-shadow: 0 2px 8px rgba(17, 17, 17, .18)`): fly-to field and map control groups.
- **Popover lift** (`box-shadow: 0 4px 14px rgba(17, 17, 17, .22)`): basemap list and drawing HUD.
- **Popup lift** (`box-shadow: 0 6px 20px rgba(17, 17, 17, .25)`): map popups.
- **Dialog lift** (`box-shadow: 0 12px 40px rgba(17, 17, 17, .35)`, backdrop `rgba(17, 17, 17, .45)`): the KML options dialog and the export coordinate-system dialog (SHP/DXF).
- **Sheet lift** (`box-shadow: 0 -8px 24px rgba(17, 17, 17, .22)`): the phone bottom sheet.
- **Paper halo** (drop-shadow / text-shadow in sheet paper): map symbols and point labels, so they read on imagery like knocked-out print.

### Named Rules
**The Paper-Flat Rule.** Nothing on the paper casts a shadow. A shadow means "this floats over the map", and nothing else.

## Shapes

Square everywhere (`rounded.none`, 0px): buttons, fields, segmented controls, tool grid, map controls, popups (including Leaflet's), dialog, toast, vertex handles. Form is drawn with rules rather than fills: 1px ink outlines around controls, 2px ink rules between blocks and above result groups, 1px dotted leaders running from a result label to its figure, a 3px inset underline for the active tab (ink) or sub-tab (brown), a 3px inset left bar for the active basemap. The sole circle is the GPS position dot, which is a map symbol. Line icons are inline SVG, 18px, 1.7 stroke, square caps and mitred joins.

### Named Rules
**The Square Corner Rule.** Corner radius is zero. A round shape is allowed only when it is a map symbol.

## Components

### Buttons
Engraved and blunt: uppercase lettering, square, outlined in ink.
- **Shape:** square (0px), 1px ink border, min height 38px (32px small).
- **Primary:** plate ink fill, paper text, 8px 14px padding.
- **Secondary:** paper fill, ink text and border.
- **Ghost:** no border or fill, soft-ink text; used for toolbars and secondary file actions.
- **Danger:** secondary or ghost with survey red text.
- **Hover / Focus / Active:** primary hovers to contour brown (fill and border); secondary to margin tint; ghost gains an ink border on paper. Pressed buttons drop 1px. Focus is a 2px hydrography-blue outline, offset 2px. Colour transitions 0.15s.

### Segmented controls and tabs
- **Segmented:** a 1px ink box divided by 1px ink lines; the active segment is an ink fill with paper text. Used for input system, language and full-width choices.
- **Line segments (sub-tabs):** no box, a hairline under the row, inactive in collar grey; the active one gets a 3px brown inset underline.
- **Tabs:** full-width, label lettering, between a 2px ink rule above and a 1px ink rule below; active is ink with a 3px ink inset underline; hover is margin tint.

### Inputs / Fields
- **Style:** field-white well, 1px ink border, square, 7px 9px padding, mono figures for coordinates, brown caret. Selects use lettering at 600 with a small ink triangle.
- **Focus:** 2px hydrography-blue ring (box-shadow), transition 0.15s.
- **Labels:** label lettering in collar grey above the field.

### Result rows
The signature of the margin column. Each result group opens with a 2px ink rule and a brown label head with its system name in mono collar grey; each row runs label, dotted leader, mono figure, copy button. When no point has been entered, the group shows a muted worked example: a sentence-case hint line in body lettering (12.5px, collar grey) led by one brown tag in label caps (11px, 800, "VÍ DỤ" / "Example"), then the full result rules with every figure in collar grey. Warnings sit in a 1px red box.

### Popups
Square paper popup, 1px ink border, popup lift. A title (mono when it is a coordinate), then rows of brown label, mono figure and copy button between hairlines. Coordinate values wrap only between label-and-value pairs ("E 588782.095" / "N 2327766.405"), never inside one.

### Tables
2px ink rule above, 1px below, sticky label-lettered heads with a 1px ink inset underline, hairline row rules, right-aligned mono figure columns, row index in brown mono, margin-tint hover.

### Map controls
Square paper buttons (36px) stacked in 1px-ink groups with hairline separators, control lift shadow; toggled or expanded buttons fill with ink. The basemap list is a paper stack whose active row carries a 3px brown left bar.

### Collar (signature)
An SVG drawn over the sheet from numbers only. Inner neatline 1px ink on the map edge; outer frame 2.5px ink 18px out; ticks 1.2px ink, 7px long on top and bottom, 5px on the sides; tick lettering in collar mono, side labels rotated to run along the edge; "km" unit in brown lettering in the top-left corner (grid mode only). A tick within 28px of a corner keeps its tick but drops its label, so nothing collides with the corner or the unit. Tick interval steps 100 m to 100 km (or 1′ to 10°) to give about six ticks per edge. The optional km grid joins equal values across the map in paper at 75% opacity. Cursor position is marked by 16px survey-red ticks (2px) on every drawn edge. The scale bar is four alternating ink/paper segments, 5px tall, sized to a round 1/2/5 length within 120px.

### Exported map image (PNG)
The same sheet, printed: the map view at 2× on sheet paper, framed by the identical collar primitives (drawn on a canvas instead of SVG, no cursor ticks). Top margin: the sheet title line in Overpass 700 13px at left, the date in mono 11px at right. Bottom collar: the scale bar at left, a north arrow (half-filled ink arrowhead, "N" in 700 10px) at right. Below: a legend row of only the symbol types present (same symbols and colours as the map, 12px labels), then a credit line and the basemap attribution in collar grey 10.5px. Map symbols and point labels keep their paper halo.

### Map symbology
Converted points: red trig triangle with centre dot. Drawn points: red cross-hair circle; selected turns blue. Lines: 3px blue. Polygons: 3px green outline, 22% green fill. Selected feature: 3.5px ink, dashed 10/5. Drafting: 2.5px brown dashed 6/5 with paper vertices ringed in ink. Vertex handles: 11px paper squares, 2px ink border. All marks carry a paper halo.

### Toast
Ink bar, paper text, 13px at 600, square, rising 12px into place over 0.3s on the house ease; survey red for errors.

## Do's and Don'ts

### Do:
- **Do** letter every coordinate, meridian, parameter and count in Overpass Mono with tabular numerals.
- **Do** separate margin-column blocks with 2px ink rules, and meet the sheet with the 4px double rule.
- **Do** keep red for points, blue for lines, selection and focus, green for areas, on the map and in the legend alike.
- **Do** mark active and primary states with a solid ink fill and paper text.
- **Do** keep the graduated neatline, its lettering and the red cursor ticks around the map on desktop.
- **Do** use the house ease (`cubic-bezier(.16, 1, .3, 1)`) for motion that moves things, and drop all transitions under reduced motion.

### Don't:
- **Don't** float the panel as a rounded, translucent card over an unframed map.
- **Don't** round corners; the only circle is a map symbol.
- **Don't** use contour brown to symbolise a data feature.
- **Don't** add shadows to anything sitting on the paper; shadow means floating over the map.
- **Don't** set measured values in proportional figures, or let a coordinate value break across lines.
- **Don't** add a dark theme; the world is a paper sheet in daylight.

The owner's separate homepage pages under `homepage/` follow their pre-existing site system (`homepage/css/main.css`) and are outside this document.
