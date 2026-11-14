# site/ — FHE Atlas, trang web tĩnh (Giai đoạn 4b-2)

Trang web tĩnh: HTML, CSS và JavaScript module thuần, không cần máy chủ tính toán, không có bước build. Mọi lớp bản đồ đã được tính sẵn trong `data/`.

## Xem thử trên máy

```
python -m http.server -d site 8000
```

Mở `http://localhost:8000`. Phải mở qua máy chủ web như trên; mở trực tiếp tệp `index.html` thì trình duyệt chặn đọc `data/*.json`.

## Xuất lại số liệu

```
PYTHONIOENCODING=utf-8 python scripts/run_stage1a.py --dataset atlas_basemap   # nền Natural Earth (quan điểm Việt Nam), địa danh
PYTHONIOENCODING=utf-8 python scripts/run_stage1a.py --dataset atlas_export    # 19 lớp, lưới ô, chuỗi từng ô, manifest
```

`atlas_export` đọc `data/processed/{risk,extremes,sm,twsa}` (Giai đoạn 2–4b-1) và dừng nếu thứ tự ô giữa các tệp lệch. Ngân sách dung lượng:
- tổng `data/` ≤ 30 MB;
- mỗi lớp ≤ 2 MB;
- nền ≤ 1 MB.

Hiện tổng `data/` khoảng 4,6 MB.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `index.html` | Bản đồ (trang chính) |
| `phuong-phap.html`, `du-lieu.html`, `gioi-thieu.html` | Các trang chữ |
| `assets/scales.js` | Hàm thuần: thang màu, số tiếng Việt, đường dẫn chia sẻ (kiểm thử: `node --test "tests/js/*.test.mjs"`) |
| `assets/map.js`, `assets/app.js` | Bản đồ MapLibre; trạng thái, điều khiển, khung chi tiết |
| `assets/palettes.json` | Bảng màu ColorBrewer, dùng chung cho Python và JS |
| `assets/i18n/vi.json` | Toàn bộ chữ hiển thị; thêm `en.json` để có bản tiếng Anh |
| `vendor/maplibre-gl/` | MapLibre GL JS 4.7.1 (BSD-3-Clause), sha256 trong `VERSION.txt` |
| `vendor/fonts/` | Source Sans 3 (SIL OFL 1.1), bản `@fontsource` 5.3.1 |
| `data/index.json` | Danh sách lớp, GCM, SSP, giai đoạn, trạng thái mặc định |
| `data/layers/<lớp>.json` | `data[ssp][bản TWSA].value/change[GCM][giai đoạn][ô]`, `agree`, `scale` (bảng màu và ngưỡng); `null` là ô không xác định |
| `data/cell/<id>.json` | Số tháng có sự kiện mỗi năm (quan trắc, 3 GCM × 2 SSP) và chỉ tiêu xã hội của ô |
| `data/cells.geojson`, `basemap.geojson`, `places.json` | Lưới ô, nền, địa danh |
| `data/manifest.json` | Phiên bản mã, ngày xuất, sha256 từng tệp |

**Đường dẫn chia sẻ** lưu trạng thái màn hình theo dạng `#lớp-ssp-giai_đoạn-gcm-bản-chế_độ-ô`, ví dụ `#risk_class-ssp585-2-median-main-value-120`.

## Quy tắc

- Không dùng bản đồ nền, dịch vụ ô bản đồ hay CDN khi chạy. Mọi tệp đều nằm trong thư mục này (kiểm thử: `tests/test_site_static.py`).
- Màu chỉ lấy từ `palettes.json`, không dùng bảng màu cầu vồng.
- Giấy phép Meta RWI là CC BY-NC 4.0, nên các lớp SVI, mức thiếu thốn, thiếu năng lực chống chịu và rủi ro chỉ được dùng cho mục đích phi thương mại.
