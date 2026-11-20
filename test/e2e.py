"""Smoke E2E: serve folder, drive main flows, screenshot. Run: python test/e2e.py"""
import http.server, threading, functools, os, sys, shutil, zipfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "test", "shots")
os.makedirs(OUT, exist_ok=True)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{srv.server_port}/index.html"
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.goto(url); pg.wait_for_timeout(1500)
    # single point: VN-2000 Hà Nội (105°00') pasted as a pair
    pg.fill("#inA", "2328573.123   588612.456"); pg.dispatch_event("#inA", "input")
    single = pg.inner_text("#singleOut"); assert "UTM" in single and "21." in single, single
    pg.screenshot(path=f"{OUT}/1_single.png")
    # batch with messy text
    pg.click("#modeSeg [data-mode=multi]")
    pg.fill("#multiIn", "STT X Y\nM1  2328573.123    588612.456\nM2,2328600.5,588650.25\nM3;2328620,75;588700,5\nM4\t588750.1\t2328650.2")
    pg.click("#convertBtn"); pg.wait_for_timeout(800)
    stats = pg.inner_text("#multiStats"); assert "4" in stats, stats
    assert pg.locator("#resTable tbody tr").count() == 4
    pg.screenshot(path=f"{OUT}/2_batch.png")
    # names must never execute as HTML (tooltips)
    pg.fill("#multiIn", "<img/src=x/onerror=window.__x=1>  2328573.123  588612.456"); pg.click("#convertBtn"); pg.wait_for_timeout(500)
    assert pg.evaluate("window.__x") is None, "XSS via point name"
    pg.fill("#multiIn", "STT X Y\nM1  2328573.123    588612.456\nM2,2328600.5,588650.25\nM3;2328620,75;588700,5\nM4\t588750.1\t2328650.2")
    pg.click("#convertBtn"); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.click("[data-export=res-csv]")
    assert d.value.suggested_filename.endswith(".csv")
    pg.click("[data-export=res-kml]"); pg.select_option("#kGeom", "all")
    with pg.expect_download() as d: pg.click("#kmlDlg button[value=ok]")
    kml = open(d.value.path(), encoding="utf-8").read(); assert "<Polygon>" in kml and "<Point>" in kml
    # promote to polygon, then draw a line
    pg.click("[data-promote=Polygon]"); pg.wait_for_timeout(300)
    assert pg.locator("#featList li").count() == 1
    pg.click("[data-tool=LineString]")
    for x, y in [(800, 400), (900, 450), (1000, 420)]: pg.mouse.click(x, y); pg.wait_for_timeout(120)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    assert pg.locator("#featList li").count() == 2, pg.inner_text("#featList")
    pg.click("[data-tool=select]")
    pg.click("[data-export=feat-dxf]")
    with pg.expect_download() as d: pg.click("#crsDlg button[value=ok]")
    dxf = open(d.value.path(), encoding="ascii").read(); assert "POLYLINE" in dxf and r"\U+" in dxf
    # SHP export (VN-2000 default) → zip per geometry type with a VN-2000 .prj
    pg.click("[data-export=feat-shp]")
    with pg.expect_download() as d: pg.click("#crsDlg button[value=ok]")
    z = zipfile.ZipFile(d.value.path()); names = z.namelist()
    assert any(n.endswith("_polygons.shp") for n in names) and any(n.endswith("_lines.prj") for n in names), names
    prj = z.read([n for n in names if n.endswith(".prj")][0]).decode()
    assert "D_Vietnam_2000" in prj and 'Central_Meridian",105' in prj, prj
    # SHP import (GDAL-written, deflated zip)
    pg.set_input_files("#importIn", os.path.join(ROOT, "test", "fixtures", "gdal_vn2000.zip")); pg.wait_for_timeout(600)
    assert pg.locator("#featList li").count() == 3, pg.inner_text("#featList")
    assert "Mốc Hồ Gươm" in pg.eval_on_selector_all("#featList input", "els => els.map(e => e.value).join('|')")
    # map image with coordinate frame
    with pg.expect_download(timeout=60000) as d: pg.click("#pngBtn")
    png = open(d.value.path(), "rb").read(); assert png[:8] == b"\x89PNG\r\n\x1a\n" and len(png) > 200_000, len(png)
    shutil.copy(d.value.path(), f"{OUT}/3b_map_export.png")
    pg.screenshot(path=f"{OUT}/3_draw.png")
    # language + theme + info
    pg.click("[data-lang=en]"); pg.click("[data-tab=info]"); pg.wait_for_timeout(400)
    assert "parameters" in pg.inner_text("[data-pane=info]").lower() and "what it does" not in pg.inner_text("[data-pane=info]").lower() and "All rights reserved" in pg.inner_text(".copyright")
    pg.screenshot(path=f"{OUT}/4_info_en.png")
    # go-to
    pg.fill("#gotoIn", "10.776889 106.700806"); pg.keyboard.press("Enter"); pg.wait_for_timeout(800)
    # mobile
    m = b.new_page(viewport={"width": 390, "height": 844}); m.on("pageerror", lambda e: errors.append(str(e)))
    m.goto(url); m.wait_for_timeout(1200); m.screenshot(path=f"{OUT}/5_mobile.png")
    b.close()
srv.shutdown()
bad = [e for e in errors if "tile" not in e.lower() and "net::" not in e]
assert not bad, bad
print("e2e ok; shots in", OUT)
