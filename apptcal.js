/* منطق تقویم نوبت‌ها: بازهٔ هفته (شنبه تا جمعه)، ماه شمسی یا بازهٔ دلخواه، فیلتر دکتر/جست‌وجو، و گروه‌بندی روزانه.
   خالص و بدون شبکه؛ تاریخ‌ها همه رشتهٔ میلادی YYYY-MM-DD‌اند (همان date نوبت). */
(function (root) {
  const J = typeof module !== "undefined" ? require("./jalali.js") : root.JAL;
  const MAX_DAYS = 93;
  const pad = n => String(n).padStart(2, "0");
  const parse = iso => { const [y, m, d] = String(iso).split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const isoOf = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return isoOf(d); };
  const dow = iso => (parse(iso).getDay() + 1) % 7;                       // شنبه=۰ … جمعه=۶
  const weekStart = iso => addDays(iso, -dow(iso));
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const jparts = iso => { const d = parse(iso); return J.gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  const fromJalali = (jy, jm, jd) => { const [gy, gm, gd] = J.jalaliToGregorian(jy, jm, jd); return gy + "-" + pad(gm) + "-" + pad(gd); };
  const days = (from, to) => { const out = []; for (let d = from, i = 0; d <= to && i < MAX_DAYS; d = addDays(d, 1), i++) out.push(d); return out; };
  const validIso = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

  /* view: week | month | range (custom: {from,to}) */
  function range(view, anchor, custom) {
    if (view === "month") {
      const [jy, jm] = jparts(anchor), from = fromJalali(jy, jm, 1), to = fromJalali(jy, jm, J.jalaliMonthLength(jy, jm));
      return { from, to, days: days(from, to) };
    }
    if (view === "range" && custom && (validIso(custom.from) || validIso(custom.to))) {
      let f = validIso(custom.from) ? custom.from : custom.to, t = validIso(custom.to) ? custom.to : custom.from;
      if (f > t) [f, t] = [t, f];
      const d = days(f, t); return { from: f, to: d[d.length - 1], days: d };
    }
    const from = weekStart(anchor), to = addDays(from, 6);
    return { from, to, days: days(from, to) };
  }
  /* قدم بعدی/قبلی؛ برای range همان طول بازه جابه‌جا می‌شود و خود بازه برمی‌گردد */
  function shift(view, anchor, dir, custom) {
    if (view === "month") { const [jy, jm] = jparts(anchor); let y = jy, m = jm + dir; if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; } return fromJalali(y, m, 1); }
    if (view === "range") { const r = range("range", anchor, custom), len = r.days.length; return dir > 0 ? { from: addDays(r.to, 1), to: addDays(r.to, len) } : { from: addDays(r.from, -len), to: addDays(r.from, -1) }; }
    return addDays(anchor, 7 * dir);
  }
  const norm = s => String(s == null ? "" : s).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[‌‏‎]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const digits = s => norm(s).replace(/\D/g, "");

  /* f: { from, to, doctor, q, cancelled (نمایش لغوشده‌ها)، patients (برای تلفن بیمارِ وصل‌شده) } → [[id, appt]] مرتب */
  function filter(appts, f) {
    f = f || {}; const q = norm(f.q), qd = digits(f.q), P = f.patients || {};
    return Object.entries(appts || {}).filter(([, a]) => a && a.date && (!f.from || a.date >= f.from) && (!f.to || a.date <= f.to)
      && (!f.doctor || a.doctor === f.doctor) && (f.cancelled || a.status !== "cancelled")
      && (!q || norm(a.name).includes(q) || (qd.length >= 3 && (digits(a.phone).includes(qd) || digits((P[a.patientId] || {}).phone).includes(qd)))))
      .sort((x, y) => (x[1].date + (x[1].time || "99:99")).localeCompare(y[1].date + (y[1].time || "99:99")));
  }
  const byDay = list => { const m = new Map(); for (const it of list) { const d = it[1].date; if (!m.has(d)) m.set(d, []); m.get(d).push(it); } return m; };
  /* شبکهٔ ماه: هفته‌هایی ۷‌تایی (شنبه تا جمعه) با null برای روزهای بیرون از ماه */
  function monthGrid(anchor) {
    const r = range("month", anchor), lead = dow(r.from), cells = [...Array(lead).fill(null), ...r.days];
    while (cells.length % 7) cells.push(null);
    const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7)); return weeks;
  }
  /* تعداد بیمار (مراجعه) در فهرست [[id, appt]]: هر نوبتِ لغونشده یک بیمار است؛ در بازه‌های بلند هم مراجعه‌ها جمع می‌شوند، نه بیمار یکتا */
  const countPatients = list => (list || []).filter(([, a]) => a && a.status !== "cancelled").length;
  const doctorColors = (ids, palette) => Object.fromEntries(ids.map((id, i) => [id, palette[i % palette.length]]));

  root.AC = { addDays, dow, weekStart, diffDays, range, shift, filter, byDay, monthGrid, countPatients, doctorColors, jparts, fromJalali, isoOf, MAX_DAYS };
  if (typeof module !== "undefined") module.exports = root.AC;
})(typeof globalThis !== "undefined" ? globalThis : this);
