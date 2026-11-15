// FHE Atlas — trang bản đồ: trạng thái, điều khiển, chú giải, khung chi tiết ô, biểu đồ, tải về.
import {
  DEFAULT_STATE, binIndex, colorFor, fmtVi, buildHash, parseHash, normalizeState, csvForLayer, riskSentence, fill, isClimatologyCell,
} from "./scales.js";
import { initMap } from "./map.js";

const GROUPS = ["risk", "hazard", "hydro", "social"];
const GCM_ORDER = ["median", "NESM3", "CMCC-ESM2", "GISS-E2-1-G"];
const RUNS = ["NESM3", "CMCC-ESM2", "GISS-E2-1-G"];
const SERIES = ["drought_compound", "dtf", "ftd"];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let VI = {};
const t = (k) => (k in VI ? VI[k] : k);
const tl = (k, vars) => fill(t(k), vars);

const S = { index: null, palettes: null, cells: null, places: [], layers: {}, meta: {}, st: { ...DEFAULT_STATE },
  handle: null, byPos: new Map(), series: "drought_compound", cellCache: new Map() };

function theme() {
  const r = document.documentElement.dataset.theme;
  if (r === "dark" || r === "light") return r;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function layer(key) {
  if (!S.layers[key]) S.layers[key] = await getJSON(`data/layers/${key}.json`);
  return S.layers[key];
}

function cellInfo(i) { return S.cells.features[i].properties; }
const posKey = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

/** Giá trị, khoảng 3 GCM và đồng thuận của một lớp ở trạng thái st. */
function view(L, st) {
  if (!L.periodic) return { values: L.data.static.value, mins: null, maxs: null, agree: null, scale: L.scale.value };
  const byVar = L.data[st.ssp];
  const e = byVar[st.variant] || byVar.main;
  const kind = st.mode === "change" && L.has_change ? "change" : "value";
  const per = (g) => e[kind][g][st.period];
  const values = per(st.gcm);
  const runs = RUNS.map(per);
  const mins = values.map((_, i) => { const v = runs.map((r) => r[i]).filter((x) => x !== null); return v.length ? Math.min(...v) : null; });
  const maxs = values.map((_, i) => { const v = runs.map((r) => r[i]).filter((x) => x !== null); return v.length ? Math.max(...v) : null; });
  const agree = kind === "change" && st.period > 0 ? e.agree[st.period - 1] : null;
  return { values, mins, maxs, agree, scale: kind === "change" ? L.scale.change : L.scale.value, kind };
}

function digits(L, kind) { return kind === "change" ? L.change_digits : L.digits; }

// ---------------------------------------------------------------- điều khiển

function segment(el, items, current, onPick, disabled = () => false) {
  el.replaceChildren(...items.map(([val, label, title]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (title) b.title = title;
    b.setAttribute("aria-pressed", String(val === current));
    b.disabled = disabled(val);
    b.addEventListener("click", () => onPick(val));
    return b;
  }));
}

function buildLayerList() {
  const box = $("layers");
  box.replaceChildren();
  for (const g of GROUPS) {
    const h = document.createElement("h3");
    h.textContent = t(`group.${g}`);
    box.append(h);
    for (const L of S.index.layers.filter((l) => l.group === g)) {
      const lab = document.createElement("label");
      const inp = document.createElement("input");
      inp.type = "radio"; inp.name = "layer"; inp.value = L.key; inp.id = `ly-${L.key}`;
      inp.addEventListener("change", () => setState({ layer: L.key }));
      const span = document.createElement("span");
      span.textContent = t(`layer.${L.key}`);
      const u = document.createElement("span");
      u.className = "u"; u.textContent = t(`layer.${L.key}.desc`);
      span.append(u);
      lab.append(inp, span);
      box.append(lab);
    }
  }
}

function renderControls() {
  const st = S.st, M = S.meta[st.layer];
  $(`ly-${st.layer}`).checked = true;
  const social = !M.periodic;
  segment($("seg-mode"), [["value", t("mode.value")], ["change", t("mode.change"), t("mode.change.long")]], st.mode,
    (v) => setState({ mode: v }), (v) => v === "change" && !M.has_change);
  segment($("seg-ssp"), S.index.ssps.map((s) => [s, t(`ssp.${s}`)]), st.ssp, (v) => setState({ ssp: v }), () => social);
  segment($("seg-period"), S.index.periods.map((_, i) => [i, t(`period.short.${i}`), t(`period.${i}`)]), st.period,
    (v) => setState({ period: v }), (v) => social || (st.mode === "change" && v === 0));
  segment($("seg-gcm"), GCM_ORDER.map((g) => [g, t(`gcm.${g}`), t(`gcm.long.${g}`)]), st.gcm, (v) => setState({ gcm: v }), () => social);
  segment($("seg-variant"), S.index.variants.map((v) => [v, t(`variant.${v}`)]), st.variant,
    (v) => setState({ variant: v }), () => !M.variant_dependent);
  $("hint").textContent = social ? t("ctl.static") : !M.variant_dependent ? t("ctl.variant.off") : "";
}

// ---------------------------------------------------------------- bản đồ, tiêu đề, chú giải

function legendRows(L, v) {
  const sc = v.scale, pal = S.palettes[sc.palette], br = sc.breaks, d = digits(L, v.kind);
  const unit = v.kind === "change" ? L.change_unit : L.unit;
  const sign = v.kind === "change";
  const f = (x) => fmtVi(x, d, { sign });
  const rows = [];
  if (L.key === "risk_class") {
    const e = L.class_edges.map((x) => fmtVi(x, 3));
    for (let c = 5; c >= 1; c--) {
      const rng = c === 1 ? `R ≤ ${e[0]}` : c === 5 ? `R > ${e[3]}` : `${e[c - 2]} < R ≤ ${e[c - 1]}`;
      rows.push([pal[c - 1], `${c} · ${t(`class.${c}`)} (${rng})`]);
    }
  } else {
    for (let i = pal.length - 1; i >= 0; i--) {
      const txt = i === 0 ? `≤ ${f(br[0])}` : i === pal.length - 1 ? `> ${f(br[br.length - 1])}` : `${f(br[i - 1])} … ${f(br[i])}`;
      rows.push([pal[i], txt]);
    }
  }
  return { rows, unit };
}

function renderMap() {
  const st = S.st, L = S.layers[st.layer], v = view(L, st);
  const th = theme();
  S.handle.setColors(v.values.map((x) => colorFor(x, v.scale, S.palettes, th)));
  S.handle.setHatch(v.agree);
  S.handle.select(st.cell, st.cell === null ? null : cellInfo(st.cell));
  // tiêu đề
  const name = t(`layer.${st.layer}`) + (v.kind === "change" ? ` (${t("mode.change.long")})` : "");
  const ctx = !L.periodic ? t("ctl.static")
    : [t(`ssp.${st.ssp}`), t(`period.${st.period}`), t(`gcm.long.${st.gcm}`),
      ...(L.variant_dependent ? [t(`variant.long.${st.variant}`)] : [])].join(" · ");
  $("mtitle").innerHTML = `<b>${esc(name)}</b> <span>· ${esc(ctx)}</span>`;
  // chú giải
  const { rows, unit } = legendRows(L, v);
  const head = `${esc(t(`layer.${st.layer}`))}${unit ? ` (${esc(unit)})` : ""}`;
  const html = rows.map(([c, txt]) => `<div class="row"><span class="sw" style="background:${c}"></span>${esc(txt)}</div>`);
  html.push(`<div class="row"><span class="sw" style="background:${S.palettes.NA[th]}"></span>${esc(t("legend.na"))}</div>`);
  if (v.agree) html.push(`<div class="row"><span class="sw hatch"></span>${esc(t("legend.disagree"))}</div>`);
  $("legend").innerHTML = `<h3>${head}</h3>${html.join("")}`;
}

// ---------------------------------------------------------------- khung chi tiết

function nearestPlace(c) {
  let best = null, bd = 0.6 ** 2;
  for (const p of S.places) {
    const d = (p.lat - c.lat) ** 2 + (p.lon - c.lon) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function chartR(rl, st, i) {
  const e = rl.data[st.ssp][st.variant] || rl.data[st.ssp].main;
  const R = [0, 1, 2].map((p) => {
    const runs = RUNS.map((g) => e.value[g][p][i]).filter((x) => x !== null);
    return [runs.length ? Math.min(...runs) : null, e.value[st.gcm][p][i], runs.length ? Math.max(...runs) : null];
  });
  const W = 290, H = 130, x0 = 30, y0 = 10, ph = 92, bw = 36;
  const ymax = Math.max(1, ...R.map((r) => r[2] ?? 0)) * 1.1;
  const y = (v) => y0 + ph - (v / ymax) * ph;
  let g = "";
  [0, 0.5, 1, 1.5, 2].filter((v) => v <= ymax).forEach((v) => {
    g += `<line class="ax" x1="${x0}" y1="${y(v)}" x2="${W - 4}" y2="${y(v)}"/><text x="${x0 - 4}" y="${y(v) + 3}" text-anchor="end">${fmtVi(v, 1)}</text>`;
  });
  R.forEach((r, p) => {
    const cx = x0 + 40 + p * 84;
    if (r[1] !== null) g += `<rect class="bar" x="${cx - bw / 2}" y="${y(r[1])}" width="${bw}" height="${y0 + ph - y(r[1])}" opacity="${p === st.period ? 1 : 0.45}"/>`;
    if (r[0] !== null) g += `<line class="wh" x1="${cx}" y1="${y(r[0])}" x2="${cx}" y2="${y(r[2])}"/><line class="wh" x1="${cx - 6}" y1="${y(r[0])}" x2="${cx + 6}" y2="${y(r[0])}"/><line class="wh" x1="${cx - 6}" y1="${y(r[2])}" x2="${cx + 6}" y2="${y(r[2])}"/>`;
    g += `<text x="${cx}" y="${y0 + ph + 14}" text-anchor="middle">${esc(t(`period.short.${p}`))}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("detail.chart.r"))}">${g}</svg>`;
}

function smooth(a, k = 5) {
  const h = Math.floor(k / 2);
  return a.map((_, i) => {
    const w = a.slice(Math.max(0, i - h), i + h + 1).filter((x) => x !== null);
    return w.length >= 3 ? w.reduce((s, x) => s + x, 0) / w.length : null;
  });
}

function chartEvents(cd, st, ev) {
  const W = 290, H = 150, x0 = 26, x1 = W - 6, y0 = 8, ph = 112, X0 = 2002, X1 = 2100;
  const series = RUNS.map((g) => smooth(cd.gcm[st.ssp][g][ev]));
  const obs = smooth(cd.obs[ev]);
  const all = [...series.flat(), ...obs].filter((x) => x !== null);
  const ymax = Math.max(2, Math.ceil(Math.max(...all, 0) + 0.5));
  const x = (yr) => x0 + ((yr - X0) / (X1 - X0)) * (x1 - x0);
  const y = (v) => y0 + ph - (v / ymax) * ph;
  const path = (years, vals) => {
    let d = "", pen = false;
    vals.forEach((v, k) => { if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(years[k]).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  let g = "";
  [[2026, 2050], [2051, 2075], [2076, 2100]].forEach(([a, b], p) => {
    if (p === st.period) g += `<rect class="pband" x="${x(a)}" y="${y0}" width="${x(b) - x(a)}" height="${ph}"/>`;
  });
  for (let v = 0; v <= ymax; v += Math.max(1, Math.round(ymax / 4))) g += `<line class="ax" x1="${x0}" y1="${y(v)}" x2="${x1}" y2="${y(v)}"/><text x="${x0 - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  [2025, 2050, 2075, 2100].forEach((yr) => { g += `<text x="${x(yr)}" y="${y0 + ph + 13}" text-anchor="middle">${yr}</text>`; });
  series.forEach((s, k) => { g += `<path class="run r${k}${RUNS[k] === st.gcm ? " on" : ""}" d="${path(cd.gcm.years, s)}"/>`; });
  if (st.gcm === "median") {
    const med = cd.gcm.years.map((_, i) => { const v = series.map((s) => s[i]).filter((z) => z !== null).sort((a, b) => a - b); return v.length === 3 ? v[1] : null; });
    g += `<path class="run rm on" d="${path(cd.gcm.years, med)}"/>`;
  }
  g += `<path class="obs" d="${path(cd.obs.years, obs)}"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("detail.chart.events"))}">${g}</svg>`;
}

async function cellData(i) {
  if (!S.cellCache.has(i)) S.cellCache.set(i, await getJSON(`data/cell/${i}.json`));
  return S.cellCache.get(i);
}

function cellCsv(L, i) {
  const rows = ["layer,ssp,variant,gcm,period,value,change"];
  if (!L.periodic) { rows.push(`${L.key},,,,,${L.data.static.value[i] ?? ""},`); return rows.join("\n"); }
  for (const s of Object.keys(L.data)) for (const v of Object.keys(L.data[s])) for (const g of GCM_ORDER) for (let p = 0; p < 3; p++) {
    const e = L.data[s][v];
    const val = e.value[g][p][i], ch = e.change ? e.change[g][p][i] : null;
    rows.push([L.key, s, v, g, S.index.periods[p], val ?? "", ch ?? ""].join(","));
  }
  return rows.join("\n");
}

async function renderDetail() {
  const st = S.st, det = $("det");
  if (st.cell === null) { det.innerHTML = `<p class="status">${esc(t("detail.empty"))}</p>`; return; }
  const i = st.cell, c = cellInfo(i), L = S.layers[st.layer], v = view(L, st);
  const [rc, rr, cd] = await Promise.all([layer("risk_class"), layer("risk_r"), cellData(i)]);
  if (S.st.cell !== i) return;
  const ce = rc.data[st.ssp][st.variant] || rc.data[st.ssp].main;
  const cls = ce.value[st.gcm][st.period][i], cls0 = ce.value[st.gcm][0][i];
  const re = rr.data[st.ssp][st.variant] || rr.data[st.ssp].main;
  const agree = st.period > 0 ? re.agree[st.period - 1][i] : null;
  const near = nearestPlace(c);
  const d = digits(L, v.kind), unit = v.kind === "change" ? L.change_unit : L.unit;
  const val = v.values[i];
  const rng = v.mins ? ` (${t("detail.range")}: ${fmtVi(v.mins[i], d, { sign: v.kind === "change" })} … ${fmtVi(v.maxs[i], d, { sign: v.kind === "change" })})` : "";
  const pal = S.palettes.YlOrRd5, txt = ["#000", "#000", "#000", "#fff", "#fff"];
  const chip = cls ? `<span class="chip" style="background:${pal[cls - 1]};color:${txt[cls - 1]}">${esc(`Cấp ${cls} · ${t(`class.${cls}`)}`)}</span>` : "";
  const sentence = cls && cls0 ? riskSentence(VI, { ssp: t(`ssp.${st.ssp}`), period: t(`period.${st.period}`), c0: cls0, c: cls, agree }) : "";
  const isClim = isClimatologyCell(S.layers.drought_compound?.data?.[st.ssp]?.main?.value?.median?.[0], i);
  const soc = cd.social;
  const socRows = [
    ["social.svi", fmtVi(soc.svi, 2)], ["social.lcc", fmtVi(soc.lcc, 2)],
    ["social.travel", soc.travel === null ? "—" : `${fmtVi(soc.travel, 0)} ${t("unit.minutes")}`],
    ["social.deprivation", fmtVi(soc.deprivation, 2)], ["social.density", soc.density === null ? "—" : `${fmtVi(soc.density, 0)} ${t("unit.ppl_km2")}`],
    ["social.u5", soc.u5 === null ? "—" : `${fmtVi(soc.u5 * 100, 1)} %`], ["social.o65", soc.o65 === null ? "—" : `${fmtVi(soc.o65 * 100, 1)} %`],
  ];
  det.innerHTML = `
    <div><div class="loc">${esc(tl("detail.cell", { lat: fmtVi(c.lat, 3), lon: fmtVi(c.lon, 3) }))}</div>
      ${near ? `<div class="near">${esc(tl("detail.near", { name: near.name }))}</div>` : ""}</div>
    <div>${chip}</div>
    ${sentence ? `<p class="plain">${esc(sentence)}</p>` : ""}
    <div><h3>${esc(t("detail.layer"))}</h3><p class="plain">${esc(t(`layer.${st.layer}`))}: <b>${esc(fmtVi(val, d, { sign: v.kind === "change" }))}${unit ? " " + esc(unit) : ""}</b>${esc(rng)}</p></div>
    <div><h3>${esc(t("detail.chart.r"))}</h3>${chartR(rr, st, i)}<p class="note">${esc(t("detail.chart.r.note"))}</p></div>
    <div><h3>${esc(t("detail.chart.events"))}</h3>
      <div class="seg" id="seg-series"></div>
      ${chartEvents(cd, st, S.series)}
      <p class="note">${esc(tl("detail.chart.events.note", { ssp: t(`ssp.${st.ssp}`) }))}</p></div>
    ${isClim ? `<p class="note">${esc(t("detail.climatology"))}</p>` : ""}
    <div><h3>${esc(t("detail.social"))}</h3><table>${socRows.map(([k, x]) => `<tr><td class="k">${esc(t(k))}</td><td>${esc(x)}</td></tr>`).join("")}</table></div>
    <button class="btn" type="button" id="dl-cell">${esc(t("dl.cell"))}</button>`;
  segment($("seg-series"), SERIES.map((k) => [k, t(`layer.${k}`)]), S.series, (k) => { S.series = k; renderDetail(); });
  $("dl-cell").addEventListener("click", () => download(`fhe-atlas-o-${i}-${L.key}.csv`, cellCsv(L, i), "text/csv"));
}

// ---------------------------------------------------------------- tải về, tìm kiếm, bàn phím

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function layerRows() {
  const L = S.layers[S.st.layer], v = view(L, S.st);
  return S.cells.features.map((f, i) => ({ id: i, lat: f.properties.lat, lon: f.properties.lon, value: v.values[i],
    min: v.mins ? v.mins[i] : null, max: v.maxs ? v.maxs[i] : null, agree: v.agree ? v.agree[i] : null }));
}

function fileStem() {
  const st = S.st;
  return ["fhe-atlas", st.layer, st.mode, st.ssp, S.index.periods[st.period], st.gcm, st.variant].join("_");
}

function norm(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim(); }

function parseCoords(q) {
  const parts = q.includes(";") ? q.split(";") : q.includes(", ") ? q.split(", ") : q.split(",");
  if (parts.length !== 2) return null;
  const [a, b] = parts.map((p) => Number(p.trim().replace(",", ".")));
  return Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lon: b } : null;
}

function nearestCell(lat, lon, maxDeg = 0.5) {
  let best = null, bd = maxDeg ** 2;
  S.cells.features.forEach((f, i) => {
    const d = (f.properties.lat - lat) ** 2 + (f.properties.lon - lon) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function onSearch(ev) {
  ev.preventDefault();
  const q = $("q").value;
  const c = parseCoords(q);
  let target = c ? { lat: c.lat, lon: c.lon } : null;
  if (!target) {
    const n = norm(q);
    const p = n && (S.places.find((x) => norm(x.name) === n) || S.places.find((x) => norm(x.name).includes(n)));
    if (p) target = { lat: p.lat, lon: p.lon };
  }
  const i = target ? nearestCell(target.lat, target.lon) : null;
  $("search-msg").textContent = i === null ? t("ctl.search.none") : "";
  if (i !== null) setState({ cell: i });
}

function onKey(ev) {
  const moves = { ArrowUp: [0.25, 0], ArrowDown: [-0.25, 0], ArrowLeft: [0, -0.25], ArrowRight: [0, 0.25] };
  if (!moves[ev.key]) return;
  ev.preventDefault();
  const cur = S.st.cell === null ? cellInfo(0) : cellInfo(S.st.cell);
  if (S.st.cell === null) { setState({ cell: 0 }); return; }
  const [dl, dn] = moves[ev.key];
  const j = S.byPos.get(posKey(cur.lat + dl, cur.lon + dn));
  if (j !== undefined) setState({ cell: j });
}

// ---------------------------------------------------------------- trạng thái

async function setState(patch, { fromHash = false } = {}) {
  let st = { ...S.st, ...patch };
  st = normalizeState(st, S.meta[st.layer]);
  S.st = st;
  await layer(st.layer);
  if (S.st !== st) return;
  if (!fromHash) history.replaceState(null, "", buildHash(st));
  renderControls();
  renderMap();
  renderDetail();
}

async function main() {
  try {
    const [vi, index, palettes, basemap, cells, places] = await Promise.all([
      getJSON("assets/i18n/vi.json"), getJSON("data/index.json"), getJSON("assets/palettes.json"),
      getJSON("data/basemap.geojson"), getJSON("data/cells.geojson"), getJSON("data/places.json")]);
    VI = vi;
    Object.assign(S, { index, palettes, cells, places });
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $("q").placeholder = t("ctl.search");
    $("map").setAttribute("aria-label", t("map.aria"));
    S.meta = Object.fromEntries(S.index.layers.map((l) => [l.key, l]));
    S.cells.features.forEach((f, i) => S.byPos.set(posKey(f.properties.lat, f.properties.lon), i));
    $("places").replaceChildren(...S.places.map((p) => { const o = document.createElement("option"); o.value = p.name; return o; }));
    buildLayerList();
    S.handle = initMap($("map"), { basemap, cells, places, palettes, theme: theme(), t });
    S.handle.onCellClick((id) => setState({ cell: id }));
    $("search").addEventListener("submit", onSearch);
    $("map").addEventListener("keydown", onKey);
    $("dl-csv").addEventListener("click", () => download(`${fileStem()}.csv`, csvForLayer(layerRows()), "text/csv"));
    $("dl-geojson").addEventListener("click", () => {
      const rows = layerRows();
      const fc = { ...S.cells, features: S.cells.features.map((f, i) => ({ ...f, properties: { ...f.properties, ...rows[i] } })) };
      download(`${fileStem()}.geojson`, JSON.stringify(fc), "application/geo+json");
    });
    window.addEventListener("hashchange", () => setState(parseHash(location.hash, S.index), { fromHash: true }));
    window.addEventListener("atlas:themechange", () => { S.handle.setTheme(theme()); if (S.layers[S.st.layer]) renderMap(); });
    await Promise.all([layer("risk_class"), layer("risk_r"), layer("drought_compound")]);
    await setState(parseHash(location.hash, S.index), { fromHash: !location.hash });
  } catch (err) {
    $("det").innerHTML = `<p class="status">${esc(VI["error.load"] || "Không tải được số liệu.")}</p>`;
    console.error(err);
  }
}

main();
