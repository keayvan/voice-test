/* ساعت حضور سالانه: الگوی هفتگی هر نفر (حداکثر دو بازه در روز، گام ۱۵ دقیقه)، قفل تا آخر سال شمسی، تاریخچهٔ تغییرها،
   مرخصی و تقویم محاسبه‌شده. تقویم ذخیره نمی‌شود؛ از الگو + تاریخچه + مرخصی‌های تأییدشده ساخته می‌شود.
   خالص و بدون شبکه؛ تاریخ‌ها رشتهٔ میلادی YYYY-MM-DD، ساعت‌ها "HH:MM". */
(function (root) {
  const J = typeof module !== "undefined" ? require("./jalali.js") : root.JAL;
  const AC = typeof module !== "undefined" ? require("./apptcal.js") : root.AC;
  const DAYS = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];       // همان AC.dow: شنبه=۰
  const STEP = 15, MAX_RANGES = 2;
  const pad = n => String(n).padStart(2, "0");
  const toMin = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s == null ? "" : s)); if (!m || +m[2] > 59) return NaN; const v = +m[1] * 60 + +m[2]; return v > 1440 ? NaN : v; };
  const fromMin = v => pad(Math.floor(v / 60)) + ":" + pad(v % 60);
  const emptyWeekly = () => Object.fromEntries(DAYS.map(d => [d, []]));

  function validateWeekly(w) {
    const errors = [];
    for (const d of DAYS) {
      const rs = (w && w[d]) || [], list = [];
      if (rs.length > MAX_RANGES) errors.push({ day: d, msg: "بیش از دو بازه" });
      for (const x of rs) {
        const s = toMin(x && x.s), e = toMin(x && x.e);
        if (Number.isNaN(s) || Number.isNaN(e)) { errors.push({ day: d, msg: "ساعت نامعتبر" }); continue; }
        if (s % STEP || e % STEP) errors.push({ day: d, msg: "ساعت باید مضرب ۱۵ دقیقه باشد" });
        if (e <= s) errors.push({ day: d, msg: "پایان باید بعد از شروع باشد" });
        list.push([s, e]);
      }
      list.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < list.length; i++) if (list[i][0] < list[i - 1][1]) errors.push({ day: d, msg: "بازه‌ها هم‌پوشانی دارند" });
    }
    return { ok: !errors.length, errors };
  }
  function normalizeWeekly(w) {
    const out = emptyWeekly();
    for (const d of DAYS) out[d] = ((w && w[d]) || []).filter(x => x && x.s && x.e).map(x => ({ s: x.s, e: x.e })).sort((a, b) => toMin(a.s) - toMin(b.s));
    return out;
  }
  const dayMinutes = rs => rs.reduce((s, x) => s + Math.max(0, toMin(x.e) - toMin(x.s)), 0);
  const weeklyMinutes = w => DAYS.reduce((s, d) => s + dayMinutes((w && w[d]) || []), 0);

  const yearStart = jy => { const [y, m, d] = J.jalaliToGregorian(jy, 1, 1); return y + "-" + pad(m) + "-" + pad(d); };
  const yearEnd = jy => AC.addDays(yearStart(jy + 1), -1);
  const yearOf = iso => AC.jparts(iso)[0];

  /* قفل: الگو از تاریخ lockDate (یا opts.from) تا آخر همان سال شمسی برقرار است */
  function lock(staffId, weekly, lockDate, opts) {
    const v = validateWeekly(weekly); if (!v.ok) throw new Error("الگوی ساعت معتبر نیست: " + v.errors[0].msg);
    const jy = yearOf(lockDate), from = (opts && opts.from) || lockDate;
    return { id: staffId, staffId, year: jy, status: "locked", lockedAt: (opts && opts.at) || Date.now(), until: yearEnd(jy), history: [{ from, weekly: normalizeWeekly(weekly) }] };
  }
  /* تغییر دائمی از effectiveFrom؛ ورودی دست نمی‌خورد. ورودی‌های بعدتر از همان تاریخ حذف می‌شوند (تغییر تازه جای آن‌ها را می‌گیرد). */
  function applyChange(rec, req) {
    if (!rec || rec.status !== "locked") throw new Error("ساعت هنوز قفل نشده");
    const v = validateWeekly(req.weekly); if (!v.ok) throw new Error("الگوی ساعت معتبر نیست");
    const first = rec.history[0].from; if (req.effectiveFrom < first) throw new Error("تاریخ شروع پیش از قفل است");
    if (req.effectiveFrom > rec.until) throw new Error("تاریخ شروع بعد از پایان سال است");
    const history = rec.history.filter(h => h.from < req.effectiveFrom).concat([{ from: req.effectiveFrom, weekly: normalizeWeekly(req.weekly) }]);
    return { ...rec, history, updatedAt: (req && req.at) || Date.now() };
  }
  function patternOn(rec, iso) {
    if (!rec || rec.status !== "locked" || !Array.isArray(rec.history) || iso > rec.until) return null;
    let cur = null; for (const h of rec.history) if (h.from <= iso) cur = h; return cur ? cur.weekly : null;
  }

  const cut = (ranges, s, e) => {                                         // بازهٔ [s,e) دقیقه را از ranges کم می‌کند
    const out = [];
    for (const x of ranges) { const a = toMin(x.s), b = toMin(x.e); if (e <= a || s >= b) { out.push(x); continue; } if (a < s) out.push({ s: x.s, e: fromMin(s) }); if (e < b) out.push({ s: fromMin(e), e: x.e }); }
    return out;
  };
  const covers = (l, iso) => l.from <= iso && (l.to || l.from) >= iso;
  /* ranges: ساعت‌های واقعی آن روز؛ pattern: ساعت‌های الگو؛ leave: مرخصی تأییدشده؛ pending: مرخصی در انتظار تأیید */
  function rangesOn(rec, leaves, iso) {
    const w = patternOn(rec, iso), normal = w ? (w[DAYS[AC.dow(iso)]] || []).map(x => ({ s: x.s, e: x.e })) : [];
    /* استثنای همان تاریخ (rec.over[iso]، فقط با تصمیم مدیر): [] = آن روز نیست، وگرنه ساعت‌های همان روز به‌جای الگو */
    const ov = rec && rec.status === "locked" && rec.over && Array.isArray(rec.over[iso]) ? rec.over[iso].map(x => ({ s: x.s, e: x.e })) : null;
    const pattern = ov || normal;
    const mine = (leaves || []).filter(l => (!rec || !rec.staffId || l.staffId === rec.staffId) && covers(l, iso));
    let ranges = pattern, leave = null;
    for (const l of mine.filter(x => x.status === "approved")) {
      leave = leave || { kind: l.kind || "leave", partial: !!(l.startTime && l.endTime), id: l.id };
      ranges = (l.startTime && l.endTime) ? cut(ranges, toMin(l.startTime), toMin(l.endTime)) : [];
    }
    return { ranges, pattern, normal, override: !!ov, leave, pending: mine.some(x => x.status === "pending") };
  }
  const minutesOn = (rec, leaves, iso) => dayMinutes(rangesOn(rec, leaves, iso).ranges);
  const isPresentAt = (rec, leaves, iso, hhmm) => { const m = toMin(hhmm); return rangesOn(rec, leaves, iso).ranges.some(x => m >= toMin(x.s) && m < toMin(x.e)); };

  /* آیا کل بازهٔ [s,e) دقیقه داخل یکی از ساعت‌های حضور آن روز است؟ */
  const coversSpan = (rec, leaves, iso, s, e) => rangesOn(rec, leaves, iso).ranges.some(x => s >= toMin(x.s) && e <= toMin(x.e));

  /* هر روز بازه: { date, ranges, pattern, minutes, leave, pending, when: past|today|future } */
  function days(rec, leaves, fromIso, toIso, todayIso) {
    const list = []; for (let d = fromIso; d <= toIso; d = AC.addDays(d, 1)) list.push(d);
    return list.map(date => {
      const r = rangesOn(rec, leaves, date);
      return { date, ranges: r.ranges, pattern: r.pattern, minutes: dayMinutes(r.ranges), leave: r.leave, pending: r.pending, when: date < todayIso ? "past" : date === todayIso ? "today" : "future" };
    });
  }
  const monthMinutes = (rec, leaves, jy, jm) => {
    const from = AC.fromJalali(jy, jm, 1), to = AC.fromJalali(jy, jm, J.jalaliMonthLength(jy, jm));
    return days(rec, leaves, from, to, "9999-12-31").reduce((s, d) => s + d.minutes, 0);
  };
  /* ماه‌های گزارش: اگر بیش از ۶ ماه از اول سال گذشته، از اول سال؛ وگرنه ۶ ماه اخیر (می‌تواند به سال قبل برود) */
  function monthsForReport(todayIso) {
    const [jy, jm] = AC.jparts(todayIso);
    if (jm > 6) return Array.from({ length: jm }, (_, i) => ({ jy, jm: i + 1 }));
    const out = []; let y = jy, m = jm;
    for (let i = 0; i < 6; i++) { out.unshift({ jy: y, jm: m }); m--; if (m < 1) { m = 12; y--; } }
    return out;
  }
  function weeksOfMonth(jy, jm) {
    const first = AC.fromJalali(jy, jm, 1), last = AC.fromJalali(jy, jm, J.jalaliMonthLength(jy, jm)), out = [];
    for (let w = AC.weekStart(first); w <= last; w = AC.addDays(w, 7)) out.push({ from: w, to: AC.addDays(w, 6) });
    return out;
  }
  /* ستون‌های گزارش کارکنان: روزانه (۷ روز هفتهٔ anchor)، هفتگی (هفته‌های ماه شمسیِ anchor، بریده‌شده به ماه)، ماهانه (۶ ماه اخیر یا ۱۲ ماه سال شمسیِ anchor) */
  function reportColumns(view, anchor, todayIso, mrange) {
    if (view === "day") { const f = AC.weekStart(anchor); return Array.from({ length: 7 }, (_, i) => { const d = AC.addDays(f, i); return { from: d, to: d, i }; }); }
    if (view === "week") {
      const [jy, jm] = AC.jparts(anchor), mFrom = AC.fromJalali(jy, jm, 1), mTo = AC.fromJalali(jy, jm, J.jalaliMonthLength(jy, jm));
      return weeksOfMonth(jy, jm).map((w, i) => ({ from: w.from < mFrom ? mFrom : w.from, to: w.to > mTo ? mTo : w.to, i }));
    }
    const ms = mrange === "year" ? Array.from({ length: 12 }, (_, i) => ({ jy: AC.jparts(anchor)[0], jm: i + 1 })) : monthsForReport(todayIso);
    return ms.map(m => ({ from: AC.fromJalali(m.jy, m.jm, 1), to: AC.fromJalali(m.jy, m.jm, J.jalaliMonthLength(m.jy, m.jm)), jy: m.jy, jm: m.jm }));
  }

  /* مرخصی‌های تأییدشده در بازهٔ [from,to]: فقط روزهایی که الگوی حضور داشته‌اند حساب می‌شوند؛ مرخصی ساعتی جدا (دقیقه).
     «استفاده‌شده» = تا امروز (خود امروز هم)، «آینده» = بعد از امروز. */
  function leaveUsage(rec, leaves, staffId, from, to, todayIso) {
    const mine = (leaves || []).filter(l => l.staffId === staffId && l.kind !== "meeting");   /* جلسه مرخصی نیست؛ فقط ساعت را می‌بندد */
    const out = { usedDays: 0, upcomingDays: 0, usedMinutes: 0, upcomingMinutes: 0, byKind: {}, requests: { approved: 0, pending: 0, rejected: 0 } };
    for (const l of mine) out.requests[l.status] = (out.requests[l.status] || 0) + 1;
    for (const l of mine.filter(x => x.status === "approved")) {
      const a = l.from > from ? l.from : from, b = (l.to || l.from) < to ? (l.to || l.from) : to;
      if (a > b) continue;
      for (let d = a; d <= b; d = AC.addDays(d, 1)) {
        const w = patternOn(rec, d), pat = w ? (w[DAYS[AC.dow(d)]] || []) : [];
        if (!pat.length) continue;
        const past = d <= todayIso;
        if (l.startTime && l.endTime) { const m = Math.max(0, toMin(l.endTime) - toMin(l.startTime)); if (past) out.usedMinutes += m; else out.upcomingMinutes += m; }
        else { if (past) out.usedDays++; else out.upcomingDays++; out.byKind[l.kind || "leave"] = (out.byKind[l.kind || "leave"] || 0) + 1; }
      }
    }
    return out;
  }
  function dayKind(d) {
    if (d.minutes > 0) return d.when === "past" ? "past" : d.when === "today" ? "today" : "future";
    if (d.leave) return "leave";
    return d.when === "today" ? "todayoff" : "off";
  }

  root.HR = { DAYS, STEP, MAX_RANGES, toMin, fromMin, emptyWeekly, validateWeekly, normalizeWeekly, dayMinutes, weeklyMinutes, yearStart, yearEnd, yearOf, lock, applyChange, patternOn, rangesOn, minutesOn, isPresentAt, coversSpan, days, monthMinutes, monthsForReport, reportColumns, weeksOfMonth, leaveUsage, dayKind };
  if (typeof module !== "undefined") module.exports = root.HR;
})(typeof globalThis !== "undefined" ? globalThis : this);
