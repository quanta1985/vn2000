"""Generate reference values with pyproj (PROJ) for test/ref.json."""
import json
from pyproj import Transformer, CRS

T = [-191.90441429, -39.30318279, -111.45032835]
R = [-0.00928836, 0.01975479, -0.00427372]
S = 0.252906278

def towgs(conv):
    r = R if conv == "pv" else [-x for x in R]  # proj towgs84 = position vector
    return ",".join(str(v) for v in T + r + [S])

def tm(lon0, k, conv):
    return f"+proj=tmerc +lat_0=0 +lon_0={lon0} +k={k} +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84={towgs(conv)} +units=m +no_defs"

pts = [(21.028511, 105.804817), (10.776889, 106.700806), (8.6, 104.72),
       (16.054, 108.202), (22.39, 103.47), (8.645, 111.92), (23.36, 105.32)]

# sanity: CF-flipped towgs84 must match EPSG:6960 pipeline
t6960 = Transformer.from_pipeline(
  "+proj=pipeline +step +proj=axisswap +order=2,1 +step +proj=unitconvert +xy_in=deg +xy_out=rad "
  "+step +proj=cart +ellps=WGS84 +step +inv +proj=helmert +x=-191.90441429 +y=-39.30318279 +z=-111.45032835 "
  "+rx=-0.00928836 +ry=0.01975479 +rz=-0.00427372 +s=0.252906278 +convention=coordinate_frame "
  "+step +inv +proj=cart +ellps=WGS84 +step +proj=unitconvert +xy_in=rad +xy_out=deg +step +proj=axisswap +order=2,1")
geo_cf = Transformer.from_crs("EPSG:4326", CRS.from_proj4("+proj=longlat +ellps=WGS84 +towgs84=" + towgs("cf")), always_xy=False)
for lat, lon in pts[:2]:
    a = t6960.transform(lat, lon); b = geo_cf.transform(lat, lon)
    assert abs(a[0]-b[1]) < 1e-9 and abs(a[1]-b[0]) < 1e-9, (a, b)

out = []
for lat, lon in pts:
    zone = int((lon + 180) // 6) + 1
    e, n = Transformer.from_crs("EPSG:4326", f"EPSG:326{zone}", always_xy=True).transform(lon, lat)
    rec = {"lat": lat, "lon": lon, "utm": {"zone": zone, "e": e, "n": n}, "vn": []}
    for lon0, k in [(105.75, 0.9999), (104.5, 0.9999), (107.75, 0.9999), (105, 0.9996), (111, 0.9996)]:
        for conv in ("cf", "pv"):
            x, y = Transformer.from_crs("EPSG:4326", CRS.from_proj4(tm(lon0, k, conv)), always_xy=True).transform(lon, lat)
            rec["vn"].append({"lon0": lon0, "k": k, "conv": conv, "e": x, "n": y})
    out.append(rec)
json.dump(out, open(__file__.replace("make_ref.py", "ref.json"), "w"), indent=1)
d = out[0]["vn"]
print("ok", len(out), "CF vs PV diff (m):", d[0]["e"]-d[1]["e"], d[0]["n"]-d[1]["n"])
