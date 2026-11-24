// Bản đồ MapLibre không dùng bản đồ nền ngoài: nền từ basemap.geojson (Natural Earth, quan điểm Việt Nam), 452 ô tô
// màu qua feature-state, viền ô mảnh, mẫu chấm cho ô không xác định, gạch chéo nơi 3 GCM khác chiều, chấm và khung
// nét đứt cho Hoàng Sa, Trường Sa, lưới kinh vĩ độ, nhãn bằng HTML marker.

const ml = () => window.maplibregl;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const BOUNDS = [[101.5, 7.0], [117.5, 24.0]];
const N_LABELS = 10;

function graticule() {
  const f = [];
  for (let lon = 100; lon <= 120; lon += 2) f.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[lon, 2], [lon, 28]] } });
  for (let lat = 4; lat <= 26; lat += 2) f.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[96, lat], [122, lat]] } });
  return { type: "FeatureCollection", features: f };
}

function patternImage(draw) {
  const n = 8, c = document.createElement("canvas");
  c.width = n; c.height = n;
  const g = c.getContext("2d");
  draw(g, n);
  return g.getImageData(0, 0, n, n);
}

const hatchImage = (color) => patternImage((g, n) => {
  g.strokeStyle = color; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(0, n); g.lineTo(n, 0); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(n - 2, n + 2); g.lineTo(n + 2, n - 2); g.stroke();
});

const dotsImage = (color) => patternImage((g) => {
  g.fillStyle = color;
  g.beginPath(); g.arc(2, 2, 1.1, 0, 2 * Math.PI); g.arc(6, 6, 1.1, 0, 2 * Math.PI); g.fill();
});

function label(map, lngLat, text, cls) {
  const el = document.createElement("div");
  el.className = cls;
  el.textContent = text;
  return new (ml().Marker)({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map);
}

const idFilter = (ids) => ["in", ["get", "id"], ["literal", ids]];

export function initMap(container, { basemap, cells, places, provinces, palettes, theme, t }) {
  const M = ml();
  const map = new M.Map({
    container, bounds: BOUNDS, fitBoundsOptions: { padding: 12 }, attributionControl: false,
    keyboard: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, renderWorldCopies: false,
    style: {
      version: 8,
      sources: {
        basemap: { type: "geojson", data: basemap },
        cells: { type: "geojson", data: cells, promoteId: "id" },
        grat: { type: "geojson", data: graticule() },
        provinces: { type: "geojson", data: provinces },
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": css("--sea") } },
        { id: "land", type: "fill", source: "basemap", filter: ["==", ["get", "kind"], "neighbor"], paint: { "fill-color": css("--land") } },
        { id: "vn", type: "fill", source: "basemap", filter: ["==", ["get", "kind"], "vn"], paint: { "fill-color": css("--land-vn") } },
        { id: "grat", type: "line", source: "grat", paint: { "line-color": css("--border"), "line-opacity": 0.3, "line-width": 0.6 } },
        { id: "cells", type: "fill", source: "cells",
          paint: { "fill-color": ["coalesce", ["feature-state", "color"], palettes.NA[theme]], "fill-antialias": false } },
        { id: "cell-lines", type: "line", source: "cells", paint: { "line-color": css("--fg"), "line-opacity": 0.14, "line-width": 0.4 } },
        { id: "provinces", type: "line", source: "provinces", filter: ["==", ["get", "kind"], "province"],
          paint: { "line-color": css("--fg"), "line-opacity": 0.5, "line-width": 0.7 } },
        { id: "borders", type: "line", source: "basemap", filter: ["in", ["get", "kind"], ["literal", ["vn", "neighbor"]]],
          paint: { "line-color": css("--border"), "line-width": 0.8 } },
        { id: "island-frames", type: "line", source: "basemap", filter: ["==", ["get", "kind"], "island_frame"],
          paint: { "line-color": css("--fg"), "line-width": 0.9, "line-dasharray": [3, 2], "line-opacity": 0.75 } },
        { id: "islands", type: "circle", source: "basemap", filter: ["==", ["get", "kind"], "island"],
          paint: { "circle-radius": 2.2, "circle-color": css("--fg"), "circle-stroke-color": css("--panel"), "circle-stroke-width": 1 } },
        { id: "sel-halo", type: "line", source: "cells", filter: ["==", ["get", "id"], -1],
          paint: { "line-color": "#ffffff", "line-width": 4.5 } },
        { id: "sel", type: "line", source: "cells", filter: ["==", ["get", "id"], -1],
          paint: { "line-color": "#111111", "line-width": 2 } },
      ],
    },
  });
  map.addControl(new M.NavigationControl({ showCompass: false }), "bottom-right");
  map.addControl(new M.ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-right");

  let clickCb = () => {};
  let hatchIds = [], naIds = [];
  let colors = null;
  let userMoved = false;
  let th = theme;
  const ready = new Promise((resolve) => map.on("load", resolve));
  const hatchColor = () => (th === "dark" ? "#e8ecee" : "#222222");
  const dotColor = () => (th === "dark" ? "#c3cbd0" : "#59646b");

  ready.then(() => {
    map.addImage("hatch", hatchImage(hatchColor()));
    map.addImage("dots", dotsImage(dotColor()));
    map.addLayer({ id: "na-dots", type: "fill", source: "cells", filter: idFilter(naIds), paint: { "fill-pattern": "dots" } }, "cell-lines");
    map.addLayer({ id: "hatch", type: "fill", source: "cells", filter: idFilter(hatchIds), paint: { "fill-pattern": "hatch" } }, "cell-lines");
    if (colors) paint(colors);
    for (let lon = 102; lon <= 114; lon += 2) label(map, [lon, 7.25], `${lon}°E`, "lbl-grat");
    for (let lat = 8; lat <= 22; lat += 2) label(map, [101.75, lat], `${lat}°N`, "lbl-grat");
    const shown = places.slice(0, container.clientWidth < 600 ? 6 : N_LABELS);
    shown.forEach((p) => label(map, [p.lon, p.lat], p.name, "lbl-place"));
    const shownNames = new Set(shown.map((p) => p.name));
    label(map, [112.1, 17.75], t("map.label.paracel"), "lbl-isl");
    label(map, [114.0, 12.3], t("map.label.spratly"), "lbl-isl");
    label(map, [110.6, 14.4], t("map.label.sea"), "lbl-sea");
    // tên tỉnh: chỉ hiện khi phóng to hơn mức cả nước để bản đồ khỏi rối
    provLabels = provinces.features.filter((f) => f.properties.kind === "province_label" && !shownNames.has(f.properties.name.replace(/^TP\. /, "Thành phố ")) && !shownNames.has(f.properties.name))
      .map((f) => label(map, f.geometry.coordinates, f.properties.name, "lbl-prov off"));
    baseZoom = map.getZoom();
    toggleProvLabels();
  });
  let provLabels = [], baseZoom = null;
  function toggleProvLabels() {
    if (baseZoom === null) return;
    const on = map.getZoom() >= baseZoom + 1;
    provLabels.forEach((m) => m.getElement().classList.toggle("off", !on));
  }
  map.on("zoom", toggleProvLabels);

  map.on("movestart", (e) => { if (e.originalEvent) userMoved = true; });
  new ResizeObserver(() => {
    map.resize();
    if (!userMoved) { map.fitBounds(BOUNDS, { padding: 12, animate: false }); if (baseZoom !== null) { baseZoom = map.getZoom(); toggleProvLabels(); } }
  }).observe(container);

  map.on("click", "cells", (e) => { const f = e.features && e.features[0]; if (f) clickCb(f.properties.id); });
  map.on("mouseenter", "cells", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "cells", () => { map.getCanvas().style.cursor = ""; });

  function paint(cs) {
    for (let i = 0; i < cs.length; i++) map.setFeatureState({ source: "cells", id: i }, { color: cs[i] });
  }
  const ids = (mask, want) => { const out = []; (mask || []).forEach((m, i) => { if (m === want) out.push(i); }); return out; };

  return {
    map,
    ready,
    setColors(cs) { colors = cs; if (map.isStyleLoaded() && map.getLayer("hatch")) paint(cs); else ready.then(() => paint(cs)); },
    /** mask: 1 = gạch chéo (3 GCM khác chiều, thay đổi đáng kể). */
    setHatch(mask) {
      hatchIds = ids(mask, 1);
      ready.then(() => map.getLayer("hatch") && map.setFilter("hatch", idFilter(hatchIds)));
    },
    /** values: null = ô không xác định → mẫu chấm. */
    setUndefined(values) {
      naIds = ids((values || []).map((v) => (v === null ? 1 : 0)), 1);
      ready.then(() => map.getLayer("na-dots") && map.setFilter("na-dots", idFilter(naIds)));
    },
    select(id, cell) {
      ready.then(() => {
        const f = ["==", ["get", "id"], id === null ? -1 : id];
        map.setFilter("sel", f);
        map.setFilter("sel-halo", f);
        if (cell && !map.getBounds().contains([cell.lon, cell.lat])) map.jumpTo({ center: [cell.lon, cell.lat] });
      });
    },
    setTheme(next) {
      th = next;
      ready.then(() => {
        map.setPaintProperty("bg", "background-color", css("--sea"));
        map.setPaintProperty("land", "fill-color", css("--land"));
        map.setPaintProperty("vn", "fill-color", css("--land-vn"));
        map.setPaintProperty("borders", "line-color", css("--border"));
        map.setPaintProperty("grat", "line-color", css("--border"));
        map.setPaintProperty("cell-lines", "line-color", css("--fg"));
        map.setPaintProperty("provinces", "line-color", css("--fg"));
        map.setPaintProperty("island-frames", "line-color", css("--fg"));
        map.setPaintProperty("islands", "circle-color", css("--fg"));
        map.setPaintProperty("islands", "circle-stroke-color", css("--panel"));
        map.setPaintProperty("cells", "fill-color", ["coalesce", ["feature-state", "color"], palettes.NA[next]]);
        map.updateImage("hatch", hatchImage(hatchColor()));
        map.updateImage("dots", dotsImage(dotColor()));
      });
    },
    onCellClick(cb) { clickCb = cb; },
    fitTo(bbox) { userMoved = true; ready.then(() => map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, animate: false })); },
  };
}
