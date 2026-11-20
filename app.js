/* UI: map, converter, drawing, import/export. Depends on Leaflet, Core (core.js), I18N (i18n.js). */
(() => {
  'use strict';
  const C = window.Core, Shp = window.Shp, $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const KEY = 'vn2000-converter.v1';
  const VN_BOX = { s: 6, n: 24, w: 101, e: 118 };       // generous bbox incl. islands
  // sheet symbology: survey red points, hydrography blue lines, vegetation green areas, ink for selection
  const COLORS = { Point: '#c8102e', LineString: '#1f6fb2', Polygon: '#5d8f3d', sel: '#111111', res: '#c8102e' };
  const ICON_OF = { Point: 'i-point', LineString: 'i-line', Polygon: 'i-poly' };
  const LABEL_LIMIT = 300;                                // permanent labels only for small sets
  const SYMBOL_LIMIT = 1500;                              // above this, converted points draw as canvas dots
  const MAX_IMPORT = 5000;                                // features per import; more would stall the list and storage

  // ---------- state ----------
  const DEFAULTS = { lang: 'vi', grid: false, prov: 'p:28', customLon0: 105.75, inCrs: 'vn', utmZone: 48, mode: 'single', order: 'auto',
    conv: 'cf', basemap: 'hybrid', expCrs: 'vn', features: [], kml: { icon: 'circle', pointColor: '#ff5a1f', iconScale: 1, labelScale: 0.9, lineColor: '#ffd400',
      lineWidth: 2.5, fillColor: '#14b8a6', fillOpacity: 30, showLabels: true, description: true, folders: true, geom: 'Point' } };
  const S = (() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      const features = Array.isArray(s.features) ? s.features.filter(validFeature) : [];
      return { ...DEFAULTS, ...s, kml: { ...DEFAULTS.kml, ...(s.kml || {}) }, features };
    } catch { return { ...DEFAULTS }; }
  })();
  if (!/^p:\d+$|^custom$|^u4[89]$/.test(S.prov) || (S.prov.startsWith('p:') && !C.PROVINCES[+S.prov.slice(2)])) S.prov = DEFAULTS.prov;
  let saveTimer;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: keep in memory */ } }, 250); };
  function validFeature(f) {
    return f && typeof f.name === 'string' && typeof f.id === 'string' && ['Point', 'LineString', 'Polygon'].includes(f.type) && Array.isArray(f.coords) && f.coords.length
      && f.coords.every(c => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
  }
  let results = [], lastInput = null, selId = null, tool = 'select', draft = [];

  // ---------- helpers ----------
  const t = k => (I18N[S.lang] && I18N[S.lang][k]) || I18N.vi[k] || k;
  const M = v => C.fmt(v, 3), D = v => C.fmt(v, 8);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(Infinity).forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  }
  function icon(id) {
    const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'), u = document.createElementNS(ns, 'use');
    u.setAttribute('href', '#' + id); s.append(u); return s;
  }
  let toastTimer;
  function toast(msg, isErr) {
    const el = $('#toast'); el.textContent = msg; el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'toast'; }, isErr ? 4200 : 1800);
  }
  async function copyText(s) {
    try { await navigator.clipboard.writeText(s); }
    catch {   // insecure context (plain http) → legacy path
      const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = s; document.body.append(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast(`${t('copied')}: ${s.length > 60 ? s.slice(0, 60) + '…' : s}`);
  }
  const copyBtn = text => h('button', { type: 'button', class: 'copy', title: 'Copy', onclick: e => { e.stopPropagation(); copyText(typeof text === 'function' ? text() : text); } }, icon('i-copy'));
  function download(name, content, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const inVn = (lat, lon) => lat >= VN_BOX.s && lat <= VN_BOX.n && lon >= VN_BOX.w && lon <= VN_BOX.e;
  const fmtLen = m => m < 1000 ? `${m.toFixed(2)} m` : `${(m / 1000).toFixed(3)} km`;
  const fmtArea = a => a < 10000 ? `${a.toFixed(1)} m²` : `${(a / 10000).toFixed(4)} ha (${Math.round(a).toLocaleString()} m²)`;
  function parseMeridian(s) {
    const tok = C.splitLine(String(s).includes('°') ? s : s.replace(/^(\d+)\s+(\d+(?:\.\d+)?)$/, '$1°$2′'))[0];
    const v = Number(tok); return Number.isFinite(v) && v >= 96 && v <= 120 ? v : null;
  }

  // ---------- CRS helpers ----------
  function vnCrs() {
    if (S.prov === 'custom') return C.CRS.vnTm3(S.customLon0);
    if (S.prov === 'u48' || S.prov === 'u49') return C.CRS.vnUtm(+S.prov.slice(1));
    return C.CRS.vnTm3(C.PROVINCES[+S.prov.slice(2)].lon0);
  }
  const vnLabel = () => { const c = vnCrs(); return c.zone ? `VN-2000 UTM ${c.zone}N` : `VN-2000 ${C.fmtMeridian(c.lon0)}`; };
  const inputCrs = () => S.inCrs === 'wgs' ? C.CRS.wgs() : S.inCrs === 'utm' ? C.CRS.utm(S.utmZone) : vnCrs();
  const inputKind = () => S.inCrs === 'wgs' ? 'geo' : 'proj';
  function all(lat, lon) { return { lat, lon, utm: C.toUtmAuto(lat, lon), vn: C.fromWgs(vnCrs(), lat, lon, S.conv) }; }
  const projectVn = (lat, lon) => C.fromWgs(vnCrs(), lat, lon, S.conv);
  function coordRows(lat, lon) {
    const a = all(lat, lon);
    return [
      ['WGS84', `${D(lat)}, ${D(lon)}`, `${D(lat)}\t${D(lon)}`],
      ['DMS', `${C.toDms(lat, 'N', 'S')} ${C.toDms(lon, 'E', 'W')}`, `${C.toDms(lat, 'N', 'S')} ${C.toDms(lon, 'E', 'W')}`],
      [`UTM ${a.utm.zone}N`, `E ${M(a.utm.e)}  N ${M(a.utm.n)}`, `${M(a.utm.e)}\t${M(a.utm.n)}`],
      [vnLabel().replace('VN-2000 ', 'VN '), `X ${M(a.vn.x)}  Y ${M(a.vn.y)}`, `${M(a.vn.x)}\t${M(a.vn.y)}`],
    ];
  }
  // a line may break only between label+value pairs, never inside one ("E 588782.095" / "N 2327766.405")
  const pairs = v => v.split(/ {2}|(?<=,) |(?<=″[NS]) (?=\d)/).map((part, i) => [i ? ' ' : null, h('span', { class: 'nw' }, part)]);
  function coordPopup(title, lat, lon, extra) {
    return h('div', { class: 'pop' }, h('h5', { class: /^[\d\s.,°′″'"NSEWnsew+-]+$/.test(title) ? 'coord' : null }, title), extra ? h('div', { class: 'hint' }, extra) : null,
      coordRows(lat, lon).map(([k, v, c]) => h('div', { class: 'row' }, h('b', {}, k), h('code', {}, pairs(v)), copyBtn(c))));
  }

  // ---------- map ----------
  // first visit opens on Hà Nội at a zoom where the collar is lettered in VN-2000 km; later visits reopen the last view
  const view = S.view && Number.isFinite(S.view.lat) && Number.isFinite(S.view.lng) && Number.isFinite(S.view.z) ? S.view : { lat: 21.0285, lng: 105.8542, z: 12 };
  const map = L.map('map', { zoomControl: false, preferCanvas: true, worldCopyJump: true, maxZoom: 21 }).setView([view.lat, view.lng], view.z);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 110 }).addTo(map);   // phones only (CSS); desktop draws the sheet's bar
  map.on('moveend', () => { const c = map.getCenter(); S.view = { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), z: map.getZoom() }; save(); });
  // keep popups clear of the fly-to field (top) and the control column (right); phones have no side collar
  const narrow = matchMedia('(max-width: 760px)').matches;
  L.Popup.mergeOptions(narrow ? { autoPanPaddingTopLeft: L.point(6, 60), autoPanPaddingBottomRight: L.point(54, 12), maxWidth: 250 }
    : { autoPanPaddingTopLeft: L.point(56, 64), autoPanPaddingBottomRight: L.point(60, 40), maxWidth: 320 });
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const esriAttr = 'Tiles © Esri — Maxar, Earthstar Geographics, GIS User Community';
  const tile = (url, o) => L.tileLayer(url, { maxZoom: 21, crossOrigin: 'anonymous', ...o });   // CORS: map image export reads tiles
  const BASEMAPS = {
    sat: () => [tile(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18, attribution: esriAttr })],
    hybrid: () => [tile(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18, attribution: esriAttr }),
      tile(ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18, opacity: .75 }),
      tile(ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18 })],
    osm: () => [tile('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })],
    topo: () => [tile('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxNativeZoom: 17, subdomains: 'abc', attribution: '© OpenStreetMap contributors, SRTM | © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' })],
  };
  let baseLayers = [];
  function setBasemap(k) {
    if (!BASEMAPS[k]) k = 'hybrid';
    baseLayers.forEach(l => map.removeLayer(l)); baseLayers = BASEMAPS[k]().map(l => l.addTo(map));   // added in order: imagery below, labels on top
    S.basemap = k; save(); $$('#basemaps button').forEach(b => b.classList.toggle('active', b.dataset.bm === k));
  }
  const resLayer = L.featureGroup().addTo(map), featLayer = L.featureGroup().addTo(map), vtxLayer = L.layerGroup().addTo(map);
  const draftLayer = L.layerGroup().addTo(map), miscLayer = L.layerGroup().addTo(map);
  const layerById = {};

  // ---------- i18n / theme ----------
  function applyLang() {
    document.documentElement.lang = S.lang;
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    $$('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
    $$('[data-i18n-html]').forEach(el => { el.textContent = t(el.dataset.i18nHtml); });
    $$('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === S.lang));
    $('#featList').dataset.empty = t('emptyFeat');
    buildProvinceSelect(); buildProvTable(); refreshInputLabels(); updateSingle(); renderResults(); renderFeatures(); setTool(tool); collar.draw();
  }

  // ---------- sheet collar (signature): live graduated neatline in the active VN-2000 system ----------
  function sheetTitle(geo, step) {
    const c = vnCrs(), el = $('#sheetTitle'); el.textContent = '';
    const grid = geo ? t('graticule') : `${t('gridKm')} ${step >= 1000 ? step / 1000 + ' km' : step + ' m'}`;
    el.append(`${t('sheet')} · `, h('b', {}, vnLabel()), ` · k ${c.k0} · ${grid}`);
  }
  const collar = Collar(map, $('#collar'), { crs: vnCrs, conv: () => S.conv, onMode: sheetTitle });

  // ---------- zone / province ----------
  function buildProvinceSelect() {
    const sel = $('#provinceSel'); sel.textContent = '';
    const g1 = h('optgroup', { label: t('provincesGroup') });
    C.PROVINCES.map((p, i) => [p, i]).sort((a, b) => a[0].name.replace(/^TP\. /, '').localeCompare(b[0].name.replace(/^TP\. /, ''), 'vi'))
      .forEach(([p, i]) => g1.append(h('option', { value: `p:${i}` }, `${p.name} — ${C.fmtMeridian(p.lon0)}`)));
    const g2 = h('optgroup', { label: t('other') },
      h('option', { value: 'custom' }, t('customMeridian')),
      h('option', { value: 'u48' }, `${t('vnUtm')} 48N (105°)`), h('option', { value: 'u49' }, `${t('vnUtm')} 49N (111°)`));
    sel.append(g1, g2); sel.value = S.prov;
    $('#customMeridian').hidden = S.prov !== 'custom'; $('#customMeridian').value = C.fmtMeridian(S.customLon0);
    refreshZoneChip();
  }
  function refreshZoneChip() {
    const c = vnCrs();
    $('#merBig').textContent = c.zone ? `UTM ${c.zone}N` : C.fmtMeridian(c.lon0);
    $('#zoneChip').textContent = `k ${c.k0} · ${t('zone').toLowerCase()} ${c.zone ? '6°' : '3°'}`;
    $('#convChip').textContent = S.conv === 'cf' ? 'EPSG:6960 · CF' : 'Helmert · PV';
    $('#roVnLbl').textContent = vnLabel();
  }
  function onZoneChange() {
    refreshZoneChip(); updateSingle(); save();
    if (lastInput) runConvert(true); else renderResults();
    renderFeatures(); collar.draw();
  }
  function buildProvTable() {
    const q = ($('#provSearch').value || '').toLowerCase(), tb = $('#provTable tbody'); tb.textContent = '';
    C.PROVINCES.filter(p => !q || (p.name + p.from).toLowerCase().includes(q)).forEach(p => {
      const i = C.PROVINCES.indexOf(p);
      tb.append(h('tr', { onclick: () => { S.prov = `p:${i}`; $('#provinceSel').value = S.prov; $('#customMeridian').hidden = true; onZoneChange(); toast(`${p.name} · ${C.fmtMeridian(p.lon0)}`); } },
        h('td', {}, p.name), h('td', {}, p.from), h('td', { class: 'num' }, C.fmtMeridian(p.lon0))));
    });
  }

  // ---------- input CRS / labels ----------
  function labelsFor() {
    return S.inCrs === 'wgs' ? [t('lat'), t('lon'), 'Lat, Lon', 'Lon, Lat'] : S.inCrs === 'utm' ? [t('northing'), t('easting'), 'N, E', 'E, N'] : [t('north'), t('east'), 'X, Y', 'Y, X'];
  }
  function refreshInputLabels() {
    const [a, b, ab, ba] = labelsFor();
    $('#lblA').textContent = a; $('#lblB').textContent = b; $('#optAB').textContent = ab; $('#optBA').textContent = ba;
    $$('#inCrsSeg button').forEach(x => x.classList.toggle('active', x.dataset.crs === S.inCrs));
    $('#utmZoneRow').hidden = S.inCrs !== 'utm';
    $$('#modeSeg button').forEach(x => x.classList.toggle('active', x.dataset.mode === S.mode));
    $('#singleBox').hidden = S.mode !== 'single'; $('#multiBox').hidden = S.mode !== 'multi';
  }

  // ---------- single point ----------
  const firstNum = s => C.splitLine(s).map(Number).find(Number.isFinite);
  function readSingle() {
    const a = firstNum($('#inA').value), b = firstNum($('#inB').value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (inputKind() === 'geo' ? Math.abs(a) > 90 || Math.abs(b) > 180 : a <= 0 || b <= 0) return { err: true };
    const g = C.toWgs(inputCrs(), a, b, S.conv);
    return Number.isFinite(g.lat) && Number.isFinite(g.lon) ? g : { err: true };
  }
  // one result group: system name, its parameters, then label · dotted leader · value rows
  function resGroup(title, sub, pairs, copyStr, dms) {
    return h('div', { class: 'res-group' },
      h('div', { class: 'res-head' }, h('b', {}, title), h('em', {}, sub), copyBtn(copyStr)),
      pairs.map(([k, v]) => h('div', { class: 'res-row' }, h('i', {}, k), h('code', {}, v), copyBtn(v))),
      dms ? h('div', { class: 'res-dms' }, dms) : null);
  }
  // a worked example (Hồ Gươm area) fills the placeholders and the empty result, so the aligned figures show before any input
  const EXAMPLE = { lat: 21.04862044, lon: 105.85451209 };
  function examplePair() {
    const crs = inputCrs(), p = C.fromWgs(crs, EXAMPLE.lat, EXAMPLE.lon, S.conv);
    return crs.kind === 'geo' ? [D(p.lat), D(p.lon)] : [M(p.x), M(p.y)];
  }
  function updateSingle() {
    const box = $('#singleOut'); box.textContent = '';
    const [pa, pb] = examplePair(); $('#inA').placeholder = pa; $('#inB').placeholder = pb;
    let g = readSingle();
    box.classList.toggle('is-example', !g);
    if (!g) { box.append(h('p', { class: 'res-example' }, h('b', {}, t('exampleTag')), ' ', t('exampleHint'))); g = EXAMPLE; }
    if (g.err) { box.append(h('div', { class: 'res-empty' }, t('invalid'))); return; }
    const a = all(g.lat, g.lon);
    box.append(
      resGroup('WGS84', 'EPSG:4326', [[t('lat'), D(g.lat)], [t('lon'), D(g.lon)]], `${D(g.lat)}, ${D(g.lon)}`, `${C.toDms(g.lat, 'N', 'S')}  ${C.toDms(g.lon, 'E', 'W')}`),
      resGroup(`UTM ${a.utm.zone}N`, 'WGS84 · k 0.9996', [['E', M(a.utm.e)], ['N', M(a.utm.n)]], `${M(a.utm.e)}\t${M(a.utm.n)}`),
      resGroup('VN-2000', vnLabel().replace('VN-2000 ', ''), [['X', M(a.vn.x)], ['Y', M(a.vn.y)]], `${M(a.vn.x)}\t${M(a.vn.y)}`));
    if (!inVn(g.lat, g.lon)) box.append(h('div', { class: 'res-warn' }, t('notInVn')));
  }
  function onSingleInput() {
    const inA = $('#inA'), nums = C.splitLine(inA.value).filter(x => Number.isFinite(Number(x)));
    if (nums.length >= 2) {   // a whole pair pasted into the first box → split it
      const r = C.parseText(inA.value, inputKind(), S.order).rows[0];
      if (r) { inA.value = r.a; $('#inB').value = r.b; }
    }
    updateSingle();
  }

  // ---------- batch convert ----------
  function runConvert(quiet) {
    const text = $('#multiIn').value;
    const parsed = C.parseText(text, inputKind(), S.order), crs = inputCrs();
    results = parsed.rows.map(r => ({ ...r, ...C.toWgs(crs, r.a, r.b, S.conv) })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));
    lastInput = text;
    const outside = results.filter(r => !inVn(r.lat, r.lon)).length, st = $('#multiStats'); st.textContent = '';
    if (!results.length && !quiet) toast(t('noInput'), true);
    st.append(h('span', { class: 'ok' }, icon('i-check'), `${results.length} ${t('converted')}`));
    if (parsed.skipped.length) st.append(h('span', { class: 'bad' }, icon('i-x'), `${parsed.skipped.length} ${t('skipped')}`),
      h('details', {}, h('summary', {}, t('showSkipped')), h('pre', {}, parsed.skipped.map(s => `${s.line}: ${s.text}`).join('\n'))));
    if (outside) st.append(h('span', { class: 'bad', style: 'width:100%' }, `${outside}: ${t('notInVn')}`));
    renderResults();
    if (results.length && !quiet) map.fitBounds(resLayer.getBounds().pad(0.2), { maxZoom: 17 });
  }
  function renderResults() {
    resLayer.clearLayers();
    const wrap = $('#resultWrap'); wrap.hidden = !results.length;
    if (!results.length) return;
    const thead = $('#resTable thead'), tbody = $('#resTable tbody'); thead.textContent = ''; tbody.textContent = '';
    thead.append(h('tr', {}, h('th', {}, '#'), h('th', {}, t('name')), h('th', { class: 'num' }, 'WGS84'), h('th', { class: 'num' }, vnLabel())));
    const showLabels = results.length <= LABEL_LIMIT, asSymbol = results.length <= SYMBOL_LIMIT;
    results.forEach((r, i) => {
      const a = all(r.lat, r.lon);
      // converted coordinates draw as the sheet's control-point triangle; huge sets fall back to canvas dots
      const mk = (asSymbol ? L.marker([r.lat, r.lon], { icon: symIcon('trig', 'i-trig'), keyboard: false })
        : L.circleMarker([r.lat, r.lon], { radius: 4, color: '#fafaf7', weight: 1.5, fillColor: COLORS.res, fillOpacity: 1 }))
        .bindPopup(() => coordPopup(r.name, r.lat, r.lon, r.extra || null));
      // Leaflet renders tooltip strings as HTML → escape
      if (showLabels) mk.bindTooltip(C.esc(r.name), { permanent: true, direction: 'right', offset: [8, 0], className: 'pt-label' });
      mk.on('click', e => {   // drawing tools pick converted points exactly
        if (tool === 'select') return;
        L.DomEvent.stopPropagation(e); mk.closePopup();
        if (tool === 'Point') addFeature({ type: 'Point', name: r.name, coords: [[r.lat, r.lon]] }); else snapTo([r.lat, r.lon]);
      });
      resLayer.addLayer(mk);
      tbody.append(h('tr', { onclick: () => { map.setView([r.lat, r.lon], Math.max(map.getZoom(), 17)); mk.openPopup(); } },
        h('td', { class: 'idx' }, i + 1), h('td', {}, r.name),
        h('td', { class: 'num' }, D(r.lat), h('small', {}, D(r.lon))),
        h('td', { class: 'num' }, M(a.vn.x), h('small', {}, M(a.vn.y)))));   // UTM lives in the popup and CSV
    });
  }
  function sampleText() {
    const c = map.getCenter(), lat0 = inVn(c.lat, c.lng) ? c.lat : 21.0285, lon0 = inVn(c.lat, c.lng) ? c.lng : 105.8542;
    const off = [[0, 0], [0.0012, 0.0004], [0.0009, 0.0021], [-0.0004, 0.0018]], crs = inputCrs();
    const fmtPair = (la, lo) => { const p = C.fromWgs(crs, la, lo, S.conv); return crs.kind === 'geo' ? [D(p.lat), D(p.lon)] : [M(p.x), M(p.y)]; };
    const seps = ['   ', ',', ';', '\t'];
    const lines = off.map(([dy, dx], i) => { const [a, b] = fmtPair(lat0 + dy, lon0 + dx); return [`M${i + 1}`, a, b].join(seps[i]); });
    return [`${t('name')}  ${labelsFor()[2]}`, ...lines].join('\n');
  }

  // ---------- drawing features ----------
  const nextName = type => { const base = t(type === 'Point' ? 'point' : type === 'LineString' ? 'line' : 'polygon'); return `${base} ${S.features.filter(f => f.type === type).length + 1}`; };
  function addFeature(f) { const nf = { id: uid(), name: f.name || nextName(f.type), type: f.type, coords: f.coords }; S.features = [...S.features, nf]; renderFeatures(); return nf; }
  function updateFeature(id, patch) { S.features = S.features.map(f => f.id === id ? { ...f, ...patch } : f); renderFeatures(); }
  function removeFeature(id) { S.features = S.features.filter(f => f.id !== id); if (selId === id) selId = null; renderFeatures(); }
  // map symbols reuse the icon sprite: 'trig' = converted control point, 'pt' = drawn point
  const symIcon = (cls, id) => L.divIcon({ className: `sym-mk ${cls}`, html: `<svg viewBox="0 0 24 24"><use href="#${id}"/></svg>` });
  const pinIcon = sel => symIcon(sel ? 'pt sel' : 'pt', 'i-point');
  function featMeasure(f) {
    if (f.type === 'Point') { const v = projectVn(f.coords[0][0], f.coords[0][1]); return `X ${M(v.x)} · Y ${M(v.y)}`; }
    const m = C.measure(f.coords, f.type === 'Polygon', projectVn);
    return f.type === 'Polygon' ? `${fmtArea(m.area)} · ${t('perimeter')} ${fmtLen(m.length)}` : `${t('length')} ${fmtLen(m.length)} · ${f.coords.length} ${t('vertices')}`;
  }
  function makeLayer(f) {
    const sel = f.id === selId, color = sel ? COLORS.sel : COLORS[f.type];
    if (f.type === 'Point') {
      const m = L.marker(f.coords[0], { icon: pinIcon(sel), draggable: true, riseOnHover: true });
      m.on('dragend', e => { const p = e.target.getLatLng(); updateFeature(f.id, { coords: [[p.lat, p.lng]] }); });
      m.bindTooltip(C.esc(f.name), { permanent: true, direction: 'right', offset: [10, -12], className: 'pt-label' });
      m.bindPopup(() => coordPopup(f.name, f.coords[0][0], f.coords[0][1]));
      m.on('click', () => { if (snapTo(f.coords[0])) { m.closePopup(); return; } select(f.id, false); });
      return m;
    }
    const style = { color, weight: sel ? 3.5 : 3, dashArray: sel ? '10 5' : null, fillColor: COLORS[f.type], fillOpacity: .22 };
    const l = f.type === 'Polygon' ? L.polygon(f.coords, style) : L.polyline(f.coords, style);
    l.on('click', e => { if (tool !== 'select') return; L.DomEvent.stop(e); select(f.id, false);
      L.popup().setLatLng(e.latlng).setContent(coordPopup(f.name, e.latlng.lat, e.latlng.lng, featMeasure(f))).openOn(map); });
    return l;
  }
  function renderFeatures() {
    featLayer.clearLayers();
    S.features.forEach(f => { layerById[f.id] = makeLayer(f); featLayer.addLayer(layerById[f.id]); });
    renderHandles(); renderFeatList(); save();
  }
  function renderHandles() {
    vtxLayer.clearLayers();
    const f = S.features.find(x => x.id === selId);
    if (!f || f.type === 'Point' || tool !== 'select') return;
    const layer = layerById[f.id], min = f.type === 'Polygon' ? 3 : 2;
    f.coords.forEach((c, i) => {
      const m = L.marker(c, { icon: L.divIcon({ className: 'vtx' }), draggable: true, keyboard: false, title: `${t('vertex')} ${i + 1}` });
      m.on('drag', e => { const ll = f.coords.map(x => L.latLng(x)); ll[i] = e.target.getLatLng(); layer.setLatLngs(ll); });
      m.on('dragend', e => { const p = e.target.getLatLng(); updateFeature(f.id, { coords: f.coords.map((x, j) => j === i ? [p.lat, p.lng] : x) }); });
      m.on('contextmenu', () => { if (f.coords.length > min) updateFeature(f.id, { coords: f.coords.filter((_, j) => j !== i) }); });
      vtxLayer.addLayer(m);
    });
  }
  function renderFeatList() {
    const ul = $('#featList'); ul.textContent = ''; $('#featCount').textContent = S.features.length;
    S.features.forEach(f => {
      const li = h('li', { class: 'feat' + (f.id === selId ? ' sel' : ''), style: `--c:${COLORS[f.type]}` },
        h('span', { class: 'ficon' }, icon(ICON_OF[f.type])),
        h('div', {}, h('input', { value: f.name, 'aria-label': t('name'), onchange: e => updateFeature(f.id, { name: e.target.value.trim() || nextName(f.type) }), onclick: e => e.stopPropagation() }),
          h('div', { class: 'meta' }, featMeasure(f))),
        h('div', { class: 'acts' },
          h('button', { type: 'button', class: 'copy', title: t('zoom'), onclick: e => { e.stopPropagation(); zoomTo(f); } }, icon('i-target')),
          h('button', { type: 'button', class: 'copy', title: t('del'), onclick: e => { e.stopPropagation(); removeFeature(f.id); } }, icon('i-trash'))));
      li.addEventListener('click', () => { select(f.id, false); zoomTo(f); });
      ul.append(li);
    });
  }
  function zoomTo(f) {
    if (f.type === 'Point') map.setView(f.coords[0], Math.max(map.getZoom(), 17));
    else map.fitBounds(L.latLngBounds(f.coords).pad(0.3), { maxZoom: 19 });
  }
  function select(id, rerender = true) {
    if (selId === id && !rerender) return;
    selId = id; renderFeatures();
    const f = S.features.find(x => x.id === id);
    if (f && f.type === 'Point') layerById[id].openPopup();   // re-render replaced the clicked marker
  }
  /** While drawing, clicking an existing point snaps to its exact coordinate. Returns true if consumed. */
  function snapTo(c) {
    if (tool === 'LineString' || tool === 'Polygon') { draft = [...draft, c]; drawDraft(); return true; }
    return tool === 'Point';
  }

  // drawing state machine
  function setTool(nt) {
    if (draft.length) cancelDraft();
    tool = nt;
    $$('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    $('#map').classList.toggle('drawing', tool !== 'select');
    $('#toolHint').textContent = t(tool === 'select' ? 'hintSelect' : tool === 'Point' ? 'hintPoint' : 'hintLine');
    if (tool === 'select') map.doubleClickZoom.enable(); else map.doubleClickZoom.disable();
    $('#drawHud').hidden = !(tool === 'LineString' || tool === 'Polygon');
    updateHud(); renderHandles();
  }
  function updateHud(cursor) {
    if ($('#drawHud').hidden) return;
    const pts = cursor ? [...draft, cursor] : draft, closed = tool === 'Polygon';
    const m = pts.length > 1 ? C.measure(pts, closed, projectVn) : { length: 0, area: 0 };
    const hud = $('#hudText'); hud.textContent = '';
    hud.append(h('b', {}, closed ? fmtArea(m.area) : fmtLen(m.length)), ` · ${draft.length} ${t('vertices')}`);
  }
  function drawDraft(cursor) {
    draftLayer.clearLayers();
    if (!draft.length) return;
    const style = { color: '#a0522d', weight: 2.5, dashArray: '6 5', fillColor: COLORS[tool] || '#a0522d', fillOpacity: .15, interactive: false };
    const shape = tool === 'Polygon' && draft.length > 2 ? L.polygon(draft, style) : L.polyline(draft, style);
    draftLayer.addLayer(shape);
    if (cursor) draftLayer.addLayer(L.polyline([draft[draft.length - 1], cursor], { ...style, weight: 1.5, interactive: false }));
    draft.forEach(p => draftLayer.addLayer(L.circleMarker(p, { radius: 4, color: '#111', weight: 1.5, fillColor: '#fafaf7', fillOpacity: 1, interactive: false })));
    updateHud(cursor);
  }
  function finishDraft() {
    // dblclick also fires 2 clicks → drop vertices closer than 4 px to the previous one
    const pts = draft.filter((p, i) => i === 0 || map.latLngToContainerPoint(p).distanceTo(map.latLngToContainerPoint(draft[i - 1])) > 4);
    const min = tool === 'Polygon' ? 3 : 2;
    if (pts.length < min) { toast(`${t('needPts')} ${min} ${t('vertices')}`, true); return; }
    const f = addFeature({ type: tool, coords: pts });
    draft = []; draftLayer.clearLayers(); updateHud(); lastFinish = Date.now();
    toast(`${f.name}: ${featMeasure(f)}`);
  }
  function cancelDraft() { draft = []; draftLayer.clearLayers(); updateHud(); }

  let lastFinish = 0;
  const justFinished = () => Date.now() - lastFinish < 500;   // swallow the rest of a double-click
  map.on('click', e => {
    const p = [e.latlng.lat, e.latlng.lng];
    if (tool === 'Point') { addFeature({ type: 'Point', coords: [p] }); return; }
    if (tool === 'LineString' || tool === 'Polygon') {
      if (justFinished()) return;
      if (tool === 'Polygon' && draft.length > 2 && map.latLngToContainerPoint(draft[0]).distanceTo(e.containerPoint) < 10) { finishDraft(); return; }
      draft = [...draft, p]; drawDraft(); return;
    }
    if (selId) select(null);
  });
  map.on('dblclick', () => { if (draft.length && !justFinished()) finishDraft(); });

  // cursor readout
  let rafPending = false, lastCursor = null;
  map.on('mouseout', () => collar.setCursor(null));
  map.on('mousemove', e => {
    lastCursor = e.latlng; collar.setCursor(e.latlng);
    if (draft.length) drawDraft([e.latlng.lat, e.latlng.lng]);
    if (rafPending) return; rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false; const { lat, lng } = lastCursor, a = all(lat, lng);
      $('#roWgs').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      $('#roVn').textContent = `X ${a.vn.x.toFixed(2)}  Y ${a.vn.y.toFixed(2)}`;
      $('#roUtmLbl').textContent = `UTM ${a.utm.zone}N`; $('#roUtm').textContent = `E ${a.utm.e.toFixed(2)}  N ${a.utm.n.toFixed(2)}`;
    });
  });

  // ---------- export ----------
  const resFeatures = geom => {
    const pts = results.map(r => [r.lat, r.lon]), out = [];
    if (geom === 'Point' || geom === 'all') results.forEach(r => out.push({ type: 'Point', name: r.name, coords: [[r.lat, r.lon]], props: { extra: r.extra } }));
    if ((geom === 'LineString' || geom === 'all') && pts.length > 1) out.push({ type: 'LineString', name: `${t('line')} (${pts.length})`, coords: pts });
    if ((geom === 'Polygon' || geom === 'all') && pts.length > 2) out.push({ type: 'Polygon', name: `${t('polygon')} (${pts.length})`, coords: pts });
    return out;
  };
  function descHtml(f) {
    const rows = f.type === 'Point' ? coordRows(f.coords[0][0], f.coords[0][1]).filter(r => r[0] !== 'DMS') : [[t('type'), featMeasure(f)]];
    return `<table border="1" cellpadding="3" style="border-collapse:collapse;font-family:monospace">${rows.map(([k, v]) => `<tr><td><b>${C.esc(k)}</b></td><td>${C.esc(v)}</td></tr>`).join('')}</table>`;
  }
  function coordCsvRows(lat, lon) { const a = all(lat, lon); return [D(lat), D(lon), C.toDms(lat, 'N', 'S'), C.toDms(lon, 'E', 'W'), `${a.utm.zone}N`, M(a.utm.e), M(a.utm.n), M(a.vn.x), M(a.vn.y)]; }
  const coordCsvHead = () => ['Lat (WGS84)', 'Lon (WGS84)', 'Lat DMS', 'Lon DMS', 'UTM zone', 'UTM E', 'UTM N', `${vnLabel()} X`, `${vnLabel()} Y`];
  /** chosen export system → {crs, xy(lat, lon) → [x=E|lon, y=N|lat], tag} */
  function exportCrs(feats) {
    if (S.expCrs === 'wgs') return { crs: C.CRS.wgs(), xy: (la, lo) => [lo, la], tag: 'WGS84' };
    const lons = feats.flatMap(f => f.coords.map(c => c[1])).reduce((m, v) => [Math.min(m[0], v), Math.max(m[1], v)], [Infinity, -Infinity]);
    const crs = S.expCrs === 'utm' ? C.CRS.utm(C.utmZone((lons[0] + lons[1]) / 2)) : vnCrs();
    const tag = S.expCrs === 'utm' ? `UTM${crs.zone}N` : vnLabel().replace(/[^\w]+/g, '');
    return { crs, xy: (la, lo) => { const p = C.fromWgs(crs, la, lo, S.conv); return [p.y, p.x]; }, tag };
  }
  function dxfFile(feats, base, ex) {
    const items = feats.map(f => ({ type: f.type, name: f.name, pts: f.coords.map(([la, lo]) => { const [x, y] = ex.xy(la, lo); return { x, y }; }) }));
    download(`${base}_${stamp()}_${ex.tag}.dxf`, C.toDxf(items, ex.crs.kind === 'geo' ? 1e-5 : 1), 'application/dxf');
  }
  const SHP_SUFFIX = { Point: 'points', LineString: 'lines', Polygon: 'polygons' };
  const numField = (name, dec = 3) => ({ name, type: 'N', len: 19, dec });
  function shpLayer(type, feats, base, ex) {
    const geo = ex.crs.kind === 'geo';
    const extra = type === 'Point' ? (geo ? [numField('LAT', 8), numField('LON', 8)] : [numField('NORTHING'), numField('EASTING')])
      : type === 'LineString' ? [numField('LENGTH_M')] : [numField('AREA_M2'), numField('PERIM_M')];
    const records = feats.map(f => {
      const coords = f.coords.map(([la, lo]) => ex.xy(la, lo));
      if (type === 'Point') return { coords, attrs: geo ? { NAME: f.name, LAT: f.coords[0][0], LON: f.coords[0][1] } : { NAME: f.name, NORTHING: coords[0][1], EASTING: coords[0][0] } };
      const m = C.measure(f.coords, type === 'Polygon', projectVn);   // always on the VN-2000 grid, as shown in the app
      return { coords, attrs: type === 'Polygon' ? { NAME: f.name, AREA_M2: m.area, PERIM_M: m.length } : { NAME: f.name, LENGTH_M: m.length } };
    });
    return Shp.write(`${base}_${SHP_SUFFIX[type]}`, type, [{ name: 'NAME', type: 'C', len: 254 }, ...extra], records, ex.crs);
  }
  function shpFile(feats, base, ex) {
    const files = ['Point', 'LineString', 'Polygon'].flatMap(type => { const fs = feats.filter(f => f.type === type); return fs.length ? shpLayer(type, fs, base, ex) : []; });
    download(`${base}_${stamp()}_${ex.tag}.zip`, Shp.zip(files), 'application/zip');
  }
  let pendingExport = null;
  function openCrsDialog(feats, base, fmt) {
    pendingExport = { feats, base, fmt };
    $('#xVnLbl').textContent = vnLabel();
    $$('#crsDlg [name=xCrs]').forEach(r => { r.checked = r.value === S.expCrs; });
    $('#xGo').textContent = t(fmt === 'shp' ? 'dlShp' : 'dlDxf');
    $('#crsDlg').returnValue = ''; $('#crsDlg').showModal();
  }
  let kmlSource = 'res';
  function doExport(kind) {
    const [src, fmt] = kind.split('-');
    if (fmt === 'png') { exportImage(); return; }
    const feats = src === 'res' ? resFeatures('Point') : S.features;
    if (!feats.length) { toast(t('noFeatures'), true); return; }
    const base = src === 'res' ? 'vn2000_points' : 'vn2000_features';
    if (fmt === 'kml') { kmlSource = src; openKmlDialog(base); return; }
    if (fmt === 'shp' || fmt === 'dxf') { openCrsDialog(feats, base, fmt); return; }
    if (fmt === 'geojson') {
      const withProps = feats.map(f => f.type === 'Point' ? { ...f, props: { ...(f.props || {}), ...flatCoords(f.coords[0]) } } : { ...f, props: { measure: featMeasure(f) } });
      download(`${base}_${stamp()}.geojson`, C.toGeoJson(withProps), 'application/geo+json'); return;
    }
    if (src === 'res') {
      const head = ['STT', t('name'), `${labelsFor()[0]} (in)`, `${labelsFor()[1]} (in)`, ...coordCsvHead(), 'Extra'];
      download(`${base}_${stamp()}.csv`, C.toCsv(head, results.map((r, i) => [i + 1, r.name, r.a, r.b, ...coordCsvRows(r.lat, r.lon), r.extra])), 'text/csv;charset=utf-8');
    } else {
      const head = [t('name'), t('type'), t('vertex'), ...coordCsvHead(), `${t('length')} / ${t('area')}`];
      const rows = feats.flatMap(f => f.coords.map(([la, lo], j) => [f.name, f.type, j + 1, ...coordCsvRows(la, lo), j === 0 && f.type !== 'Point' ? featMeasure(f) : '']));
      download(`${base}_${stamp()}.csv`, C.toCsv(head, rows), 'text/csv;charset=utf-8');
    }
  }
  function flatCoords([lat, lon]) { const a = all(lat, lon); return { utm_zone: a.utm.zone, utm_e: +M(a.utm.e), utm_n: +M(a.utm.n), vn2000_x: +M(a.vn.x), vn2000_y: +M(a.vn.y), vn2000_crs: vnLabel() }; }
  const KML_FIELDS = { kIcon: 'icon', kPtColor: 'pointColor', kIconScale: 'iconScale', kLabelScale: 'labelScale', kLineColor: 'lineColor', kLineWidth: 'lineWidth',
    kFillColor: 'fillColor', kFillOp: 'fillOpacity', kLabels: 'showLabels', kDesc: 'description', kFolders: 'folders', kGeom: 'geom' };
  function openKmlDialog(base) {
    Object.entries(KML_FIELDS).forEach(([id, k]) => { const el = $('#' + id); if (el.type === 'checkbox') el.checked = !!S.kml[k]; else el.value = S.kml[k]; });
    $('#kDoc').value = `${base}_${stamp()}`; $('#kGeomWrap').hidden = kmlSource !== 'res';
    $('#kmlDlg').returnValue = '';   // else Esc after a previous export would download again
    $('#kmlDlg').showModal();
  }
  $('#crsDlg').addEventListener('close', () => {
    if ($('#crsDlg').returnValue !== 'ok' || !pendingExport) return;
    S.expCrs = ($('#crsDlg [name=xCrs]:checked') || {}).value || 'vn'; save();
    const { feats, base, fmt } = pendingExport;
    try { (fmt === 'shp' ? shpFile : dxfFile)(feats, base, exportCrs(feats)); } catch (err) { toast(`${t('fileErr')}: ${err.message}`, true); }
  });

  // map image: the current view on a framed sheet (collar, title, legend, scale, north arrow, credits)
  let rendering = false;
  async function exportImage() {
    if (rendering) return;
    rendering = true; toast(t('rendering'));
    const pt = ll => map.latLngToContainerPoint(ll);
    const vectors = [
      ...S.features.filter(f => f.type !== 'Point').map(f => ({ kind: f.type === 'Polygon' ? 'poly' : 'line', color: COLORS[f.type], pts: f.coords.map(pt) })),
      ...results.map(r => ({ kind: 'trig', color: COLORS.res, pts: [pt([r.lat, r.lon])], label: results.length <= LABEL_LIMIT ? r.name : '' })),
      ...S.features.filter(f => f.type === 'Point').map(f => ({ kind: 'pt', color: COLORS.Point, pts: [pt(f.coords[0])], label: f.name })),
    ];
    const has = type => S.features.some(f => f.type === type);
    const legend = [
      results.length && { sym: 'trig', color: COLORS.res, label: t('lgConverted') },
      has('Point') && { sym: 'pt', color: COLORS.Point, label: t('lgPoint') },
      has('LineString') && { sym: 'line', color: COLORS.LineString, label: t('lgLine') },
      has('Polygon') && { sym: 'poly', color: COLORS.Polygon, label: t('lgPoly') },
    ].filter(Boolean);
    const attribution = baseLayers.map(l => l.options.attribution).filter(Boolean).join(' · ').replace(/<[^>]+>/g, '');
    try {
      const { blob, tilesOk } = await MapImage.render(map, {
        layers: baseLayers, build: collar.build, vectors, legend, title: $('#sheetTitle').textContent,
        date: new Date().toLocaleDateString(S.lang === 'vi' ? 'vi-VN' : 'en-GB'),
        credit: `${t('madeWith')} · quanta1985.github.io/vn2000`, attribution,
      });
      download(`vn2000_map_${stamp()}.png`, blob, 'image/png');
      toast(tilesOk ? t('mapImg') : `${t('mapImg')} · ${t('noTiles')}`, !tilesOk);
    } catch (err) { toast(`${t('imgFail')}: ${err.message}`, true); }
    finally { rendering = false; }
  }

  $('#kmlDlg').addEventListener('close', () => {
    if ($('#kmlDlg').returnValue !== 'ok') return;
    const o = {};
    Object.entries(KML_FIELDS).forEach(([id, k]) => { const el = $('#' + id); o[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value; });
    S.kml = o; save();
    const feats = (kmlSource === 'res' ? resFeatures(o.geom) : S.features).map(f => ({ ...f, desc: descHtml(f) }));
    const name = ($('#kDoc').value.trim() || 'vn2000').replace(/[\\/:*?"<>|]+/g, '_');
    const kml = C.toKml(feats, { ...o, fillOpacity: o.fillOpacity / 100, docName: name, folderNames: { Point: t('point'), LineString: t('line'), Polygon: t('polygon') } });
    download(`${name}.kml`, kml, 'application/vnd.google-earth.kml+xml');
  });

  // ---------- import / files ----------
  async function readFileText(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { try { return new TextDecoder('utf-16le', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1258').decode(buf); } }
  }
  function featuresFromFile(name, text) {
    if (/\.kml$/i.test(name) || /^\s*<\?xml|<kml/i.test(text)) {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('KML parse error');
      return C.fromKmlDoc(doc);
    }
    if (/\.(geo)?json$/i.test(name) || /^\s*\{/.test(text)) return C.fromGeoJson(JSON.parse(text));
    return null;
  }
  /** deflate-raw → bytes, stopping as soon as the output passes what the ZIP directory declared (ZIP bomb guard) */
  async function inflateRaw(b, maxBytes) {
    const rd = new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      n += value.length;
      if (n > maxBytes) { rd.cancel(); throw new Error('ZIP entry larger than declared'); }
      parts.push(value);
    }
    const out = new Uint8Array(n); let o = 0;
    parts.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }
  const SHP_PART = /\.(zip|shp|shx|dbf|prj|cpg)$/i;
  /** shapefile layers from a .zip and/or loose .shp/.dbf/.prj/.cpg files → WGS84 features */
  async function shpFeatures(files) {
    const bag = {};
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (/\.zip$/i.test(f.name)) {
        const inner = await Shp.unzip(bytes, inflateRaw, n => !/(^|\/)(__MACOSX\/|\._)/.test(n) && /\.(shp|dbf|prj|cpg)$/i.test(n));
        Object.entries(inner).forEach(([n, b]) => { bag[`${f.name}/${n}`] = b; });
      }
      else bag[f.name] = bytes;
    }
    const groups = {};
    Object.entries(bag).forEach(([n, b]) => {
      const m = n.match(/^(.+)\.(shp|dbf|prj|cpg)$/i);
      if (m) { const k = m[1].toLowerCase(); groups[k] = { ...groups[k], [m[2].toLowerCase()]: b }; }
    });
    const layers = Object.values(groups).filter(g => g.shp);
    if (!layers.length) throw new Error(t('noShp'));
    let assumed = '';
    const feats = layers.flatMap(g => {
      const r = Shp.read(g);
      let crs = r.crs;
      if (!crs) {   // no .prj: degrees if every coordinate fits, else the selected VN-2000 system
        const geo = r.features.every(f => f.coords.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90));
        crs = geo ? C.CRS.wgs() : vnCrs(); assumed = geo ? 'WGS84' : vnLabel();
      }
      return r.features.map(f => ({ type: f.type, name: f.name, coords: f.coords.map(([x, y]) => { const w = C.toWgs(crs, y, x, S.conv); return [w.lat, w.lon]; }) }));
    });
    return { feats, note: assumed && `${t('noPrj')} ${assumed}` };
  }
  /** files → {feats, note?} for KML/GeoJSON/SHP, or {text} for coordinate lists */
  async function readFeatures(files) {
    if (files.some(f => SHP_PART.test(f.name))) return shpFeatures(files);
    const text = await readFileText(files[0]), feats = featuresFromFile(files[0].name, text);
    return feats ? { feats } : { text };
  }
  async function loadIntoConverter(files) {
    try {
      const { feats, text, note } = await readFeatures(files);
      if (note) toast(note);
      if (feats) {   // KML/GeoJSON → every vertex becomes a WGS84 row
        S.inCrs = 'wgs'; S.order = 'ab'; $('#orderSel').value = 'ab';   // rows below are written lat, lon
        $('#multiIn').value = feats.flatMap((f, i) => f.coords.map((c, j) => `${String(f.name || `F${i + 1}`).replace(/\s+/g, '_')}${f.coords.length > 1 ? `_${j + 1}` : ''}\t${c[0]}\t${c[1]}`)).join('\n');
      } else $('#multiIn').value = text;
      S.mode = 'multi'; refreshInputLabels(); save(); runConvert();
    } catch (err) { toast(`${t('fileErr')}: ${err.message}`, true); }
  }
  async function importFeatures(files) {
    try {
      const { feats, note } = await readFeatures(files);
      if (!feats || !feats.length) throw new Error(t('noFeatures'));
      if (feats.length > MAX_IMPORT) throw new Error(`${t('tooMany')} (${feats.length} > ${MAX_IMPORT})`);
      S.features = [...S.features, ...feats.map(f => ({ ...f, id: uid(), name: f.name || nextName(f.type) }))];
      renderFeatures(); map.fitBounds(featLayer.getBounds().pad(0.2), { maxZoom: 18 }); switchTab('draw');
      toast(note ? `${t('imported')} ${feats.length} ${t('features')} · ${note}` : `${t('imported')} ${feats.length} ${t('features')}`, !!note);
    } catch (err) { toast(`${t('fileErr')}: ${err.message}`, true); }
  }

  // ---------- go-to / locate ----------
  function gotoCoord(text) {
    let g = null;
    const geo = C.parseText(text, 'geo').rows[0];
    if (geo && inVn(geo.a, geo.b)) g = { lat: geo.a, lon: geo.b };
    else {
      const pr = C.parseText(text, 'proj').rows[0];
      if (pr) g = C.toWgs(S.inCrs === 'utm' ? C.CRS.utm(S.utmZone) : vnCrs(), pr.a, pr.b, S.conv);
      else if (geo) g = { lat: geo.a, lon: geo.b };
    }
    if (!g || !Number.isFinite(g.lat)) { toast(t('gotoFail'), true); return; }
    miscLayer.clearLayers();
    const m = L.marker([g.lat, g.lon], { icon: pinIcon(true) }).addTo(miscLayer).bindPopup(() => {
      const el = coordPopup(text.trim(), g.lat, g.lon);
      el.append(h('button', { type: 'button', class: 'btn sm primary block', style: 'margin-top:8px', onclick: () => { addFeature({ type: 'Point', coords: [[g.lat, g.lon]] }); miscLayer.clearLayers(); } }, icon('i-point'), t('addToMap')));
      return el;
    });
    map.setView([g.lat, g.lon], Math.max(map.getZoom(), 16), { animate: false }); m.openPopup();   // no animation, so auto-pan sees the final view
    if (!inVn(g.lat, g.lon)) toast(t('notInVn'), true);
  }
  function locate() {
    if (!window.isSecureContext) { toast(t('gpsNeedsHttps'), true); return; }
    $('#locateBtn').classList.add('on');
    map.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true });
  }
  map.on('locationfound', e => {
    miscLayer.clearLayers();
    L.circle(e.latlng, { radius: e.accuracy, color: '#1f6fb2', weight: 1, fillOpacity: .1, interactive: false }).addTo(miscLayer);
    L.marker(e.latlng, { icon: L.divIcon({ className: 'gps-dot' }) }).addTo(miscLayer)
      .bindPopup(() => coordPopup('GPS', e.latlng.lat, e.latlng.lng, `± ${Math.round(e.accuracy)} m ${t('accuracy')}`)).openPopup();
  });
  map.on('locationerror', e => { $('#locateBtn').classList.remove('on'); toast(`${t('gpsFail')}: ${e.message}`, true); });

  // ---------- tabs / wiring ----------
  function switchTab(name) {
    $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === name));
    if (name !== 'draw' && tool !== 'select') setTool('select');
  }
  const isMobile = () => matchMedia('(max-width: 760px)').matches;
  // phone: the margin column is a sheet that snaps between three complete states
  const SNAPS = ['peek', 'half', 'full'];
  const snap = s => { $('#panel').dataset.snap = s; };
  function wire() {
    $$('.tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $$('[data-lang]').forEach(b => b.addEventListener('click', () => { S.lang = b.dataset.lang; save(); applyLang(); }));
    $('#provinceSel').addEventListener('change', e => { S.prov = e.target.value; $('#customMeridian').hidden = S.prov !== 'custom'; onZoneChange(); });
    $('#customMeridian').addEventListener('change', e => { const v = parseMeridian(e.target.value); if (v == null) { toast(t('badMeridian'), true); return; } S.customLon0 = v; e.target.value = C.fmtMeridian(v); onZoneChange(); });
    $('#convSel').addEventListener('change', e => { S.conv = e.target.value; onZoneChange(); });
    $$('#inCrsSeg button').forEach(b => b.addEventListener('click', () => { S.inCrs = b.dataset.crs; save(); refreshInputLabels(); updateSingle(); }));
    $('#utmZoneSel').addEventListener('change', e => { S.utmZone = +e.target.value; save(); updateSingle(); });
    $$('#modeSeg button').forEach(b => b.addEventListener('click', () => { S.mode = b.dataset.mode; save(); refreshInputLabels(); }));
    $('#orderSel').addEventListener('change', e => { S.order = e.target.value; save(); });
    $('#inA').addEventListener('input', onSingleInput); $('#inB').addEventListener('input', updateSingle);
    $('#swapBtn').addEventListener('click', () => { const a = $('#inA').value; $('#inA').value = $('#inB').value; $('#inB').value = a; updateSingle(); });
    $('#singleAdd').addEventListener('click', () => { const g = readSingle(); if (!g || g.err) { toast(t('invalid'), true); return; } const f = addFeature({ type: 'Point', coords: [[g.lat, g.lon]] }); map.setView(f.coords[0], Math.max(map.getZoom(), 16)); toast(f.name); });
    $('#singleFly').addEventListener('click', () => { const g = readSingle(); if (!g || g.err) { toast(t('invalid'), true); return; } gotoCoord(`${D(g.lat)} ${D(g.lon)}`); });
    $('#convertBtn').addEventListener('click', () => runConvert());
    $('#cleanBtn').addEventListener('click', () => { const p = C.parseText($('#multiIn').value, inputKind(), S.order); $('#multiIn').value = C.cleanText(p); toast(`${t('cleaned')}: ${p.rows.length} ${t('converted')} · ${p.skipped.length} ${t('skipped')}`); });
    $('#sampleBtn').addEventListener('click', () => { $('#multiIn').value = sampleText(); toast(t('sampleLoaded')); });
    $('#clearInBtn').addEventListener('click', () => { $('#multiIn').value = ''; results = []; lastInput = null; $('#multiStats').textContent = ''; renderResults(); });
    $('#fileIn').addEventListener('change', e => { const fs = Array.from(e.target.files); if (fs.length) loadIntoConverter(fs); e.target.value = ''; });
    $('#importIn').addEventListener('change', e => { const fs = Array.from(e.target.files); if (fs.length) importFeatures(fs); e.target.value = ''; });
    $$('[data-export]').forEach(b => b.addEventListener('click', () => doExport(b.dataset.export)));
    $$('[data-promote]').forEach(b => b.addEventListener('click', () => {
      const type = b.dataset.promote, feats = resFeatures(type);
      if (!feats.length) { toast(`${t('needPts')} ${type === 'Polygon' ? 3 : 2}`, true); return; }
      S.features = [...S.features, ...feats.map(f => ({ ...f, id: uid() }))]; renderFeatures(); switchTab('draw');
    }));
    $$('.tool').forEach(b => b.addEventListener('click', () => { setTool(b.dataset.tool); if (isMobile() && tool !== 'select') snap('peek'); }));
    $('#hudFinish').addEventListener('click', finishDraft); $('#hudCancel').addEventListener('click', cancelDraft);
    $('#clearFeat').addEventListener('click', () => { if (S.features.length && confirm(t('confirmClear'))) { S.features = []; selId = null; renderFeatures(); } });
    $('#provSearch').addEventListener('input', buildProvTable);
    $$('.dlg-close').forEach(b => b.addEventListener('click', () => b.closest('dialog').close('cancel')));
    $('#gotoForm').addEventListener('submit', e => { e.preventDefault(); gotoCoord($('#gotoIn').value); });
    $('#zoomIn').addEventListener('click', () => map.zoomIn()); $('#zoomOut').addEventListener('click', () => map.zoomOut());
    $('#locateBtn').addEventListener('click', locate);
    $('#pngBtn').addEventListener('click', exportImage);
    $('#fitBtn').addEventListener('click', () => { const b = L.latLngBounds([]); [resLayer, featLayer].forEach(l => { if (l.getLayers().length) b.extend(l.getBounds()); }); if (b.isValid()) map.fitBounds(b.pad(0.15), { maxZoom: 18 }); });
    const toggleBasemaps = open => { $('#basemaps').hidden = !open; $('#layersBtn').setAttribute('aria-expanded', String(open)); };
    $('#layersBtn').addEventListener('click', () => toggleBasemaps($('#basemaps').hidden));
    $$('#basemaps button').forEach(b => b.addEventListener('click', () => { setBasemap(b.dataset.bm); toggleBasemaps(false); }));
    $('#gridBtn').addEventListener('click', () => { S.grid = !S.grid; save(); $('#gridBtn').classList.toggle('on', S.grid); collar.setGrid(S.grid); });
    const copyReadout = () => copyText([$('#roWgs'), $('#roVn'), $('#roUtm')].map(e => e.textContent).join('\t'));
    $('#readout').addEventListener('click', copyReadout);
    $('#readout').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyReadout(); } });
    $('#sheetHandle').addEventListener('click', () => snap(SNAPS[(SNAPS.indexOf($('#panel').dataset.snap || 'peek') + 1) % SNAPS.length]));
    // drag & drop: on the textarea → converter; anywhere else → KML/GeoJSON import (text files → converter)
    const dz = $('#dropZone');
    ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); dz.classList.toggle('over', dz.contains(e.target)); }));
    document.addEventListener('dragleave', e => { if (!e.relatedTarget) dz.classList.remove('over'); });
    document.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('over');
      const fs = Array.from(e.dataTransfer.files); if (!fs.length) return;
      if (!dz.contains(e.target) && fs.some(f => /\.(kml|geojson|json|zip|shp)$/i.test(f.name))) importFeatures(fs); else { switchTab('convert'); loadIntoConverter(fs); }
    });
    document.addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'Escape') { if (draft.length) cancelDraft(); else if (tool !== 'select') setTool('select'); else if (selId) select(null); }
      else if (e.key === 'Enter' && draft.length) finishDraft();
      else if (e.key === 'Backspace' && draft.length) { e.preventDefault(); draft = draft.slice(0, -1); drawDraft(); }
      else if (e.key === 'Delete' && selId) removeFeature(selId);
    });
  }

  // ---------- init ----------
  $('#convSel').value = S.conv; $('#utmZoneSel').value = S.utmZone; $('#orderSel').value = S.order;
  $('#gridBtn').classList.toggle('on', S.grid); collar.setGrid(S.grid);
  wire(); setBasemap(S.basemap); applyLang();
  if (S.features.length) map.fitBounds(featLayer.getBounds().pad(0.2), { maxZoom: 17 });
})();
