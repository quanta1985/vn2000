// Run: node test/core.test.js   (reference values from test/make_ref.py / pyproj)
const assert = require('assert');
const C = require('../core.js');
const ref = require('./ref.json');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (Δ=${a - b})`);

let worst = 0;
for (const r of ref) {
  const u = C.toUtmAuto(r.lat, r.lon);
  assert.strictEqual(u.zone, r.utm.zone);
  near(u.e, r.utm.e, 1e-3, 'UTM E'); near(u.n, r.utm.n, 1e-3, 'UTM N');
  for (const v of r.vn) {
    const crs = v.k === 0.9999 ? C.CRS.vnTm3(v.lon0) : C.CRS.vnUtm((v.lon0 + 183) / 6);
    const p = C.fromWgs(crs, r.lat, r.lon, v.conv);
    worst = Math.max(worst, Math.abs(p.y - v.e), Math.abs(p.x - v.n));
    near(p.y, v.e, 3e-3, `VN E ${v.lon0} ${v.conv}`); near(p.x, v.n, 3e-3, `VN N ${v.lon0} ${v.conv}`); // ≤3 mm vs PROJ (2D height ambiguity)
    const back = C.toWgs(crs, p.x, p.y, v.conv);           // round trip must be exact
    near(back.lat, r.lat, 1e-11, 'rt lat'); near(back.lon, r.lon, 1e-11, 'rt lon');
    const vn2 = C.fromWgs(crs, back.lat, back.lon, v.conv);
    near(vn2.x, p.x, 1e-6, 'rt X'); near(vn2.y, p.y, 1e-6, 'rt Y');
  }
}

// parser: messy separators, decimal comma, DMS, header lines, names with spaces, swapped order
const messy = [
  'STT  X   Y',
  'Mốc 1   2328573.123    588612.456',
  'M2,2328600.5,588650.25',
  'M3;2328620,75;588700,5',
  'M4\t588750.1\t2328650.2',        // E,N swapped → auto fix
  '  2328700  588800   12.5 ',     // no name, extra height
].join('\n');
const pr = C.parseText(messy, 'proj');
assert.strictEqual(pr.rows.length, 5); assert.strictEqual(pr.skipped.length, 1);
assert.deepStrictEqual(pr.rows.map(r => r.name), ['Mốc 1', 'M2', 'M3', 'M4', 'P5']);
assert.strictEqual(pr.rows[2].a, 2328620.75); assert.strictEqual(pr.rows[2].b, 588700.5);
assert.strictEqual(pr.rows[3].a, 2328650.2); assert.strictEqual(pr.rows[4].extra, '12.5');

const g = C.parseText(`A 21°01'42.6"N 105°48'17.3"E\nB 105.8, 21.03\nC 10,77 106,70`, 'geo');
assert.strictEqual(g.rows.length, 3);
near(g.rows[0].a, 21 + 1 / 60 + 42.6 / 3600, 1e-9, 'dms lat'); near(g.rows[0].b, 105 + 48 / 60 + 17.3 / 3600, 1e-9, 'dms lon');
assert.strictEqual(g.rows[1].a, 21.03); assert.strictEqual(g.rows[1].b, 105.8);    // lon,lat swapped
assert.strictEqual(g.rows[2].a, 10.77);                                           // decimal comma

// review fixes: numeric STT before lat/lon must not be read as a coordinate; CSV formula injection
const idg = C.parseText('10 21.0285 105.8542 12.5\n1\t21.03\t105.85', 'geo').rows;
assert.deepStrictEqual(idg.map(r => [r.name, r.a, r.b]), [['10', 21.0285, 105.8542], ['1', 21.03, 105.85]]);
assert.ok(C.toCsv(['n'], [['=HYPERLINK("x")'], [-12.5]]).includes(`"'=HYPERLINK(""x"")"`) && C.toCsv(['n'], [[-12.5]]).includes('\r\n-12.5'));

// measurement: 100 m square on the grid
const crs = C.CRS.vnTm3(105);
const sq = [[0, 0], [0, 100], [100, 100], [100, 0]].map(([dx, dy]) => C.toWgs(crs, 2300000 + dx, 500000 + dy)).map(p => [p.lat, p.lon]);
const m = C.measure(sq, true, (la, lo) => C.fromWgs(crs, la, lo));
near(m.area, 10000, 1e-3, 'area'); near(m.length, 400, 1e-4, 'perimeter');

// exporters
const feats = [{ type: 'Point', name: 'A<&>', coords: [[21, 105]] }, { type: 'Polygon', name: 'P', coords: sq }];
const kml = C.toKml(feats, { docName: 'd', pointColor: '#ff0000', iconScale: 1, icon: 'circle', showLabels: true, labelScale: 1, lineColor: '#00ff00', lineWidth: 2, fillColor: '#0000ff', fillOpacity: 0.5, folders: true, folderNames: { Point: 'Pts', LineString: 'L', Polygon: 'Pg' } });
assert.ok(kml.includes('A&lt;&amp;&gt;') && kml.includes('<color>ff0000ff</color>') && kml.includes('80ff0000'));
assert.strictEqual(JSON.parse(C.toGeoJson(feats)).features[1].geometry.coordinates[0].length, 5);
assert.ok(C.toDxf([{ type: 'Polygon', name: 'P', pts: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 0 }] }]).includes('POLYLINE'));
assert.ok(C.toCsv(['a', 'b'], [['x,y', 'q"']]).includes('"x,y","q"""'));
assert.strictEqual(C.toDms(21.5, 'N', 'S', 1), '21°30′00.0″N');
assert.strictEqual(C.PROVINCES.length, 34);
assert.deepStrictEqual(C.fromGeoJson({ type: 'Feature', properties: { name: 'x' }, geometry: { type: 'Point', coordinates: [105, 21] } })[0].coords, [[21, 105]]);

console.log(`all core tests passed (worst WGS→VN-2000 Δ vs PROJ = ${(worst * 1000).toFixed(2)} mm)`);
