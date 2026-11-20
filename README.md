# VN2000 ⇄ UTM ⇄ WGS84 Converter

Công cụ web chuyển đổi tọa độ cho Việt Nam, theo kinh tuyến trục của **34 tỉnh/thành sau sáp nhập (01/07/2025)**. Song ngữ Việt/Anh. Chạy hoàn toàn trên trình duyệt, không cần máy chủ xử lý, không cần API key.

**Dùng trực tuyến:** https://quanta1985.github.io/vn2000/

*Web coordinate converter for Vietnam (VN-2000 with post-2025 provincial central meridians, UTM, WGS84). Bilingual VI/EN, fully client-side, no API keys.*

## Chức năng

| Nhóm | Chi tiết |
|---|---|
| Chuyển đổi | VN-2000 TM-3 (k 0.9999, 34 tỉnh + tự nhập KTT), VN-2000 UTM 6° (48/49), WGS84 UTM (tự nhận múi), WGS84 độ thập phân / độ-phút-giây |
| Nhập liệu | 1 điểm (kết quả tức thì) hoặc hàng loạt: gõ tay, dán từ Excel/Word, mở / kéo-thả TXT, CSV, TSV, KML, GeoJSON, Shapefile (.zip hoặc .shp+.dbf+.prj; đọc .prj để nhận VN-2000/UTM/WGS84) |
| Tự sửa định dạng | dấu cách đôi, tab, phẩy, chấm phẩy, `|`, dấu phẩy thập phân, DMS, dòng tiêu đề, cột tên/STT, X/Y bị đảo, mã hóa UTF-8/UTF-16/Windows-1258 |
| Bản đồ | Vệ tinh, Vệ tinh + nhãn (Esri), OpenStreetMap, OpenTopoMap — không cần key. Tọa độ con trỏ theo 3 hệ, bay tới tọa độ, GPS |
| Vẽ & đo | Điểm, đường, vùng; chiều dài, chu vi, diện tích (m², ha) trên mặt phẳng chiếu VN-2000; kéo đỉnh để sửa, chuột phải xoá đỉnh; bắt điểm vào điểm đã có |
| Xuất | KML (biểu tượng, màu, cỡ, nhãn, mô tả kèm bảng tọa độ, thư mục; điểm → đường/vùng), CSV (UTF-8 BOM cho Excel), GeoJSON, Shapefile .zip (mỗi loại hình một lớp, .prj + .cpg UTF-8) và DXF R12 — chọn VN-2000 / UTM / WGS84; ảnh bản đồ PNG có khung lưới tọa độ, chú giải, thước tỷ lệ, hướng Bắc |

## Tham số

- Ellipsoid WGS84 (a = 6378137, 1/f = 298.257223563) — dùng cho cả VN-2000.
- VN-2000 → WGS84: 7 tham số TT 973/2001/TT-TCĐC = EPSG:6960, quy ước **Coordinate Frame** (như QGIS/PROJ):
  ΔX −191.90441429, ΔY −39.30318279, ΔZ −111.45032835 m; ωx −0.00928836″, ωy 0.01975479″, ωz −0.00427372″; k 0.252906278 ppm.
  Có thể đổi sang Position Vector (một số phần mềm cũ, lệch ≈ 0.7 m).
- Độ chính xác: khớp PROJ/pyproj ≤ 1.1 mm (giới hạn của phép Helmert 2D bỏ qua độ cao); VN→WGS→VN trở về đúng giá trị nhập.

Kinh tuyến trục lấy từ bảng tổng hợp sau sáp nhập (thuvienphapluat.vn, rtkvn.vn, viet-thanh.vn, dodacrtk.com). **Lai Châu = 103°00′** (các nguồn không thống nhất; theo dodacrtk.com và giá trị trước sáp nhập). Đối chiếu văn bản chính thức trước khi dùng cho hồ sơ pháp lý.

## Tệp

```
index.html  style.css  i18n.js  core.js  app.js     ← toàn bộ ứng dụng (tĩnh)
collar.js                                           ← khung bản đồ: lưới km/kinh vĩ độ tự cập nhật
shp.js                                              ← đọc/ghi Shapefile, .prj, ZIP (không thư viện ngoài)
mapimage.js                                         ← xuất ảnh bản đồ PNG có khung tọa độ
fonts/  vendor/leaflet/                             ← font Overpass + Leaflet tự lưu trữ (không phụ thuộc CDN)
test/core.test.js   node test/core.test.js           ← so với PROJ (test/ref.json)
test/make_ref.py    python test/make_ref.py          ← tạo ref.json bằng pyproj
test/shp.test.js    node test/shp.test.js            ← Shapefile/ZIP/.prj
test/shp_check.py   python test/shp_check.py         ← đối chiếu Shapefile với GDAL (geopandas)
test/e2e.py         python test/e2e.py               ← Playwright smoke test
```

Phụ thuộc: Leaflet 1.9.4 và font Overpass / Overpass Mono (SIL OFL 1.1), đều lưu cùng ứng dụng. Chỉ ảnh nền bản đồ tải từ bên ngoài.

## Ghi chú

- Lưu trữ trên GitHub Pages (HTTPS, nên GPS và nút sao chép hoạt động); mỗi lần `git push` là triển khai. GitHub Actions chạy kiểm thử.
- Địa chỉ cũ http://remosat.usth.edu.vn/~quanta/vn2000/ tự chuyển sang địa chỉ mới.
- Dữ liệu vẽ và tùy chọn lưu trong trình duyệt (localStorage) của từng người dùng.
- Bản đồ nền: © Esri, Maxar, Earthstar Geographics; © OpenStreetMap contributors; © OpenTopoMap (CC-BY-SA).

## Bản quyền

© 2026 Trần Anh Quân (Quan Tran-Anh) — Khoa Môi trường, Trường Đại học Mỏ - Địa chất; REMOSAT Lab, USTH. Bảo lưu mọi quyền. Được sử dụng miễn phí trực tuyến; mã nguồn, văn bản và thiết kế không được sao chép, phân phối lại khi chưa có sự đồng ý bằng văn bản.
Giới thiệu và cách trích dẫn: http://remosat.usth.edu.vn/~quanta/vn2000.html
