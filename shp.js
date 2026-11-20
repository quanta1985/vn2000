/* ESRI Shapefile read/write + .prj + minimal ZIP, no dependencies.
 * Write: one layer per geometry type (.shp/.shx/.dbf/.prj/.cpg UTF-8), zipped "stored".
 * Read: .zip (stored or deflate via a caller-supplied inflateRaw) or loose files; .prj tells the CRS.
 * Coordinates are [x, y] = [easting|lon, northing|lat]. Browser global window.Shp, Node module for tests. */
(function (root) {
  'use strict';
  const enc = new TextEncoder();
  const MAX_ENTRY = 256 * 1024 * 1024;   // bytes per unzipped file; guards against ZIP bombs
  const minMax = vals => vals.reduce((m, v) => [Math.min(m[0], v), Math.max(m[1], v)], [Infinity, -Infinity]);   // no spread: huge arrays

  // ---------- ZIP ----------
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; }
  function concat(parts) {
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }
  /** files [{name, data: Uint8Array}] → zip bytes (method 0 "stored", UTF-8 names) */
  function zip(files) {
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const local = [], central = []; let off = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
      const lh = new DataView(new ArrayBuffer(30)), ch = new DataView(new ArrayBuffer(46));
      [[0, 4, 0x04034b50], [4, 2, 20], [6, 2, 0x0800], [10, 2, time], [12, 2, date], [14, 4, crc], [18, 4, n], [22, 4, n], [26, 2, name.length]]
        .forEach(([o, s, v]) => s === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true));
      [[0, 4, 0x02014b50], [4, 2, 20], [6, 2, 20], [8, 2, 0x0800], [12, 2, time], [14, 2, date], [16, 4, crc], [20, 4, n], [24, 4, n], [28, 2, name.length], [42, 4, off]]
        .forEach(([o, s, v]) => s === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true));
      local.push(new Uint8Array(lh.buffer), name, f.data); central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + n;
    });
    const cd = concat(central), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cd.length, true); end.setUint32(16, off, true);
    return concat([...local, cd, new Uint8Array(end.buffer)]);
  }
  /** zip bytes → {name: Uint8Array} for entries passing want(name); inflateRaw(bytes, maxBytes) → Promise<Uint8Array> */
  async function unzip(bytes, inflateRaw, want = () => true) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let e = bytes.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('not a ZIP file');
    const out = {}, count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('damaged ZIP directory');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + xl + cl;
      if (!want(name)) continue;
      if (flags & 1) throw new Error('encrypted ZIP');
      if (size === 0xffffffff || usize === 0xffffffff || lo === 0xffffffff) throw new Error('ZIP64 not supported');
      if (usize > MAX_ENTRY || lo + 30 > bytes.length) throw new Error(`ZIP entry too large or damaged: ${name}`);
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = bytes.subarray(start, start + size);
      if (method === 0) out[name] = raw;
      else if (method === 8) out[name] = await inflateRaw(raw, usize);
      else throw new Error(`ZIP method ${method} not supported`);
    }
    return out;
  }

  // ---------- .prj ----------
  const SPHEROID = 'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  const GEOGCS = {
    WGS84: `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",${SPHEROID}`,
    VN2000: `GEOGCS["GCS_VN_2000",DATUM["D_Vietnam_2000",${SPHEROID}`,
  };
  /** ESRI-dialect WKT for a Core CRS object ({kind, datum, lon0, k0, zone}) */
  function toPrj(crs) {
    const g = GEOGCS[crs.datum];
    if (crs.kind === 'geo') return g;
    const dm = Math.round(crs.lon0 * 60), cm = `${Math.floor(dm / 60)}_${String(dm % 60).padStart(2, '0')}`;
    const name = crs.datum === 'WGS84' ? `WGS_1984_UTM_Zone_${crs.zone}N` : crs.zone ? `VN_2000_UTM_Zone_${crs.zone}N` : `VN_2000_TM3_${cm}`;
    return `PROJCS["${name}",${g},PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],`
      + `PARAMETER["Central_Meridian",${crs.lon0}],PARAMETER["Scale_Factor",${crs.k0}],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]`;
  }
  /** WKT1 (ESRI or OGC) → Core-style CRS {kind, datum, lon0, k0, label}; throws for systems the converter cannot handle */
  function parsePrj(wkt) {
    const s = String(wkt || '').trim();
    if (!s) return null;
    if (/Hanoi[_ ]?1972|HN[-_ ]?72|Krass?ovsky/i.test(s)) throw new Error('HN-72 (Hanoi 1972) is not supported');
    const datum = /VN[-_ ]?2000|Vietnam[-_ ]?2000|-191\.904/i.test(s) ? 'VN2000'
      : /WGS[-_ ]?(19)?84/i.test(s) ? 'WGS84' : null;
    if (!datum) throw new Error('.prj datum is neither VN-2000 nor WGS84');
    if (!/^PROJCS/i.test(s)) {
      if (!/^GEOGCS/i.test(s)) throw new Error('unreadable .prj');
      return { kind: 'geo', datum, label: datum === 'VN2000' ? 'VN-2000 (B,L)' : 'WGS84' };
    }
    if (!/Transverse_Mercator/i.test(s)) throw new Error('.prj projection is not Transverse Mercator');
    const par = k => { const m = s.match(new RegExp(`PARAMETER\\["${k}"\\s*,\\s*([-+\\d.eE]+)`, 'i')); return m ? Number(m[1]) : 0; };
    const lon0 = par('central_meridian'), k0 = par('scale_factor');
    if (par('false_easting') !== 500000 || par('false_northing') !== 0 || par('latitude_of_origin') !== 0 || !(k0 > 0.99))
      throw new Error('.prj Transverse Mercator parameters not supported');
    const units = [...s.matchAll(/UNIT\["[^"]*"\s*,\s*([-+\d.eE]+)/gi)], unit = units[units.length - 1];
    if (unit && Math.abs(Number(unit[1]) - 1) > 1e-9) throw new Error('.prj unit is not metres');
    return { kind: 'tm', datum, lon0, k0, label: `${datum === 'VN2000' ? 'VN-2000' : 'WGS84'} TM ${lon0}° k ${k0}` };
  }

  // ---------- .dbf ----------
  /** UTF-8 bytes of s cut to at most n bytes without splitting a character */
  function utf8Cut(s, n) {
    const b = enc.encode(String(s ?? ''));
    if (b.length <= n) return b;
    let k = n; while (k > 0 && (b[k] & 0xc0) === 0x80) k--;
    return b.subarray(0, k);
  }
  /** fields [{name, type:'C'|'N', len, dec}], rows [{name: value}] */
  function writeDbf(fields, rows) {
    const hl = 32 + 32 * fields.length + 1, rl = 1 + fields.reduce((s, f) => s + f.len, 0);
    const buf = new Uint8Array(hl + rl * rows.length + 1), dv = new DataView(buf.buffer), d = new Date();
    buf.set([0x03, d.getFullYear() - 1900, d.getMonth() + 1, d.getDate()]);
    dv.setUint32(4, rows.length, true); dv.setUint16(8, hl, true); dv.setUint16(10, rl, true);
    fields.forEach((f, i) => {
      const o = 32 + 32 * i;
      buf.set(enc.encode(f.name.slice(0, 10)), o); buf[o + 11] = f.type.charCodeAt(0); buf[o + 16] = f.len; buf[o + 17] = f.dec || 0;
    });
    buf[hl - 1] = 0x0d;
    rows.forEach((r, i) => {
      let o = hl + rl * i; buf[o++] = 0x20;
      fields.forEach(f => {
        const v = r[f.name];
        buf.fill(0x20, o, o + f.len);
        if (f.type === 'N') {
          const s = Number.isFinite(v) ? v.toFixed(f.dec || 0) : '';
          if (s.length <= f.len) buf.set(enc.encode(s), o + f.len - s.length);
        } else buf.set(utf8Cut(v, f.len), o);
        o += f.len;
      });
    });
    buf[buf.length - 1] = 0x1a;
    return buf;
  }
  function readDbf(bytes, decoder) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const hl = dv.getUint16(8, true), rl = dv.getUint16(10, true), fields = [];
    if (!rl || hl > bytes.length) throw new Error('damaged .dbf');
    const n = Math.min(dv.getUint32(4, true), Math.floor((bytes.length - hl) / rl));
    for (let o = 32, at = 1; o + 32 <= hl && bytes[o] !== 0x0d; o += 32) {
      const len = bytes[o + 16];
      if (at + len > rl) throw new Error('damaged .dbf');
      fields.push({ name: new TextDecoder().decode(bytes.subarray(o, o + 11)).replace(/\0.*$/, '').trim(), type: String.fromCharCode(bytes[o + 11]), at, len });
      at += len;
    }
    const rows = [];
    for (let i = 0; i < n; i++) {
      const o = hl + rl * i;
      if (o + rl > bytes.length) break;
      const r = {};
      fields.forEach(f => { r[f.name] = decoder(bytes.subarray(o + f.at, o + f.at + f.len)).trim(); });
      rows.push(bytes[o] === 0x2a ? null : r);   // '*' = deleted record
    }
    return { fields, rows };
  }

  // ---------- .shp / .shx ----------
  const TYPE = { Point: 1, LineString: 3, Polygon: 5 };
  const signedArea = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  /** shapefile rings are closed and clockwise (outer) */
  function outerRing(pts) {
    const r = signedArea(pts) > 0 ? [...pts].reverse() : pts;
    const a = r[0], b = r[r.length - 1];
    return a[0] === b[0] && a[1] === b[1] ? r : [...r, a];
  }
  function header(type, words, box) {
    const dv = new DataView(new ArrayBuffer(100));
    dv.setInt32(0, 9994); dv.setInt32(24, words); dv.setInt32(28, 1000, true); dv.setInt32(32, type, true);
    box.forEach((v, i) => dv.setFloat64(36 + 8 * i, v, true));
    return new Uint8Array(dv.buffer);
  }
  /** one layer → [{name, data}] for name.shp/.shx/.dbf/.prj/.cpg; records [{coords:[[x,y]...], attrs}] */
  function write(name, type, fields, records, crs) {
    const st = TYPE[type], box = [Infinity, Infinity, -Infinity, -Infinity];
    const bodies = records.map(r => {
      const pts = st === 5 ? outerRing(r.coords) : st === 1 ? r.coords.slice(0, 1) : r.coords;
      pts.forEach(([x, y]) => { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); });
      if (st === 1) {
        const dv = new DataView(new ArrayBuffer(20));
        dv.setInt32(0, 1, true); dv.setFloat64(4, pts[0][0], true); dv.setFloat64(12, pts[0][1], true);
        return new Uint8Array(dv.buffer);
      }
      const dv = new DataView(new ArrayBuffer(48 + 16 * pts.length));
      const [x0, x1] = minMax(pts.map(p => p[0])), [y0, y1] = minMax(pts.map(p => p[1]));
      dv.setInt32(0, st, true);
      [x0, y0, x1, y1].forEach((v, i) => dv.setFloat64(4 + 8 * i, v, true));
      dv.setInt32(36, 1, true); dv.setInt32(40, pts.length, true); dv.setInt32(44, 0, true);
      pts.forEach(([x, y], i) => { dv.setFloat64(48 + 16 * i, x, true); dv.setFloat64(56 + 16 * i, y, true); });
      return new Uint8Array(dv.buffer);
    });
    if (!records.length) box.fill(0);
    const shpParts = [], shxParts = []; let off = 50;
    bodies.forEach((b, i) => {
      const rh = new DataView(new ArrayBuffer(8)), ix = new DataView(new ArrayBuffer(8));
      rh.setInt32(0, i + 1); rh.setInt32(4, b.length / 2); ix.setInt32(0, off); ix.setInt32(4, b.length / 2);
      shpParts.push(new Uint8Array(rh.buffer), b); shxParts.push(new Uint8Array(ix.buffer));
      off += 4 + b.length / 2;
    });
    return [
      { name: `${name}.shp`, data: concat([header(st, off, box), ...shpParts]) },
      { name: `${name}.shx`, data: concat([header(st, 50 + 4 * bodies.length, box), ...shxParts]) },
      { name: `${name}.dbf`, data: writeDbf(fields, records.map(r => r.attrs)) },
      { name: `${name}.prj`, data: enc.encode(toPrj(crs)) },
      { name: `${name}.cpg`, data: enc.encode('UTF-8') },
    ];
  }

  const SUPPORTED = [0, 1, 3, 5, 8, 11, 13, 15, 18, 21, 23, 25, 28];   // MultiPatch (31) is not
  function readShp(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = [];
    if (bytes.length < 100 || dv.getInt32(0) !== 9994) throw new Error('not a .shp file');
    const end = Math.min(bytes.length, dv.getInt32(24) * 2);
    const pt = o => [dv.getFloat64(o, true), dv.getFloat64(o + 8, true)];
    const bad = () => { throw new Error('damaged .shp'); };
    for (let o = 100; o + 12 <= end;) {
      const len = dv.getInt32(o + 4) * 2, c = o + 8;
      if (len < 4 || c + len > end) bad();
      const st = dv.getInt32(c, true), base = st % 10;   // 11/21 = PointZ/M etc.: x,y layout is the same
      o = c + len;
      if (!SUPPORTED.includes(st)) throw new Error(`shape type ${st} not supported`);
      if (st === 0) { out.push(null); continue; }
      if (base === 1) { if (len < 20) bad(); out.push({ kind: 'Point', parts: [[pt(c + 4)]] }); continue; }
      if (len < 44) bad();
      if (base === 8) {
        const n = dv.getInt32(c + 36, true);
        if (n < 0 || 40 + 16 * n > len) bad();
        out.push({ kind: 'Point', parts: Array.from({ length: n }, (_, i) => [pt(c + 40 + 16 * i)]) });
        continue;
      }
      const np = dv.getInt32(c + 36, true), n = dv.getInt32(c + 40, true), p0 = c + 44 + 4 * np;
      if (np < 0 || n < 0 || 44 + 4 * np + 16 * n > len) bad();
      const starts = Array.from({ length: np }, (_, i) => dv.getInt32(c + 44 + 4 * i, true));
      if (starts.some((s, i) => s < 0 || s > n || (i && s < starts[i - 1]))) bad();
      const parts = starts.map((s, i) => Array.from({ length: (i + 1 < np ? starts[i + 1] : n) - s }, (_, j) => pt(p0 + 16 * (s + j))));
      out.push({ kind: base === 3 ? 'LineString' : 'Polygon', parts });
    }
    return out;
  }
  const NAME_FIELDS = [/^(name|ten|tên|label|nhan|ten_?diem|tendiem)$/i, /^(so_?hieu|sohieu|ma|code|id|stt)$/i];   // stronger first
  /** {shp, dbf?, prj?, cpg?} Uint8Arrays → {features:[{type, name, coords:[[x,y]...]}], crs|null} */
  function read(g) {
    const cpg = g.cpg ? new TextDecoder().decode(g.cpg).trim() : '';
    const utf8 = !cpg || /utf-?8|65001/i.test(cpg), fallback = new TextDecoder('windows-1258');
    const decoder = b => { if (utf8) { try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { /* legacy ANSI */ } } return fallback.decode(b); };
    const dbf = g.dbf ? readDbf(g.dbf, decoder) : { fields: [], rows: [] };
    const nameField = (NAME_FIELDS.map(re => dbf.fields.find(f => re.test(f.name))).find(Boolean) || dbf.fields.find(f => f.type === 'C') || {}).name;
    const features = [];
    readShp(g.shp).forEach((s, i) => {
      const row = dbf.rows[i];
      if (!s || row === null) return;
      const name = nameField && row ? row[nameField] : '';
      if (s.kind === 'Polygon') {   // keep outer (clockwise) rings; holes are dropped
        const rings = s.parts.filter(r => r.length > 3);
        const outer = rings.filter(r => signedArea(r) < 0);
        const open = r => r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r;
        (outer.length ? outer : rings).forEach(r => features.push({ type: 'Polygon', name, coords: open(r) }));
      } else if (s.kind === 'Point') s.parts.forEach(p => features.push({ type: 'Point', name, coords: p }));
      else s.parts.filter(p => p.length > 1).forEach(p => features.push({ type: 'LineString', name, coords: p }));
    });
    return { features, crs: g.prj ? parsePrj(new TextDecoder().decode(g.prj)) : null };
  }

  const api = { zip, unzip, crc32, write, read, toPrj, parsePrj, writeDbf, readDbf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Shp = api;
})(typeof window !== 'undefined' ? window : globalThis);
