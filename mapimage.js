/* Map image export: the current view as a framed sheet (collar, title, legend, scale bar, north arrow, credits) → PNG.
 * Tiles are fetched again with CORS (Esri, OSM, OpenTopoMap all send Access-Control-Allow-Origin: *), one zoom finer
 * where available, so the 2× image is sharp. Everything is drawn from numbers and plain text with canvas fillText. */
(function (root) {
  'use strict';
  const SCALE = 2, MARGIN = { top: 50, side: 46, bottom: 46, band: 58 }, MAX_TILES = 400;
  const MAX_PIXELS = 16e6, TILE_TIMEOUT = 15000;   // iOS Safari canvas limit ≈ 16.7 MP; a stalled tile must not block export
  const INK = '#111', PAPER = '#fafaf7', INK3 = '#66655e', BROWN = '#a0522d';
  const STROKE = { 'nl-in': [INK, 1], 'nl-out': [INK, 2.5], tk: [INK, 1.2], grid: ['rgba(250,250,247,.75)', 1], sb0: [INK, 1], sb1: [INK, 1] };
  const FILL = { sb0: INK, sb1: PAPER };
  // same drawings as the icon sprite in index.html (24-unit viewBox)
  const SYM = { trig: 'M12 4 21 19H3z M13.4 14a1.4 1.4 0 1 1-2.8 0a1.4 1.4 0 1 1 2.8 0', pt: 'M16.5 12a4.5 4.5 0 1 1-9 0a4.5 4.5 0 1 1 9 0M12 3v4M12 17v4M3 12h4M17 12h4' };

  const loadImg = url => new Promise(res => {
    const i = new Image(); i.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { i.src = ''; res(null); }, TILE_TIMEOUT);
    i.onload = () => { clearTimeout(timer); res(i); };
    i.onerror = () => { clearTimeout(timer); res(null); };   // a missing tile leaves paper, never fails the export
    i.src = url;
  });

  /** tiles of one layer covering the view, computed synchronously so the plan matches the vectors and collar */
  function tilePlan(map, layer, w, h, finer) {
    const z = map.getZoom(), o = layer.options, maxN = o.maxNativeZoom ?? o.maxZoom ?? 18;
    const tz = Math.min(Math.round(z) + (finer ? 1 : 0), maxN), k = 2 ** (tz - z), n = 2 ** tz;
    const org = map.project(map.containerPointToLatLng([0, 0]), z);
    const tx0 = Math.floor(org.x * k / 256), tx1 = Math.floor((org.x + w) * k / 256);
    const ty0 = Math.max(0, Math.floor(org.y * k / 256)), ty1 = Math.min(n - 1, Math.floor((org.y + h) * k / 256));
    const subs = o.subdomains || [], jobs = [];
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) {
      const url = L.Util.template(layer._url, { ...o, s: subs.length ? subs[Math.abs(x + y) % subs.length] : '', x: ((x % n) + n) % n, y, z: tz, r: '' });
      jobs.push({ url, x: x * 256 / k - org.x, y: y * 256 / k - org.y, s: 256 / k });
    }
    return { jobs, alpha: o.opacity ?? 1 };
  }
  const tileCount = (w, h) => (Math.ceil(w / 128) + 1) * (Math.ceil(h / 128) + 1);   // tiles per layer at one zoom finer

  function drawSymbol(ctx, kind, x, y, color) {
    ctx.save(); ctx.translate(x - 11, y - 11 - (kind === 'trig' ? 2 : 0)); ctx.scale(22 / 24, 22 / 24);
    const p = new Path2D(SYM[kind]);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = PAPER; ctx.lineWidth = 5; ctx.stroke(p);   // paper halo, as the drop-shadow on screen
    ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.stroke(p);
    ctx.restore();
  }
  function haloText(ctx, s, x, y, font) {
    ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.strokeStyle = PAPER; ctx.lineWidth = 3.5; ctx.strokeText(s, x, y);
    ctx.fillStyle = INK; ctx.fillText(s, x, y);
  }
  function drawVectors(ctx, items, fonts) {
    items.filter(v => v.kind === 'poly' || v.kind === 'line').forEach(v => {
      ctx.beginPath(); v.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      if (v.kind === 'poly') { ctx.closePath(); ctx.globalAlpha = .22; ctx.fillStyle = v.color; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = v.color; ctx.lineWidth = 3; ctx.stroke();
    });
    items.filter(v => v.kind === 'trig' || v.kind === 'pt').forEach(v => {
      drawSymbol(ctx, v.kind, v.pts[0].x, v.pts[0].y, v.color);
      if (v.label) haloText(ctx, v.label, v.pts[0].x + 14, v.pts[0].y - (v.kind === 'pt' ? 12 : 0), `700 12px ${fonts.sans}`);
    });
  }
  function drawPrims(ctx, prims, fonts) {
    prims.forEach(p => {
      if (p.t === 'text') {
        ctx.save(); ctx.translate(p.x, p.y); if (p.rot) ctx.rotate(p.rot * Math.PI / 180);
        ctx.font = p.c === 'unit' ? `700 9.5px ${fonts.sans}` : `10.5px ${fonts.mono}`;
        ctx.fillStyle = p.c === 'unit' ? BROWN : INK; ctx.textBaseline = 'alphabetic';
        ctx.textAlign = p.a === 'middle' ? 'center' : p.a; ctx.fillText(p.s, 0, 0); ctx.restore();
        return;
      }
      const [stroke, lw] = STROKE[p.c] || [INK, 1];
      ctx.strokeStyle = stroke; ctx.lineWidth = lw;
      if (p.t === 'line') { ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke(); return; }
      if (FILL[p.c]) { ctx.fillStyle = FILL[p.c]; ctx.fillRect(p.x, p.y, p.w, p.h); }
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    });
  }
  function northArrow(ctx, x, y, fonts) {   // x,y = tip
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y + 14); ctx.lineTo(x, y + 11); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14); ctx.lineTo(x, y + 11); ctx.closePath(); ctx.stroke();
    ctx.font = `700 10px ${fonts.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('N', x, y + 25);
  }
  function legendRow(ctx, items, x, y, fonts) {
    ctx.font = `12px ${fonts.sans}`;
    items.forEach(it => {
      if (it.sym === 'line') { ctx.strokeStyle = it.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18, y); ctx.stroke(); }
      else if (it.sym === 'poly') { ctx.globalAlpha = .22; ctx.fillStyle = it.color; ctx.fillRect(x + 1, y - 6, 16, 12); ctx.globalAlpha = 1; ctx.strokeStyle = it.color; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y - 6, 16, 12); }
      else drawSymbol(ctx, it.sym, x + 9, y, it.color);
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(it.label, x + 24, y);
      x += 24 + ctx.measureText(it.label).width + 18;
    });
  }

  /**
   * @param map Leaflet map; opts: {layers: TileLayer[], build: collar.build, vectors, legend:[{sym,color,label}],
   *   title, date, credit, attribution}
   * @returns Promise<{blob: Blob, tilesOk: boolean}> PNG, and whether any basemap tile loaded
   */
  async function render(map, opts) {
    const el = map.getContainer(), w = el.clientWidth, h = el.clientHeight;
    const x0 = MARGIN.side, y0 = MARGIN.top, W = w + 2 * MARGIN.side, H = MARGIN.top + h + MARGIN.bottom + MARGIN.band;
    const css = getComputedStyle(document.documentElement);
    const fonts = { sans: css.getPropertyValue('--font').trim() || 'sans-serif', mono: css.getPropertyValue('--mono').trim() || 'monospace' };
    const scale = Math.min(SCALE, Math.sqrt(MAX_PIXELS / (W * H)));
    const finer = scale > 1.5 && tileCount(w, h) * opts.layers.length <= MAX_TILES;
    const plans = opts.layers.map(l => tilePlan(map, l, w, h, finer));
    const prims = opts.build({ x0, y0, w, h, W, H: y0 + h + MARGIN.bottom, withCursor: false }).prims;
    // everything above reads the map synchronously; from here on panning cannot change the picture
    await Promise.all([`700 12px ${fonts.sans}`, `12px ${fonts.sans}`, `10.5px ${fonts.mono}`].map(f => document.fonts.load(f, 'Ặ0°′')));
    const tiles = await Promise.all(plans.map(async p => ({ ...p, jobs: await Promise.all(p.jobs.map(async j => ({ ...j, img: await loadImg(j.url) }))) })));
    const tilesOk = tiles.some(p => p.jobs.some(j => j.img));

    const cv = document.createElement('canvas'); cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    const ctx = cv.getContext('2d'); ctx.scale(scale, scale);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);

    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    ctx.fillStyle = '#dcd8cc'; ctx.fillRect(x0, y0, w, h);
    ctx.translate(x0, y0);
    tiles.forEach(({ jobs, alpha }) => { ctx.globalAlpha = alpha; jobs.forEach(j => j.img && ctx.drawImage(j.img, j.x, j.y, j.s + .5, j.s + .5)); });
    ctx.globalAlpha = 1;
    drawVectors(ctx, opts.vectors, fonts);
    ctx.restore();

    drawPrims(ctx, prims, fonts);
    northArrow(ctx, x0 + w - 8, y0 + h + 20, fonts);

    // title over the frame, date at right — like a sheet's top margin
    ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 13px ${fonts.sans}`; ctx.textAlign = 'left'; ctx.fillText(opts.title, x0 - 18, 22);
    ctx.font = `11px ${fonts.mono}`; ctx.textAlign = 'right'; ctx.fillText(opts.date, x0 + w + 18, 22);

    const by = y0 + h + MARGIN.bottom + 12;
    legendRow(ctx, opts.legend, x0 - 18, by, fonts);
    ctx.font = `10.5px ${fonts.sans}`; ctx.fillStyle = INK3; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(opts.credit, x0 - 18, by + 24);
    ctx.fillText(opts.attribution, x0 - 18, by + 38);

    return new Promise((res, rej) => {
      try { cv.toBlob(b => b ? res({ blob: b, tilesOk }) : rej(new Error('canvas export failed')), 'image/png'); }
      catch (e) { rej(e); }   // a tainted canvas (tile without CORS) would throw here
    });
  }
  root.MapImage = { render };
})(window);
