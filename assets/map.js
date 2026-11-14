// Bản đồ MapLibre không dùng bản đồ nền ngoài: nền từ basemap.geojson (Natural Earth, quan điểm Việt Nam), 452 ô tô
// màu qua feature-state, lớp gạch chéo nơi 3 GCM không cùng chiều, lưới kinh vĩ độ, nhãn bằng HTML marker.

const ml = () => window.maplibregl;
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const BOUNDS = [[101.5, 7.0], [117.5, 24.0]];

function graticule() {
  const f = [];
  for (let lon = 100; lon <= 120; lon += 2) f.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[lon, 2], [lon, 28]] } });
  for (let lat = 4; lat <= 26; lat += 2) f.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[96, lat], [122, lat]] } });
  return { type: "FeatureCollection", features: f };
}

function hatchImage(color) {
  const n = 8, c = document.createElement("canvas");
  c.width = n; c.height = n;
  const g = c.getContext("2d");
  g.strokeStyle = color; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(0, n); g.lineTo(n, 0); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(n - 2, n + 2); g.lineTo(n + 2, n - 2); g.stroke();
  return g.getImageData(0, 0, n, n);
}

function label(map, lngLat, text, cls) {
  const el = document.createElement("div");
  el.className = cls;
  el.textContent = text;
  return new (ml().Marker)({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map);
}

export function initMap(container, { basemap, cells, places, palettes, theme, t }) {
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
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": css("--sea") } },
        { id: "land", type: "fill", source: "basemap", filter: ["==", ["get", "kind"], "neighbor"], paint: { "fill-color": css("--land") } },
        { id: "vn", type: "fill", source: "basemap", filter: ["==", ["get", "kind"], "vn"], paint: { "fill-color": css("--land-vn") } },
        { id: "grat", type: "line", source: "grat", paint: { "line-color": css("--border"), "line-opacity": 0.3, "line-width": 0.6 } },
        { id: "cells", type: "fill", source: "cells",
          paint: { "fill-color": ["coalesce", ["feature-state", "color"], palettes.NA[theme]], "fill-antialias": false } },
        { id: "borders", type: "line", source: "basemap", filter: ["!=", ["get", "kind"], "island"],
          paint: { "line-color": css("--border"), "line-width": 0.8 } },
        { id: "islands", type: "circle", source: "basemap", filter: ["==", ["get", "kind"], "island"],
          paint: { "circle-radius": 2.5, "circle-color": css("--fg") } },
        { id: "sel", type: "line", source: "cells", filter: ["==", ["get", "id"], -1],
          paint: { "line-color": css("--sel"), "line-width": 2.2 } },
      ],
    },
  });
  map.addControl(new M.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new M.ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-right");

  let clickCb = () => {};
  let hatchIds = [];
  let colors = null;
  const ready = new Promise((resolve) => map.on("load", resolve));

  ready.then(() => {
    map.addImage("hatch", hatchImage("#222222"));
    map.addLayer({ id: "hatch", type: "fill", source: "cells", filter: ["in", ["get", "id"], ["literal", hatchIds]],
      paint: { "fill-pattern": "hatch" } }, "borders");
    if (colors) paint(colors);
    for (let lon = 102; lon <= 116; lon += 2) label(map, [lon, 7.25], `${lon}°E`, "lbl-grat");
    for (let lat = 8; lat <= 22; lat += 2) label(map, [101.75, lat], `${lat}°N`, "lbl-grat");
    places.slice(0, 18).forEach((p) => label(map, [p.lon, p.lat], p.name, "lbl-place"));
    label(map, [112.1, 17.35], t("map.label.paracel"), "lbl-isl");
    label(map, [113.9, 12.05], t("map.label.spratly"), "lbl-isl");
    label(map, [111.4, 14.4], t("map.label.sea"), "lbl-sea");
  });

  map.on("click", "cells", (e) => { const f = e.features && e.features[0]; if (f) clickCb(f.properties.id); });
  map.on("mouseenter", "cells", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "cells", () => { map.getCanvas().style.cursor = ""; });

  function paint(cs) {
    for (let i = 0; i < cs.length; i++) map.setFeatureState({ source: "cells", id: i }, { color: cs[i] });
  }

  return {
    map,
    ready,
    setColors(cs) { colors = cs; if (map.isStyleLoaded() && map.getLayer("hatch")) paint(cs); else ready.then(() => paint(cs)); },
    setHatch(mask) {
      hatchIds = [];
      (mask || []).forEach((m, i) => { if (m === 0) hatchIds.push(i); });
      ready.then(() => map.getLayer("hatch") && map.setFilter("hatch", ["in", ["get", "id"], ["literal", hatchIds]]));
    },
    select(id, cell) {
      ready.then(() => {
        map.setFilter("sel", ["==", ["get", "id"], id === null ? -1 : id]);
        if (cell && !map.getBounds().contains([cell.lon, cell.lat])) map.jumpTo({ center: [cell.lon, cell.lat] });
      });
    },
    setTheme(th) {
      ready.then(() => {
        map.setPaintProperty("bg", "background-color", css("--sea"));
        map.setPaintProperty("land", "fill-color", css("--land"));
        map.setPaintProperty("vn", "fill-color", css("--land-vn"));
        map.setPaintProperty("borders", "line-color", css("--border"));
        map.setPaintProperty("grat", "line-color", css("--border"));
        map.setPaintProperty("sel", "line-color", css("--sel"));
        map.setPaintProperty("islands", "circle-color", css("--fg"));
        map.setPaintProperty("cells", "fill-color", ["coalesce", ["feature-state", "color"], palettes.NA[th]]);
      });
    },
    onCellClick(cb) { clickCb = cb; },
  };
}
