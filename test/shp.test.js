/* node test/shp.test.js [out.zip] — shapefile/zip/prj round trips. With an argument, also writes a sample zip
 * for test/shp_check.py to open with GDAL. */
const assert = require('assert');
const fs = require('fs');
const zlib = require('zlib');
const C = require('../core.js');
const Shp = require('../shp.js');

const inflateRaw = async b => new Uint8Array(zlib.inflateRawSync(b));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

(async () => {
  // CRC-32 check value
  assert.strictEqual(Shp.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);

  const crs = C.CRS.vnTm3(105);
  const fields = [{ name: 'NAME', type: 'C', len: 254 }, { name: 'AREA_M2', type: 'N', len: 19, dec: 3 }];
  const ccw = [[588000, 2327000], [588100, 2327000], [588100, 2327100], [588000, 2327100]];   // counter-clockwise
  const layers = [
    ...Shp.write('t_points', 'Point', fields.slice(0, 1), [
      { coords: [[588612.456, 2328573.123]], attrs: { NAME: 'Mốc Hồ Gươm' } },
      { coords: [[588700, 2328600]], attrs: { NAME: 'x'.repeat(300) } }], crs),
    ...Shp.write('t_lines', 'LineString', fields.slice(0, 1), [{ coords: [[1, 2], [3, 4], [5, 7]], attrs: { NAME: 'Đường 1' } }], crs),
    ...Shp.write('t_polys', 'Polygon', fields, [{ coords: ccw, attrs: { NAME: 'Thửa 12', AREA_M2: 10000 } }], crs),
  ];
  const bytes = Shp.zip(layers);
  const files = await Shp.unzip(bytes, inflateRaw);
  assert.deepStrictEqual(Object.keys(files).sort(), layers.map(f => f.name).sort());

  const grp = base => ({ shp: files[`${base}.shp`], dbf: files[`${base}.dbf`], prj: files[`${base}.prj`], cpg: files[`${base}.cpg`] });
  const pts = Shp.read(grp('t_points'));
  assert.strictEqual(pts.features[0].name, 'Mốc Hồ Gươm');
  assert.ok(new TextEncoder().encode(pts.features[1].name).length <= 254, 'name cut to field width');
  assert.deepStrictEqual(pts.features[0].coords, [[588612.456, 2328573.123]]);
  assert.strictEqual(pts.crs.datum, 'VN2000'); assert.strictEqual(pts.crs.kind, 'tm');
  assert.strictEqual(pts.crs.lon0, 105); assert.strictEqual(pts.crs.k0, 0.9999);

  const lines = Shp.read(grp('t_lines'));
  assert.deepStrictEqual(lines.features[0].coords, [[1, 2], [3, 4], [5, 7]]);

  const polys = Shp.read(grp('t_polys'));
  const ring = polys.features[0].coords;
  assert.strictEqual(ring.length, 4, 'closing vertex removed on read');
  assert.deepStrictEqual([...ring].sort(), [...ccw].sort(), 'same vertices (written clockwise)');
  near(C.measure(ring.map(([x, y]) => [y, x]), true, (a, b) => ({ x: a, y: b })).area, 10000, 1e-6, 'area');
  const shx = files['t_polys.shx'];
  assert.strictEqual(new DataView(shx.buffer, shx.byteOffset).getInt32(24) * 2, shx.length, 'shx length field');

  // .prj round trips for every CRS the app writes
  [C.CRS.wgs(), C.CRS.utm(48), C.CRS.utm(49), C.CRS.vnTm3(105.75), C.CRS.vnTm3(103), C.CRS.vnUtm(48)].forEach(c => {
    const p = Shp.parsePrj(Shp.toPrj(c));
    assert.strictEqual(p.kind, c.kind); assert.strictEqual(p.datum, c.datum);
    if (c.kind === 'tm') { assert.strictEqual(p.lon0, c.lon0); assert.strictEqual(p.k0, c.k0); }
  });
  // OGC WKT1 as GDAL writes it (TOWGS84 identifies VN-2000)
  const ogc = 'PROJCS["VN-2000 / TM-3 105-45",GEOGCS["VN-2000",DATUM["Vietnam_2000",SPHEROID["WGS 84",6378137,298.257223563],TOWGS84[-191.90441429,-39.30318279,-111.45032835,0.00928836,-0.01975479,0.00427372,0.252906278]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",105.75],PARAMETER["scale_factor",0.9999],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]]]';
  const o = Shp.parsePrj(ogc);
  assert.strictEqual(o.datum, 'VN2000'); assert.strictEqual(o.lon0, 105.75);
  assert.throws(() => Shp.parsePrj('PROJCS["HN72",GEOGCS["Hanoi 1972",DATUM["Hanoi_1972",SPHEROID["Krassowsky 1940",6378245,298.3]]]]'), /HN-72/);
  assert.throws(() => Shp.parsePrj(Shp.toPrj(C.CRS.utm(48)).replace('500000.0', '0.0')), /not supported/);

  // hostile files must throw, not hang
  const shp = new Uint8Array(files['t_lines.shp']);
  new DataView(shp.buffer).setInt32(104, -4);                         // record content length −4 words
  assert.throws(() => Shp.read({ shp }), /damaged \.shp/);
  const shp2 = new Uint8Array(files['t_lines.shp']);
  new DataView(shp2.buffer).setInt32(100 + 8 + 44, 99);               // part start beyond point count
  assert.throws(() => Shp.read({ shp: shp2 }), /damaged \.shp/);
  const dbf = new Uint8Array(files['t_points.dbf']);
  new DataView(dbf.buffer).setUint32(4, 0xffffffff, true); new DataView(dbf.buffer).setUint16(10, 0, true);
  assert.throws(() => Shp.readDbf(dbf, b => ''), /damaged \.dbf/);
  const bomb = new Uint8Array(bytes);                                  // declare a 1 GB entry
  const cdOff = new DataView(bomb.buffer).getUint32(bomb.length - 22 + 16, true);
  new DataView(bomb.buffer).setUint32(cdOff + 24, 1 << 30, true);
  await assert.rejects(Shp.unzip(bomb, inflateRaw), /too large/);

  // python-written deflated zip, if present
  const pyZip = __dirname + '/fixtures/gdal_vn2000.zip';
  if (fs.existsSync(pyZip)) {
    const got = await Shp.unzip(new Uint8Array(fs.readFileSync(pyZip)), inflateRaw, n => /\.(shp|dbf|prj|cpg)$/i.test(n));
    const base = Object.keys(got).find(n => n.endsWith('.shp')).slice(0, -4);
    const r = Shp.read({ shp: got[base + '.shp'], dbf: got[base + '.dbf'], prj: got[base + '.prj'], cpg: got[base + '.cpg'] });
    assert.strictEqual(r.crs.datum, 'VN2000'); assert.strictEqual(r.crs.lon0, 105);
    assert.strictEqual(r.features[0].name, 'Mốc Hồ Gươm');
    near(r.features[0].coords[0][0], 588612.456, 1e-6, 'gdal x');
    console.log('read GDAL-written deflate zip: ok');
  }

  if (process.argv[2]) { fs.writeFileSync(process.argv[2], bytes); console.log('wrote', process.argv[2]); }
  console.log('shp tests passed');
})().catch(e => { console.error(e); process.exit(1); });
