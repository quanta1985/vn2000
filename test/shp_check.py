"""Cross-check shp.js against GDAL: open the zip it writes, and write a deflated zip for it to read.
Run: python test/shp_check.py   (calls node test/shp.test.js)"""
import os
import subprocess
import tempfile
import zipfile

import geopandas as gpd
from pyproj import CRS
from pyproj.crs import ProjectedCRS
from pyproj.crs.coordinate_operation import TransverseMercatorConversion
from shapely.geometry import Point

HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures")
os.makedirs(FIX, exist_ok=True)

# 1. GDAL writes a VN-2000 TM-3 105 shapefile, zipped with deflate, for shp.js to read
vn105 = ProjectedCRS(name="VN-2000 / TM-3 105-00", geodetic_crs=CRS.from_epsg(4756),
                     conversion=TransverseMercatorConversion(latitude_natural_origin=0, longitude_natural_origin=105,
                                                             false_easting=500000, false_northing=0, scale_factor_natural_origin=0.9999))
with tempfile.TemporaryDirectory() as d:
    gpd.GeoDataFrame({"Name": ["Mốc Hồ Gươm"]}, geometry=[Point(588612.456, 2328573.123)], crs=vn105) \
        .to_file(os.path.join(d, "gdal_vn2000.shp"), encoding="utf-8")
    with zipfile.ZipFile(os.path.join(FIX, "gdal_vn2000.zip"), "w", zipfile.ZIP_DEFLATED) as z:
        for f in os.listdir(d):
            z.write(os.path.join(d, f), f)
    print("GDAL .prj:", open(os.path.join(d, "gdal_vn2000.prj")).read())

# 2. shp.js writes a zip; GDAL must read names, coordinates and the VN-2000 CRS
out = os.path.join(tempfile.gettempdir(), "shpjs_out.zip")
subprocess.run(["node", os.path.join(HERE, "shp.test.js"), out], check=True)
for layer, n in [("t_points", 2), ("t_lines", 1), ("t_polys", 1)]:
    g = gpd.read_file(f"zip://{out}!{layer}.shp")
    assert len(g) == n, (layer, len(g))
    crs = g.crs
    assert crs is not None and "Vietnam 2000" in crs.datum.name, crs.datum.name
    p = {x.name: x.value for x in crs.coordinate_operation.params}
    assert p["Longitude of natural origin"] == 105 and abs(p["Scale factor at natural origin"] - 0.9999) < 1e-12, p
    if layer == "t_points":
        assert g.NAME[0] == "Mốc Hồ Gươm", g.NAME[0]
        assert abs(g.geometry[0].x - 588612.456) < 1e-9 and abs(g.geometry[0].y - 2328573.123) < 1e-9
    if layer == "t_polys":
        assert abs(g.geometry[0].area - 10000) < 1e-6 and g.geometry[0].is_valid
        assert g.AREA_M2[0] == 10000
print("GDAL cross-check passed; EPSG match:", gpd.read_file(f"zip://{out}!t_points.shp").crs.to_epsg(min_confidence=20))
