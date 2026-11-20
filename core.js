/* VN2000 ⇄ UTM ⇄ WGS84 core: geodesy, parsing, exporters. No dependencies.
 * Works as a browser global (window.Core) and as a Node module (tests). */
(function (root) {
  'use strict';

  // ---------- constants ----------
  const A = 6378137, F = 1 / 298.257223563;          // WGS84 = VN-2000 ellipsoid
  const E2 = F * (2 - F), E = Math.sqrt(E2);
  const SEC = Math.PI / 648000;
  // VN-2000 → WGS84, EPSG:6960 (Coordinate Frame, method 9607), TT 973/2001/TT-TCĐC
  const HELMERT = { tx: -191.90441429, ty: -39.30318279, tz: -111.45032835,
    rx: -0.00928836, ry: 0.01975479, rz: -0.00427372, s: 0.252906278 };

  // Kinh tuyến trục 34 tỉnh/thành sau sáp nhập (01/07/2025). [name, merged-from, meridian °]
  const PROVINCES = [
    ['An Giang', 'An Giang + Kiên Giang', 104.75], ['Bắc Ninh', 'Bắc Ninh + Bắc Giang', 107],
    ['Cà Mau', 'Cà Mau + Bạc Liêu', 104.5], ['Cao Bằng', '—', 105.75],
    ['Đắk Lắk', 'Đắk Lắk + Phú Yên', 108.5], ['Điện Biên', '—', 103],
    ['Đồng Nai', 'Đồng Nai + Bình Phước', 107.75], ['Đồng Tháp', 'Đồng Tháp + Tiền Giang', 105],
    ['Gia Lai', 'Gia Lai + Bình Định', 108.25], ['Hà Tĩnh', '—', 105.5],
    ['Hưng Yên', 'Hưng Yên + Thái Bình', 105.5], ['Khánh Hòa', 'Khánh Hòa + Ninh Thuận', 108.25],
    ['Lai Châu', '—', 103], ['Lạng Sơn', '—', 107.25],
    ['Lào Cai', 'Lào Cai + Yên Bái', 104.75], ['Lâm Đồng', 'Lâm Đồng + Đắk Nông + Bình Thuận', 107.75],
    ['Nghệ An', '—', 104.75], ['Ninh Bình', 'Ninh Bình + Hà Nam + Nam Định', 105],
    ['Phú Thọ', 'Phú Thọ + Vĩnh Phúc + Hòa Bình', 104.75], ['Quảng Ngãi', 'Quảng Ngãi + Kon Tum', 108],
    ['Quảng Ninh', '—', 107.75], ['Quảng Trị', 'Quảng Trị + Quảng Bình', 106],
    ['Sơn La', '—', 104], ['Tây Ninh', 'Tây Ninh + Long An', 105.75],
    ['Thái Nguyên', 'Thái Nguyên + Bắc Kạn', 106.5], ['Thanh Hóa', '—', 105],
    ['TP. Cần Thơ', 'Cần Thơ + Sóc Trăng + Hậu Giang', 105], ['TP. Đà Nẵng', 'Đà Nẵng + Quảng Nam', 107.75],
    ['TP. Hà Nội', '—', 105], ['TP. Hải Phòng', 'Hải Phòng + Hải Dương', 105.75],
    ['TP. Hồ Chí Minh', 'TP.HCM + Bà Rịa–Vũng Tàu + Bình Dương', 105.75], ['TP. Huế', '—', 107],
    ['Tuyên Quang', 'Tuyên Quang + Hà Giang', 106], ['Vĩnh Long', 'Vĩnh Long + Bến Tre + Trà Vinh', 105.5],
  ].map(([name, from, lon0]) => ({ name, from, lon0 }));

  // ---------- ECEF + Helmert ----------
  function toEcef(lat, lon) {
    const p = lat * Math.PI / 180, l = lon * Math.PI / 180, sp = Math.sin(p);
    const N = A / Math.sqrt(1 - E2 * sp * sp);
    return [N * Math.cos(p) * Math.cos(l), N * Math.cos(p) * Math.sin(l), N * (1 - E2) * sp];
  }
  function fromEcef([x, y, z]) {
    const p = Math.hypot(x, y);
    let lat = Math.atan2(z, p * (1 - E2)), h = 0;
    for (let i = 0; i < 6; i++) {
      const s = Math.sin(lat), N = A / Math.sqrt(1 - E2 * s * s);
      h = p / Math.cos(lat) - N;
      lat = Math.atan2(z, p * (1 - E2 * N / (N + h)));
    }
    return { lat: lat * 180 / Math.PI, lon: Math.atan2(y, x) * 180 / Math.PI };
  }
  // Rotation matrix for the chosen convention ('cf' = EPSG coordinate frame, 'pv' = position vector)
  function rot(conv) {
    const s = conv === 'pv' ? -1 : 1, rx = s * HELMERT.rx * SEC, ry = s * HELMERT.ry * SEC, rz = s * HELMERT.rz * SEC;
    return [[1, rz, -ry], [-rz, 1, rx], [ry, -rx, 1]];
  }
  function vnToWgs(lat, lon, conv) {
    const X = toEcef(lat, lon), R = rot(conv), k = 1 + HELMERT.s * 1e-6, T = [HELMERT.tx, HELMERT.ty, HELMERT.tz];
    return fromEcef(R.map((r, i) => T[i] + k * (r[0] * X[0] + r[1] * X[1] + r[2] * X[2])));
  }
  // 2D Helmert drops ellipsoidal height, so the 3D inverse is only mm-consistent with vnToWgs.
  // Refine so that vnToWgs(wgsToVn(p)) === p exactly (users see VN→WGS→VN return the same digits).
  function wgsToVn(lat, lon, conv) {
    const X = toEcef(lat, lon), R = rot(conv), k = 1 + HELMERT.s * 1e-6;
    const d = [X[0] - HELMERT.tx, X[1] - HELMERT.ty, X[2] - HELMERT.tz];
    let g = fromEcef([0, 1, 2].map(i => (R[0][i] * d[0] + R[1][i] * d[1] + R[2][i] * d[2]) / k));
    for (let i = 0; i < 4; i++) { const w = vnToWgs(g.lat, g.lon, conv); g = { lat: g.lat + lat - w.lat, lon: g.lon + lon - w.lon }; }
    return g;
  }

  // ---------- Transverse Mercator (Krüger / Karney 6th order) ----------
  const n = F / (2 - F), n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
  const AA = A / (1 + n) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
  const ALPHA = [
    n / 2 - 2 / 3 * n2 + 5 / 16 * n3 + 41 / 180 * n4 - 127 / 288 * n5 + 7891 / 37800 * n6,
    13 / 48 * n2 - 3 / 5 * n3 + 557 / 1440 * n4 + 281 / 630 * n5 - 1983433 / 1935360 * n6,
    61 / 240 * n3 - 103 / 140 * n4 + 15061 / 26880 * n5 + 167603 / 181440 * n6,
    49561 / 161280 * n4 - 179 / 168 * n5 + 6601661 / 7257600 * n6,
    34729 / 80640 * n5 - 3418889 / 1995840 * n6,
    212378941 / 319334400 * n6];
  const BETA = [
    n / 2 - 2 / 3 * n2 + 37 / 96 * n3 - 1 / 360 * n4 - 81 / 512 * n5 + 96199 / 604800 * n6,
    1 / 48 * n2 + 1 / 15 * n3 - 437 / 1440 * n4 + 46 / 105 * n5 - 1118711 / 3870720 * n6,
    17 / 480 * n3 - 37 / 840 * n4 - 209 / 4480 * n5 + 5569 / 90720 * n6,
    4397 / 161280 * n4 - 11 / 504 * n5 - 830251 / 7257600 * n6,
    4583 / 161280 * n5 - 108847 / 3991680 * n6,
    20648693 / 638668800 * n6];
  const tauPrime = t => { const s = Math.sinh(E * Math.atanh(E * t / Math.sqrt(1 + t * t)));
    return t * Math.sqrt(1 + s * s) - s * Math.sqrt(1 + t * t); };

  function tmForward(lat, lon, lon0, k0) {
    const l = (lon - lon0) * Math.PI / 180, tp = tauPrime(Math.tan(lat * Math.PI / 180));
    const xi1 = Math.atan2(tp, Math.cos(l)), eta1 = Math.asinh(Math.sin(l) / Math.hypot(tp, Math.cos(l)));
    let xi = xi1, eta = eta1;
    ALPHA.forEach((a, j) => { const m = 2 * (j + 1);
      xi += a * Math.sin(m * xi1) * Math.cosh(m * eta1); eta += a * Math.cos(m * xi1) * Math.sinh(m * eta1); });
    return { e: 500000 + k0 * AA * eta, n: k0 * AA * xi };
  }
  function tmInverse(e, nn, lon0, k0) {
    const eta = (e - 500000) / (k0 * AA), xi = nn / (k0 * AA);
    let xi1 = xi, eta1 = eta;
    BETA.forEach((b, j) => { const m = 2 * (j + 1);
      xi1 -= b * Math.sin(m * xi) * Math.cosh(m * eta); eta1 -= b * Math.cos(m * xi) * Math.sinh(m * eta); });
    const sh = Math.sinh(eta1), tp = Math.sin(xi1) / Math.hypot(sh, Math.cos(xi1));
    let t = tp;
    for (let i = 0; i < 20; i++) {
      const ti = tauPrime(t);
      const d = (tp - ti) / Math.sqrt(1 + ti * ti) * (1 + (1 - E2) * t * t) / ((1 - E2) * Math.sqrt(1 + t * t));
      t += d; if (Math.abs(d) < 1e-14) break;
    }
    return { lat: Math.atan(t) * 180 / Math.PI, lon: lon0 + Math.atan2(sh, Math.cos(xi1)) * 180 / Math.PI };
  }

  // ---------- CRS ----------
  // crs: {kind:'geo'|'tm', datum:'WGS84'|'VN2000', lon0, k0, zone?, label}
  const utmZone = lon => Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
  const zoneLon0 = z => z * 6 - 183;
  const CRS = {
    wgs: () => ({ kind: 'geo', datum: 'WGS84', label: 'WGS84' }),
    vnGeo: () => ({ kind: 'geo', datum: 'VN2000', label: 'VN-2000 (B,L)' }),
    utm: zone => ({ kind: 'tm', datum: 'WGS84', zone, lon0: zoneLon0(zone), k0: 0.9996, label: `WGS84 / UTM ${zone}N` }),
    vnTm3: lon0 => ({ kind: 'tm', datum: 'VN2000', lon0, k0: 0.9999, label: `VN-2000 TM-3 ${fmtMeridian(lon0)}` }),
    vnUtm: zone => ({ kind: 'tm', datum: 'VN2000', zone, lon0: zoneLon0(zone), k0: 0.9996, label: `VN-2000 UTM ${zone}N` }),
  };
  // a,b: geo → lat, lon; tm → northing(X), easting(Y)  (Vietnamese X/Y convention)
  function toWgs(crs, a, b, conv = 'cf') {
    const g = crs.kind === 'geo' ? { lat: a, lon: b } : tmInverse(b, a, crs.lon0, crs.k0);
    return crs.datum === 'VN2000' ? vnToWgs(g.lat, g.lon, conv) : g;
  }
  function fromWgs(crs, lat, lon, conv = 'cf') {
    const g = crs.datum === 'VN2000' ? wgsToVn(lat, lon, conv) : { lat, lon };
    if (crs.kind === 'geo') return g;
    const p = tmForward(g.lat, g.lon, crs.lon0, crs.k0);
    return { x: p.n, y: p.e };
  }
  const toUtmAuto = (lat, lon) => { const z = utmZone(lon), p = fromWgs(CRS.utm(z), lat, lon); return { zone: z, e: p.y, n: p.x }; };

  // ---------- formatting ----------
  function fmtMeridian(d) { const deg = Math.floor(d), m = Math.round((d - deg) * 60); return `${deg}°${String(m).padStart(2, '0')}′`; }
  function toDms(v, pos, neg, dp = 3) {
    const h = v < 0 ? neg : pos; v = Math.abs(v);
    let d = Math.floor(v), m = Math.floor((v - d) * 60), s = ((v - d) * 60 - m) * 60;
    if (+s.toFixed(dp) >= 60) { s = 0; m += 1; } if (m >= 60) { m = 0; d += 1; }
    return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(dp).padStart(dp + 3, '0')}″${h}`;
  }
  const fmt = (v, dp) => Number.isFinite(v) ? v.toFixed(dp) : '';

  // ---------- parsing (auto-correct messy input) ----------
  const NUM = /^[+-]?\d+(?:\.\d+)?$/;
  // DMS like 21°01'23.4"N, 105° 48.5' E, 21°1′2″ → decimal token
  const DMS = /([+-]?\d+(?:[.,]\d+)?)\s*°\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:["″”]|''|′′))?\s*([NSEWnsew])?/g;
  function dmsToDec(text) {
    return text.replace(DMS, (_, d, m, s, h) => {
      const f = x => parseFloat((x || '0').replace(',', '.'));
      let v = Math.abs(f(d)) + f(m) / 60 + f(s) / 3600;
      if (d.trim().startsWith('-') || /[SWsw]/.test(h || '')) v = -v;
      return ` ${v.toFixed(10)} `;
    });
  }
  function splitLine(raw) {
    let line = dmsToDec(raw.replace(/ /g, ' ').trim());
    const hasStrongSep = /[\t;|]/.test(line);
    // decimal comma: "123,45" when ; or tab separates fields, or when every number uses comma and no dot exists
    if (hasStrongSep || (!/\d\.\d/.test(line) && (line.match(/\d,\d/g) || []).length >= 2 && !/\d,\s*\d/.test(line.replace(/\d,\d/g, '')) && /\s/.test(line)))
      line = line.replace(/(\d),(\d)/g, '$1.$2');
    // any run of space/tab/comma/semicolon/pipe is one separator; parseText re-joins name tokens
    return line.split(/[\s,;|]+/).filter(f => f !== '');
  }
  function plausible(kind, a, b) {
    if (kind === 'geo') {
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180 && (Math.abs(a) > 1 || Math.abs(b) > 1)) return 'ab';
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180 && Math.abs(a) > 1) return 'ba';
      return null;
    }
    const isN = v => v >= 100000 && v <= 9999999, isE = v => v >= 50000 && v <= 999999;
    if (!isN(a) && !isN(b)) return null;
    if (isN(a) && isE(b) && a >= b) return 'ab';
    if (isN(b) && isE(a) && b > a) return 'ba';
    return null;
  }
  /** order: 'auto' | 'ab' (lat,lon / X,Y=N,E) | 'ba' (lon,lat / Y,X=E,N) */
  function parseText(text, kind, order = 'auto') {
    const rows = [], skipped = [];
    String(text).split(/\r?\n/).forEach((raw, i) => {
      if (!raw.trim()) return;
      const f = splitLine(raw), cands = [];
      for (let j = 0; j + 1 < f.length; j++) {
        if (!NUM.test(f[j]) || !NUM.test(f[j + 1])) continue;
        const a = +f[j], b = +f[j + 1], p = plausible(kind, a, b);
        if (p) cands.push({ j, a, b, p });
      }
      // geo: a numeric ID/STT before lat,lon also looks like a coordinate — prefer a pair that fits Vietnam
      const vnLike = c => (c.a >= 4 && c.a <= 26 && c.b >= 100 && c.b <= 120) || (c.b >= 4 && c.b <= 26 && c.a >= 100 && c.a <= 120);
      const c = (kind === 'geo' && cands.find(vnLike)) || cands[0];
      if (!c) { skipped.push({ line: i + 1, text: raw.trim() }); return; }
      let o = order === 'auto' ? c.p : order;
      if (kind === 'geo' && order === 'auto' && Math.abs(c.a) > 90) o = 'ba';
      rows.push({ line: i + 1, name: f.slice(0, c.j).join(' '), a: o === 'ab' ? c.a : c.b, b: o === 'ab' ? c.b : c.a, extra: f.slice(c.j + 2).join(' ') });
    });
    // auto-number unnamed points
    rows.forEach((r, i) => { if (!r.name) r.name = `P${i + 1}`; });
    return { rows, skipped };
  }
  /** Normalised text (what "auto-correct" writes back): name<TAB>a<TAB>b[<TAB>extra] */
  const cleanText = (parsed) => parsed.rows.map(r => [r.name, r.a, r.b, r.extra].filter(v => v !== '').join('\t')).join('\n');

  // ---------- measurement on a projected grid ----------
  function measure(coords, closed, project) {
    const p = coords.map(([lat, lon]) => project(lat, lon));
    let len = 0, area = 0;
    for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (closed && p.length > 2) {
      len += Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y);
      for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; area += p[i].y * q.x - q.y * p[i].x; }
    }
    return { length: len, area: Math.abs(area) / 2 };
  }

  // ---------- exporters ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // #rrggbb + opacity → KML aabbggrr
  const kmlColor = (hex, op = 1) => { const h = hex.replace('#', ''); return Math.round(op * 255).toString(16).padStart(2, '0') + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2); };
  const ICONS = { circle: 'http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png',
    pin: 'http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png',
    square: 'http://maps.google.com/mapfiles/kml/shapes/placemark_square.png',
    target: 'http://maps.google.com/mapfiles/kml/shapes/target.png', star: 'http://maps.google.com/mapfiles/kml/shapes/star.png' };

  /** features: [{type:'Point'|'LineString'|'Polygon', name, coords:[[lat,lon],...], desc?}] */
  function toKml(features, o) {
    const coordStr = cs => cs.map(([lat, lon]) => `${lon.toFixed(9)},${lat.toFixed(9)},0`).join(' ');
    const style = `<Style id="s"><IconStyle><color>${kmlColor(o.pointColor)}</color><scale>${o.iconScale}</scale><Icon><href>${ICONS[o.icon] || ICONS.circle}</href></Icon></IconStyle>`
      + `<LabelStyle><scale>${o.showLabels ? o.labelScale : 0}</scale><color>${kmlColor(o.labelColor || '#ffffff')}</color></LabelStyle>`
      + `<LineStyle><color>${kmlColor(o.lineColor)}</color><width>${o.lineWidth}</width></LineStyle>`
      + `<PolyStyle><color>${kmlColor(o.fillColor, o.fillOpacity)}</color><outline>1</outline></PolyStyle></Style>`;
    const geom = f => {
      if (f.type === 'Point') return `<Point><coordinates>${coordStr(f.coords)}</coordinates></Point>`;
      if (f.type === 'LineString') return `<LineString><tessellate>1</tessellate><coordinates>${coordStr(f.coords)}</coordinates></LineString>`;
      return `<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${coordStr([...f.coords, f.coords[0]])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    };
    const groups = ['Point', 'LineString', 'Polygon'].map(t => [t, features.filter(f => f.type === t)]).filter(([, fs]) => fs.length);
    const pm = f => `<Placemark><name>${esc(f.name)}</name>${o.description && f.desc ? `<description><![CDATA[${f.desc.replace(/]]>/g, ']] >')}]]></description>` : ''}<styleUrl>#s</styleUrl>${geom(f)}</Placemark>`;
    const folders = groups.map(([t, fs]) => o.folders ? `<Folder><name>${esc(o.folderNames[t])}</name>${fs.map(pm).join('')}</Folder>` : fs.map(pm).join('')).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(o.docName)}</name>${style}${folders}</Document></kml>\n`;
  }
  function toGeoJson(features) {
    const g = f => f.type === 'Point' ? { type: 'Point', coordinates: [f.coords[0][1], f.coords[0][0]] }
      : f.type === 'LineString' ? { type: 'LineString', coordinates: f.coords.map(([a, b]) => [b, a]) }
      : { type: 'Polygon', coordinates: [[...f.coords, f.coords[0]].map(([a, b]) => [b, a])] };
    return JSON.stringify({ type: 'FeatureCollection', features: features.map(f => ({ type: 'Feature', properties: { name: f.name, ...(f.props || {}) }, geometry: g(f) })) }, null, 1);
  }
  const csvCell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s) && !NUM.test(s)) s = "'" + s;   // block spreadsheet formula injection
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCsv = (header, rows) => '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  /** DXF R12, coordinates already projected: items [{type, name, pts:[{x:E,y:N}]}] */
  // R12 is ANSI-only: encode non-ASCII (Vietnamese) as AutoCAD \U+XXXX escapes
  const dxfText = s => String(s).replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, c => '\\U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
  function toDxf(items, textH = 1) {
    const out = ['0', 'SECTION', '2', 'ENTITIES'];
    const put = (...kv) => out.push(...kv.map(String));
    items.forEach(it => {
      const layer = it.type === 'Point' ? 'POINTS' : it.type === 'LineString' ? 'LINES' : 'POLYGONS';
      if (it.type === 'Point') {
        const p = it.pts[0];
        put('0', 'POINT', '8', layer, '10', p.x.toFixed(4), '20', p.y.toFixed(4), '30', '0');
        put('0', 'TEXT', '8', 'LABELS', '10', (p.x + textH * 0.5).toFixed(4), '20', (p.y + textH * 0.5).toFixed(4), '30', '0', '40', textH, '1', dxfText(it.name));
      } else {
        put('0', 'POLYLINE', '8', layer, '66', '1', '70', it.type === 'Polygon' ? '1' : '0');
        it.pts.forEach(p => put('0', 'VERTEX', '8', layer, '10', p.x.toFixed(4), '20', p.y.toFixed(4), '30', '0'));
        put('0', 'SEQEND');
        const c = it.pts[0];
        put('0', 'TEXT', '8', 'LABELS', '10', c.x.toFixed(4), '20', c.y.toFixed(4), '30', '0', '40', textH, '1', dxfText(it.name));
      }
    });
    put('0', 'ENDSEC', '0', 'EOF');
    return out.join('\r\n') + '\r\n';
  }

  // ---------- import (KML / GeoJSON → features) ----------
  function fromGeoJson(obj) {
    const out = [];
    const add = (type, coords, name) => out.push({ type, name, coords });
    const ll = c => [c[1], c[0]];
    const walk = (g, name) => {
      if (!g) return;
      switch (g.type) {
        case 'Point': add('Point', [ll(g.coordinates)], name); break;
        case 'MultiPoint': g.coordinates.forEach(c => add('Point', [ll(c)], name)); break;
        case 'LineString': add('LineString', g.coordinates.map(ll), name); break;
        case 'MultiLineString': g.coordinates.forEach(l => add('LineString', l.map(ll), name)); break;
        case 'Polygon': add('Polygon', openRing(g.coordinates[0].map(ll)), name); break;
        case 'MultiPolygon': g.coordinates.forEach(p => add('Polygon', openRing(p[0].map(ll)), name)); break;
        case 'GeometryCollection': g.geometries.forEach(x => walk(x, name)); break;
        case 'Feature': walk(g.geometry, (g.properties && (g.properties.name || g.properties.Name)) || name); break;
        case 'FeatureCollection': g.features.forEach(x => walk(x, name)); break;
      }
    };
    walk(obj, '');
    return out;
  }
  const openRing = cs => cs.length > 1 && cs[0][0] === cs[cs.length - 1][0] && cs[0][1] === cs[cs.length - 1][1] ? cs.slice(0, -1) : cs;
  /** doc: a parsed XML Document (DOMParser in browser) */
  function fromKmlDoc(doc) {
    const out = [];
    const coords = el => el.textContent.trim().replace(/\s*,\s*/g, ',').split(/\s+/).map(t => t.split(',').map(Number)).filter(c => c.length >= 2 && c.every(Number.isFinite)).map(c => [c[1], c[0]]);
    const byTag = (el, t) => Array.from(el.getElementsByTagNameNS('*', t));   // also matches <kml:Placemark>
    byTag(doc, 'Placemark').forEach(pm => {
      const nm = byTag(pm, 'name')[0], name = nm ? nm.textContent.trim() : '';
      byTag(pm, 'Point').forEach(p => byTag(p, 'coordinates').forEach(c => out.push({ type: 'Point', name, coords: coords(c).slice(0, 1) })));
      byTag(pm, 'LineString').forEach(p => byTag(p, 'coordinates').forEach(c => out.push({ type: 'LineString', name, coords: coords(c) })));
      byTag(pm, 'Polygon').forEach(p => byTag(p, 'outerBoundaryIs').forEach(ob => byTag(ob, 'coordinates').forEach(c => out.push({ type: 'Polygon', name, coords: openRing(coords(c)) }))));
    });
    return out.filter(f => f.coords.length);
  }

  const api = { HELMERT, PROVINCES, CRS, toWgs, fromWgs, toUtmAuto, utmZone, vnToWgs, wgsToVn, tmForward, tmInverse,
    fmtMeridian, toDms, fmt, parseText, cleanText, splitLine, measure, toKml, toGeoJson, toCsv, toDxf, fromGeoJson, fromKmlDoc, esc, ICONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
