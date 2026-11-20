/* Graduated neatline around the live map, lettered like a map sheet's collar.
 * Zoom >= GRID_ZOOM: projected grid of the active VN-2000 system (km ticks, optional grid lines).
 * Below that: geographic graticule (degrees/minutes). Cursor position is ticked in red on every edge.
 * build() returns drawing primitives; the screen renders them as SVG (numbers only, no user text),
 * the map-image export renders the same primitives on a canvas. */
(function (root) {
  'use strict';
  const GRID_ZOOM = 10;
  const GRID_STEPS = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const DEG_STEPS = [1 / 60, 2 / 60, 5 / 60, 10 / 60, 15 / 60, 30 / 60, 1, 2, 5, 10];   // degrees
  const TICK = 7, TARGET_TICKS = 6, CORNER = 28;   // px: no tick label closer than this to a corner
  const STYLE = `<style>.nl-in{fill:none;stroke:#111;stroke-width:1}.nl-out{fill:none;stroke:#111;stroke-width:2.5}.tk{stroke:#111;stroke-width:1.2}`
    + `.grid{stroke:#fafaf7;stroke-width:1;stroke-opacity:.75}.cur{stroke:#c8102e;stroke-width:2}`
    + `.sb0{fill:#111;stroke:#111}.sb1{fill:#fafaf7;stroke:#111}</style>`;

  const pickStep = (span, steps) => steps.find(s => span / s <= TARGET_TICKS) || steps[steps.length - 1];
  const fmtDeg = (v, step) => {
    const a = Math.abs(v), d = Math.floor(a + 1e-9), m = Math.round((a - d) * 60);
    return step >= 1 ? `${d}°` : `${d}°${String(m === 60 ? 0 : m).padStart(2, '0')}′`;
  };
  const fmtKm = (v, step) => step >= 1000 ? String(Math.round(v / 1000)) : (v / 1000).toFixed(1);
  const f1 = v => v.toFixed(1);

  /** Values along one edge interpolated linearly between its two ends (TM grid is near-linear across one view). */
  function edgeTicks(v0, v1, len, step) {
    const out = [], lo = Math.min(v0, v1), hi = Math.max(v0, v1);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const t = (v - v0) / (v1 - v0);
      if (t >= 0 && t <= 1) out.push({ v, p: t * len });
    }
    return out;
  }

  function toSvg(prims) {
    return prims.map(p => {
      if (p.t === 'line') return `<line x1="${f1(p.x1)}" y1="${f1(p.y1)}" x2="${f1(p.x2)}" y2="${f1(p.y2)}" class="${p.c}"/>`;
      if (p.t === 'rect') return `<rect x="${f1(p.x)}" y="${f1(p.y)}" width="${f1(p.w)}" height="${f1(p.h)}" class="${p.c}"/>`;
      const pos = p.rot ? `transform="translate(${f1(p.x)} ${f1(p.y)}) rotate(${p.rot})"` : `x="${f1(p.x)}" y="${f1(p.y)}"`;
      return `<text ${pos} text-anchor="${p.a}" class="${p.c || ''}">${p.s}</text>`;
    }).join('');
  }

  function Collar(map, svg, opts) {
    let showGrid = false, cursor = null, raf = 0;
    const host = svg.parentElement;

    /** Primitives for a map of size w×h placed at (x0,y0) inside a W×H sheet. */
    function build({ x0, y0, w, h, W, H, withCursor = true }) {
      const has = { top: y0 >= 20, left: x0 >= 20, right: W - x0 - w >= 20, bottom: H - y0 - h >= 20 };
      const ll = (px, py) => map.containerPointToLatLng([px, py]);
      const geo = map.getZoom() < GRID_ZOOM, crs = opts.crs(), conv = opts.conv();
      // value at each corner: grid → {e (Y), n (X)}; graticule → {e: lon, n: lat}
      const val = (px, py) => {
        const g = ll(px, py);
        if (geo) return { e: g.lng, n: g.lat };
        const p = Core.fromWgs(crs, g.lat, g.lng, conv); return { e: p.y, n: p.x };
      };
      const tl = val(0, 0), tr = val(w, 0), bl = val(0, h), br = val(w, h);
      const step = pickStep(Math.abs(tr.e - tl.e), geo ? DEG_STEPS : GRID_STEPS);
      const fmt = v => geo ? fmtDeg(v, step) : fmtKm(v, step);
      const prims = [];
      const line = (x1, y1, x2, y2, c) => prims.push({ t: 'line', x1, y1, x2, y2, c });
      const text = (x, y, s, a, c = '', rot = 0) => prims.push({ t: 'text', x, y, s, a, c, rot });

      // neatline: thin inner line on the map edge, heavy outer frame at the tick band
      prims.push({ t: 'rect', x: x0 - .5, y: y0 - .5, w: w + 1, h: h + 1, c: 'nl-in' });
      const ox = has.left ? x0 - 18 : x0, oy = has.top ? y0 - 18 : y0;
      const ow = (has.right ? x0 + w + 18 : x0 + w) - ox, oh = (has.bottom ? y0 + h + 18 : y0 + h) - oy;
      prims.push({ t: 'rect', x: ox, y: oy, w: ow, h: oh, c: 'nl-out' });

      let vert, horz;
      if (geo) {   // meridians are vertical and parallels horizontal in Web Mercator → place exactly
        const c = map.getCenter();
        const at = (lo, hi, f, len) => edgeTicks(lo, hi, 1, step).map(t => ({ v: t.v, p: f(t.v) })).filter(t => t.p >= 0 && t.p <= len);
        const lon = at(tl.e, tr.e, v => map.latLngToContainerPoint([c.lat, v]).x, w);
        const lat = at(bl.n, tl.n, v => map.latLngToContainerPoint([v, c.lng]).y, h);
        vert = [lon, lon]; horz = [lat, lat];
      } else {
        vert = [edgeTicks(tl.e, tr.e, w, step), edgeTicks(bl.e, br.e, w, step)];
        horz = [edgeTicks(tl.n, bl.n, h, step), edgeTicks(tr.n, br.n, h, step)];
      }
      if (showGrid && !geo) {   // grid lines join equal values on opposite edges
        vert[0].forEach(a => { const b = vert[1].find(q => q.v === a.v); if (b) line(x0 + a.p, y0, x0 + b.p, y0 + h, 'grid'); });
        horz[0].forEach(a => { const b = horz[1].find(q => q.v === a.v); if (b) line(x0, y0 + a.p, x0 + w, y0 + b.p, 'grid'); });
      }
      // labels sit inside the 18px band between neatline and frame; side labels run along the edge, as on a sheet.
      // A tick too close to a corner keeps its tick but drops its label, so it never collides with the corner or "km".
      const lab = (t, len) => t.p >= CORNER && t.p <= len - CORNER;
      if (has.top) vert[0].forEach(t => { line(x0 + t.p, y0, x0 + t.p, y0 - TICK, 'tk'); if (lab(t, w)) text(x0 + t.p, y0 - 9, fmt(t.v), 'middle'); });
      if (has.bottom) vert[1].forEach(t => { line(x0 + t.p, y0 + h, x0 + t.p, y0 + h + TICK, 'tk'); if (lab(t, w)) text(x0 + t.p, y0 + h + 16, fmt(t.v), 'middle'); });
      if (has.left) horz[0].forEach(t => { line(x0, y0 + t.p, x0 - 5, y0 + t.p, 'tk'); if (lab(t, h)) text(x0 - 8.5, y0 + t.p, fmt(t.v), 'middle', '', -90); });
      if (has.right) horz[1].forEach(t => { line(x0 + w, y0 + t.p, x0 + w + 5, y0 + t.p, 'tk'); if (lab(t, h)) text(x0 + w + 8.5, y0 + t.p, fmt(t.v), 'middle', '', 90); });
      if (has.top && has.left && !geo) text(x0 - 9, y0 - 9, 'km', 'end', 'unit');

      if (has.bottom && H - y0 - h >= 40) {   // sheet scale bar in the outer bottom band: four alternating segments
        const mpp = map.distance(ll(w / 2, h - 1), ll(w / 2 + 100, h - 1)) / 100;
        const nice = [1, 2, 5].flatMap(m => [1, 10, 100, 1000, 10000, 100000].map(e => m * e)).sort((a, b) => a - b);
        const len = [...nice].reverse().find(v => v / mpp <= 120) || 1, px = len / mpp, by = y0 + h + 24;
        for (let i = 0; i < 4; i++) prims.push({ t: 'rect', x: x0 + i * px / 4, y: by, w: px / 4, h: 5, c: i % 2 ? 'sb1' : 'sb0' });
        text(x0, by + 16, '0', 'middle');
        text(x0 + px, by + 16, len >= 1000 ? `${len / 1000} km` : `${len} m`, 'middle');
      }
      if (withCursor && cursor) {   // red cursor ticks on every drawn edge
        const c = map.latLngToContainerPoint(cursor);
        if (c.x >= 0 && c.x <= w && c.y >= 0 && c.y <= h) {
          if (has.top) line(x0 + c.x, y0, x0 + c.x, y0 - 16, 'cur');
          if (has.bottom) line(x0 + c.x, y0 + h, x0 + c.x, y0 + h + 16, 'cur');
          if (has.left) line(x0, y0 + c.y, x0 - 16, y0 + c.y, 'cur');
          if (has.right) line(x0 + w, y0 + c.y, x0 + w + 16, y0 + c.y, 'cur');
        }
      }
      return { prims, geo, step };
    }

    function draw() {
      raf = 0;
      const el = map.getContainer(), w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const { prims, geo, step } = build({ x0: el.offsetLeft, y0: el.offsetTop, w, h, W: host.clientWidth, H: host.clientHeight });
      svg.setAttribute('viewBox', `0 0 ${host.clientWidth} ${host.clientHeight}`);
      svg.innerHTML = STYLE + toSvg(prims);
      opts.onMode && opts.onMode(geo, step);
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
    map.on('move zoom resize', schedule);
    window.addEventListener('resize', schedule);
    return {
      draw: schedule,
      build,
      setGrid(on) { showGrid = on; schedule(); },
      setCursor(latlng) { cursor = latlng; schedule(); },
    };
  }
  root.Collar = Collar;
})(window);
