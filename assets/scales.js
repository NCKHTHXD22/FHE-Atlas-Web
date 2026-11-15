// Hàm thuần dùng chung cho FHE Atlas: phân lớp, màu, định dạng số tiếng Việt, đường dẫn chia sẻ, chuẩn hóa trạng thái,
// CSV, câu mô tả. Không chạm DOM để kiểm thử được bằng node --test.

export const DEFAULT_STATE = Object.freeze({
  layer: "risk_class", ssp: "ssp585", period: 2, gcm: "median", variant: "main", mode: "value", cell: null,
});

export const GCM_CODES = Object.freeze({ nesm3: "NESM3", cmcc: "CMCC-ESM2", giss: "GISS-E2-1-G", median: "median" });
const GCM_TO_CODE = Object.fromEntries(Object.entries(GCM_CODES).map(([k, v]) => [v, k]));
export const N_CELLS = 452;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Lớp i sao cho breaks[i-1] < v ≤ breaks[i] (đóng bên phải, như numpy digitize(right=True)). */
export function binIndex(v, breaks) {
  if (!isNum(v)) return null;
  let i = 0;
  while (i < breaks.length && v > breaks[i]) i++;
  return i;
}

export function colorFor(v, scale, palettes, theme = "light") {
  const i = binIndex(v, scale.breaks);
  if (i === null) return palettes.NA[theme] || palettes.NA.light;
  return palettes[scale.palette][i];
}

/** Số kiểu Việt Nam: dấu phẩy thập phân, dấu trừ "−", không bao giờ "−0,00"; null → "—". */
export function fmtVi(x, digits = 2, { sign = false } = {}) {
  if (!isNum(x)) return "—";
  let s = Math.abs(x).toFixed(digits);
  const zero = Number(s) === 0;
  s = s.replace(".", ",");
  if (x < 0 && !zero) return "−" + s;
  if (sign && x > 0 && !zero) return "+" + s;
  return s;
}

export function buildHash(st) {
  const cell = st.cell === null || st.cell === undefined ? "x" : String(st.cell);
  return "#" + [st.layer, st.ssp, st.period, GCM_TO_CODE[st.gcm] || "median", st.variant, st.mode, cell].join("-");
}

/** Đọc hash; trường nào sai thì lấy giá trị mặc định của trường đó. */
export function parseHash(hash, index, nCells = N_CELLS) {
  const s = { ...DEFAULT_STATE };
  const parts = String(hash || "").replace(/^#/, "").split("-");
  if (parts.length !== 7) return s;
  const [layer, ssp, period, gcm, variant, mode, cell] = parts;
  if (index.layers.some((l) => l.key === layer)) s.layer = layer; // so khớp chính xác, không qua khóa kế thừa
  if (index.ssps.includes(ssp)) s.ssp = ssp;
  const p = Number(period);
  if (Number.isInteger(p) && p >= 0 && p < index.periods.length) s.period = p;
  if (Object.hasOwn(GCM_CODES, gcm)) s.gcm = GCM_CODES[gcm];
  if ((index.variants || ["main", "tfixed"]).includes(variant)) s.variant = variant;
  if (mode === "value" || mode === "change") s.mode = mode;
  const c = Number(cell);
  if (/^\d+$/.test(cell) && c < nCells) s.cell = c;
  return s;
}

/** Đưa trạng thái về tổ hợp hợp lệ gần nhất với lớp đang chọn. */
export function normalizeState(st, meta) {
  const s = { ...st };
  if (!meta.has_change) s.mode = "value";
  if (s.mode === "change" && s.period === 0) s.period = 2;
  if (!meta.variant_dependent) s.variant = "main";
  return s;
}

const csvNum = (v) => (isNum(v) ? String(v) : "");

export function csvForLayer(rows) {
  const head = "id,lat,lon,value,min,max,agree";
  const body = rows.map((r) => [r.id, r.lat, r.lon, r.value, r.min, r.max, r.agree].map(csvNum).join(","));
  return [head, ...body].join("\n");
}

export function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function riskSentence(t, { ssp, period, c0, c, agree }) {
  const key = c > c0 ? "sentence.up" : c < c0 ? "sentence.down" : "sentence.same";
  let s = fill(t[key], { ssp, period, c0, c });
  if (agree === 1) s += " " + t["sentence.agree"];
  else if (agree === 0) s += " " + t["sentence.disagree"];
  return s;
}

/** Ô TWSA khí hậu tháng: hạn kép không xác định (null) ở giai đoạn đầu. 0 là giá trị thật, không phải ô khí hậu. */
export function isClimatologyCell(compoundPeriod0, i) {
  return Array.isArray(compoundPeriod0) && compoundPeriod0[i] === null;
}
