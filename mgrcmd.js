/* دستور متنی مدیر: جمله‌های فارسی ← فهرست کار (حذف/افزودن کارمند، مرخصی، ساعت حضور هفتگی، جابه‌جایی/لغو نوبت).
   قاعده‌محور، بدون شبکه و بدون مدل. چیزی را حدس نمی‌زند: مبهم یا نفهمیده ← misses. اجرا با خود اپ است (بعد از تأیید مدیر). */
(function (root) {
  if (typeof module !== "undefined") require("./nlu.js");
  const NLU = globalThis.NLU;
  const AC = typeof module !== "undefined" ? require("./apptcal.js") : root.AC;
  const HR = typeof module !== "undefined" ? require("./hours.js") : root.HR;
  const norm = NLU.norm, pad = n => String(n).padStart(2, "0");
  const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  const DAYFA = { sat: "شنبه", sun: "یکشنبه", mon: "دوشنبه", tue: "سه‌شنبه", wed: "چهارشنبه", thu: "پنج‌شنبه", fri: "جمعه" };
  const WD = [["پنج شنبه", "thu"], ["پنجشنبه", "thu"], ["چهار شنبه", "wed"], ["چهارشنبه", "wed"], ["چارشنبه", "wed"], ["سه شنبه", "tue"], ["سشنبه", "tue"], ["دو شنبه", "mon"], ["دوشنبه", "mon"], ["یک شنبه", "sun"], ["یکشنبه", "sun"], ["یه شنبه", "sun"], ["جمعه", "fri"], ["شنبه", "sat"]].map(([w, d]) => [norm(w), d]);
  const ROLES = [[/(?:^| )(?:دکتر|دندانپزشک)(?: |$)/, "doctor"], [/(?:^| )دستیار(?: |$)/, "assistant"], [/(?:^| )(?:منشی|پذیرش)(?: |$)/, "reception"], [/(?:^| )مسئول بیمه(?: |$)|(?:^| )بیمه(?: |$)/, "insurance"], [/(?:^| )(?:لابراتوار|لاب)(?: |$)/, "lab"], [/(?:^| )(?:انباردار|انبار دار)(?: |$)/, "store"], [/(?:^| )حسابدار(?: |$)/, "accountant"]];
  const ROLE_FA = { doctor: "دکتر", assistant: "دستیار", reception: "منشی", insurance: "مسئول بیمه", lab: "لابراتوار", store: "انباردار", accountant: "حسابدار" };
  /* نقشِ وابسته به ماژول: ماژولش خاموش باشد کارمند با آن نقش ساخته نمی‌شود. ctx.roleOn(role) یا root.MC_ROLE_ON(role)؛ بدون هیچ‌کدام همه روشن */
  const ROLE_MOD = { insurance: "بیمه", lab: "لابراتوار", store: "انبار" };
  const roleOn = (ctx, r) => ctx && typeof ctx.roleOn === "function" ? ctx.roleOn(r) !== false
    : typeof root.MC_ROLE_ON === "function" ? root.MC_ROLE_ON(r) !== false : true;
  const has = (s, words) => words.some(w => new RegExp("(?:^| )" + norm(w) + "(?: |$)").test(s));
  const REMOVE = ["اخراج", "استعفا", "استعفاء", "حذف", "کنار رفت", "کنار رفته", "دیگه نمیاد", "دیگر نمیاد", "دیگر نمی آید", "تسویه"];
  const ADD = ["اضافه", "استخدام", "جدید", "وارد کن", "ثبت کن"];
  const LEAVE = ["مرخصی", "مرخصیه", "نیست", "نمیاد", "نمی آید", "نمیاید", "غیبت", "استعلاجی", "نمیتونه بیاد", "نمی تواند بیاید", "نمیرسه", "نمی رسد"];
  const SICK = ["بیمار است", "بیماره", "مریض", "استعلاجی", "بیمار"];
  const HOURS = ["ساعت کار", "ساعت حضور", "ساعت کاری", "ساعات کار", "ساعتش", "کار کند", "کار کنه", "بیاد", "بیاید", "حضور داشته باشد", "حضور داشته باشه", "سر کار باشد", "سر کار باشه", "از این به بعد", "همیشه"];
  const OFFW = ["تعطیل", "نمیاد", "نمی آید", "نباشد", "نباشه", "نیست"];
  const CANCEL = ["کنسل", "لغو", "حذف", "پاک"];
  const MOVE = ["بگذار", "بذار", "ببر", "منتقل", "جابه جا", "جابجا", "تغییر بده", "عوض کن", "بزن", "تغییر"];
  /* جریمه و تشویق (stadj؛ adj.js): «علی رضایی ۵۰۰ هزار جریمه به خاطر تأخیر»، «به مریم ۲ میلیون تشویق بده برای کار خوب» */
  const FINE = ["جریمه", "کسر از حقوق", "کسر حقوق", "کسر"], BONUS = ["تشویق", "پاداش", "اضافه حقوق"];   /* «اضافه کاری» تشویق نیست (ساعت کار) */
  const REASON_MARK = ["به خاطر", "بخاطر", "به دلیل", "بدلیل", "به علت", "بعلت", "بابت", "برای", "واسه"];
  const NUM_WORD = { یک: 1, یه: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, بیست: 20, سی: 30, چهل: 40, پنجاه: 50,
    شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90, صد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500, ششصد: 600, هفتصد: 700, هشتصد: 800, نهصد: 900 };
  const NUM_KEYS = Object.keys(NUM_WORD).sort((a, b) => b.length - a.length);
  const UNIT = { هزار: 1e3, میلیون: 1e6 };
  /* مبلغ به تومان از متن نرمال‌شده؛ هزار/میلیون/نیم، عدد حرفی، ریال ÷ ۱۰، و ترکیب با «و» («۱ میلیون و ۲۰۰ هزار»، «۵۰۰ هزار و ۲۰۰»).
     تکهٔ بعد از «و» فقط وقتی جزو مبلغ است که تکهٔ قبلی واحد داشته باشد و خودش از آن واحد کوچک‌تر باشد. خروجی { s, amount|null } */
  function takeAmount(s) {
    const num = "(?:\\d+(?:[.,]\\d+)?|" + NUM_KEYS.join("|") + ")", term = "(?:" + num + "(?: و نیم)?|نیم) ?(?:هزار|میلیون)?";
    const rx = new RegExp("(?:^| )(" + term + "(?: و " + term + ")*)(?: (تومان|تومن|ریال))?(?= |$)");
    const one = new RegExp("^(" + num + "|نیم)( و نیم)? ?(هزار|میلیون)?$");
    for (let from = 0; from < s.length;) {
      const m = rx.exec(s.slice(from)); if (!m) break;
      const pieces = m[1].split(" و ").reduce((a, p) => {   /* «یک و نیم میلیون» یک تکه است */
        if (/^نیم(?: |$)/.test(p) && a.length && !/(?:هزار|میلیون)$/.test(a[a.length - 1])) a[a.length - 1] += " و " + p; else a.push(p);
        return a;
      }, []);
      let total = 0, used = 0, lastUnit = 0, ok = false;
      for (const p of pieces) {
        const q = one.exec(p);
        if (!q) break;
        const n = q[1] === "نیم" ? 0.5 : NUM_WORD[q[1]] != null ? NUM_WORD[q[1]] : parseFloat(q[1].replace(",", "."));
        const v = (n + (q[2] ? 0.5 : 0)) * (UNIT[q[3]] || 1);
        if (used && !(lastUnit && v < lastUnit)) break;
        if (!used && !(q[3] || m[2] || /\d/.test(q[1]))) break;
        total += v; used++; lastUnit = UNIT[q[3]] || 0; ok = true;
      }
      if (ok) {
        const text = pieces.slice(0, used).join(" و ") + (used === pieces.length && m[2] ? " " + m[2] : "");
        const amount = Math.round(total / (used === pieces.length && m[2] === "ریال" ? 10 : 1));
        const at = from + m.index + (m[0].startsWith(" ") ? 1 : 0);
        return { s: (s.slice(0, at) + " " + s.slice(at + text.length)).replace(/\s+/g, " ").trim(), amount };
      }
      from += m.index + Math.max(1, m[0].length);
    }
    return { s, amount: null };
  }
  /* ماه حقوق: «ماه بعد/قبل» یا نام ماه، با سال اختیاری («آبان ۱۴۰۴»، «آبان سال ۱۴۰۴»، «آبان پارسال»، «مهر امسال»)؛ پیش‌فرض ماه جاری.
     خروجی { s, key: "1405-07", label } */
  function takeMonth(s, today) {
    let [y, m] = AC.jparts(today), off = 0;
    if (/(?:^| )(?:برای |واسه )?ماه (?:بعد|آینده|دیگه)(?= |$)/.test(s)) { off = 1; s = s.replace(/(?:^| )(?:برای |واسه )?ماه (?:بعد|آینده|دیگه)(?= |$)/, " "); }
    else if (/(?:^| )(?:برای |واسه )?ماه (?:قبل|پیش|گذشته)(?= |$)/.test(s)) { off = -1; s = s.replace(/(?:^| )(?:برای |واسه )?ماه (?:قبل|پیش|گذشته)(?= |$)/, " "); }
    else {
      const mrx = new RegExp("(?:^| )(?:برای |واسه )?(?:ماه )?(" + MONTHS.map(norm).join("|") + ")"
        + "(?: (?:سال )?(1[34]\\d\\d|پارسال|امسال|سال (?:قبل|پیش|گذشته)))?(?= |$)");
      const mm = mrx.exec(s);
      if (mm) { m = MONTHS.map(norm).indexOf(mm[1]) + 1; if (mm[2]) y = /^\d/.test(mm[2]) ? +mm[2] : mm[2] === "امسال" ? y : y - 1; s = s.replace(mrx, " "); }
    }
    m += off; if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
    return { s: s.replace(/\s+/g, " ").trim(), key: y + "-" + pad(m), label: MONTHS[m - 1] + " " + fa(y) };
  }
  /* دلیل: متن بعد از «به خاطر/بابت/برای/…» (بعد از حذف اسم، مبلغ و ماه)، بدون فعل آخر */
  function takeReason(s) {
    const rx = new RegExp("(?:^| )(?:" + REASON_MARK.map(norm).join("|") + ") (.+)$"), m = rx.exec(s);
    if (!m) return "";
    let r = m[1];   /* «برای سارا بابت نظم» بعد از حذف اسم ← «برای بابت نظم»: نشانهٔ تکراری اول حذف می‌شود */
    const lead = new RegExp("^(?:" + REASON_MARK.map(norm).join("|") + ") ");
    while (lead.test(r)) r = r.replace(lead, "");
    return r.replace(/ (?:بده|بزن|کن|ثبت کن|بشه|شود|شد|کنید)$/, "").replace(/^(?:اینکه|این که) /, "").trim();
  }
  const stripName = (s, p) => { for (const w of nameTokens(p.name)) s = s.replace(new RegExp("(?:^| )" + w + "(?= |$)"), " "); return s.replace(/\s+/g, " ").trim(); };
  /* دلیل با املای خود کاربر: همان تکه از متن اصلی که نرمال‌شده‌اش با دلیلِ پیداشده یکی است (norm همزه و ی/ک عربی را عوض می‌کند) */
  function rawSpan(raw, want) {
    const w = String(raw || "").trim().split(/\s+/);
    for (let i = 0; i < w.length; i++) for (let j = i; j < w.length; j++) { const t = w.slice(i, j + 1).join(" "); if (norm(t) === want) return t.replace(/[،,.؛;:!?؟]+$/, ""); }
    return want;
  }
  function parseAdjust(s0, f, ctx, raw) {
    const miss = why => ({ miss: why, why });   /* متن اصلی را parseClause می‌گذارد */
    const type = has(s0, FINE) ? "fine" : "bonus";
    if (ctx.self && !ctx.self.adjRequest) return miss("ثبت جریمه و تشویق کار مدیر است (یا کسی که اجازهٔ درخواست دارد)");
    if (f.ambiguous) return miss("چند نفر با این نام هستند: " + f.ambiguous.map(x => x.name).join("، ") + " — نام کامل را بنویس");
    if (!f.p) return miss("اسم همکار پیدا نشد؛ نام کامل را بنویس");
    if (ctx.self && f.p.id === ctx.self.id) return miss("برای خودت نمی‌شود؛ فقط برای همکار");
    let s = stripName(s0, f.p);
    const mo = takeMonth(s, ctx.today); s = mo.s;   /* اول ماه، تا سالِ «آبان ۱۴۰۴» مبلغ خوانده نشود */
    const am = takeAmount(s); s = am.s;
    if (!(am.amount > 0)) return miss("مبلغ را بنویس (مثلاً «۵۰۰ هزار»)");
    const reason0 = takeReason(s), reason = reason0 && rawSpan(ctx.rawSentence || raw, reason0);   /* تکهٔ جداشده با «و» نرمال است؛ املا از جملهٔ اصلی */
    if (!reason) return miss("دلیل را بنویس (مثلاً «به خاطر تأخیر»)");
    const req = !!ctx.self, tn = type === "fine" ? "جریمه" : "تشویق";
    return { kind: "adjust", staffId: f.p.id, name: f.p.name, type, amount: am.amount, reason, period: mo.key, periodLabel: mo.label, request: req,
      text: (req ? "درخواست برای مدیر — " : "") + tn + " " + fa(am.amount.toLocaleString("en-US")) + " تومان برای " + f.p.name + " — " + reason + " (" + mo.label + ")" };
  }

  const iso = (y, m, d) => y + "-" + pad(m) + "-" + pad(d);
  const jlabel = i => { const [y, m, d] = AC.jparts(i); return d + " " + MONTHS[m - 1] + (y ? "" : ""); };
  const fa = x => String(x).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const jfa = i => fa(jlabel(i));

  /* ---------- کارمند ---------- */
  const nameTokens = n => norm(n).split(" ").filter(w => w.length >= 2 && w !== "دکتر");
  function findStaff(s, staff) {
    const toks = new Set(s.split(" ")), scored = [];
    for (const p of staff) { const nt = nameTokens(p.name), c = nt.filter(w => toks.has(w)).length; if (c) scored.push({ p, c, full: c === nt.length }); }
    if (!scored.length) return { none: true };
    const best = Math.max(...scored.map(x => x.c)); let top = scored.filter(x => x.c === best);
    if (top.length > 1 && has(s, ["دکتر"])) { const d = top.filter(x => x.p.role === "doctor"); if (d.length) top = d; }
    if (top.length > 1) return { ambiguous: top.map(x => x.p) };
    return { p: top[0].p };
  }

  /* ---------- تاریخ و ساعت (روی متن نرمال‌شده؛ تکه‌های خوانده‌شده حذف می‌شوند) ---------- */
  function takeDates(s, today) {
    const out = []; const [ty] = AC.jparts(today);
    const mrx = new RegExp("(?:^| )(?:(\\d{4}) )?(\\d{1,2}) (" + MONTHS.map(norm).join("|") + ")(?: (\\d{4}))?(?= |$)", "g");
    s = s.replace(mrx, (m, y1, d, mn, y2) => { const jm = MONTHS.map(norm).indexOf(mn) + 1, y = +(y1 || y2) || 0; let i = AC.fromJalali(y || ty, jm, +d); if (!y && AC.diffDays(today, i) < -60) i = AC.fromJalali(ty + 1, jm, +d); out.push({ iso: i, at: out.length }); return " @ "; });
    s = s.replace(/(?:^| )(\d{4}) [\/-] (\d{1,2}) [\/-] (\d{1,2})(?= |$)/g, (m, y, mo, d) => { out.push({ iso: AC.fromJalali(+y, +mo, +d) }); return " @ "; });
    s = s.replace(/(?:^| )پس ?فردا(?= |$)/g, () => { out.push({ iso: AC.addDays(today, 2) }); return " @ "; });
    s = s.replace(/(?:^| )فردا(?= |$)/g, () => { out.push({ iso: AC.addDays(today, 1) }); return " @ "; });
    s = s.replace(/(?:^| )امروز(?= |$)/g, () => { out.push({ iso: today }); return " @ "; });
    return { s: s.replace(/\s+/g, " ").trim(), dates: out };
  }
  function takeWeekdays(s, today) {
    let plural = false; const next = /هفته (?:بعد|آینده|دیگه)/.test(s);
    if (next) s = s.replace(/هفته (?:بعد|آینده|دیگه)/g, " ");
    for (const [w, d] of WD) {
      const rx = new RegExp("(?:^| )" + w + "( ها| های)?(?= |$)", "g");
      s = s.replace(rx, (m, pl) => { if (pl) plural = true; return " #" + d + " "; });
    }
    const ordered = []; s.replace(/#(\w+)/g, (m, d) => { ordered.push(d); return m; });
    s = s.replace(/#\w+/g, "#");
    const order = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"], days = [...new Set(ordered)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const dateOf = d => { const k = order.indexOf(d); if (next) return AC.addDays(AC.weekStart(today), 7 + k); const diff = (k - AC.dow(today) + 7) % 7; return AC.addDays(today, diff); };
    return { s: s.replace(/\s+/g, " ").trim(), days, ordered, plural, dateOf };
  }
  const ampm = (h, s) => { if (/(?:^| )(?:عصر|بعد ?از ?ظهر|شب)(?: |$)/.test(s) && h < 12) return h + 12; if (/(?:^| )ظهر(?: |$)/.test(s) && h < 7) return h + 12; return h; };
  function takeTimes(s) {
    const times = [], ranges = [];
    const hm = (h, m) => pad(h) + ":" + pad(m);
    s = s.replace(/(?:^| )(\d{1,2}) : (\d{2})(?= |$)/g, (m, h, mi) => { times.push({ h: +h, m: +mi }); return " $ "; });
    const rr = /(?:^| )از (?:ساعت )?(\d{1,2})(?: و (نیم|ربع))?(?: (صبح|ظهر|عصر|بعد ?از ?ظهر|شب))? تا (?:ساعت )?(\d{1,2})(?: و (نیم|ربع))?(?: (صبح|ظهر|عصر|بعد ?از ?ظهر|شب))?(?= |$)/g;
    s = s.replace(rr, (m, a, qa, wa, b, qb, wb) => { const word = (wb || wa || ""); const A = ampm(+a, word), B = ampm(+b, word); ranges.push({ a: [A, qa === "نیم" ? 30 : qa === "ربع" ? 15 : 0], b: [B, qb === "نیم" ? 30 : qb === "ربع" ? 15 : 0] }); return " % "; });
    return { s: s.replace(/\s+/g, " ").trim(), times, ranges, hm };
  }
  function takeRangesColon(s) {   // "9 : 10 تا 12" و "از 9 : 00 تا 12 : 00"
    const ranges = []; s = s.replace(/ و (\d{1,2}(?: : \d{2})? تا )/g, " از $1");
    s = s.replace(/(?:^| )از (?:ساعت )?(\d{1,2})(?: : (\d{2}))? تا (?:ساعت )?(\d{1,2})(?: : (\d{2}))?(?: (صبح|ظهر|عصر|بعد ?از ?ظهر|شب))?(?= |$)/g, (m, a, am, b, bm, w) => { ranges.push({ a: [ampm(+a, w || ""), +(am || 0)], b: [ampm(+b, w || ""), +(bm || 0)] }); return " % "; });
    return { s: s.replace(/\s+/g, " ").trim(), ranges };
  }
  const single = (s, want) => {   // «ساعت ۱۴» / «۱۰ صبح» ← {h,m}
    let m = /(?:^| )ساعت (\d{1,2})(?: و (نیم|ربع))?(?: (صبح|ظهر|عصر|بعد ?از ?ظهر|شب))?(?= |$)/.exec(s) || /(?:^| )(\d{1,2})(?: و (نیم|ربع))? ()(?:صبح|ظهر|عصر|بعد ?از ?ظهر|شب)(?= |$)/.exec(s);
    if (!m) return null; const w = /(صبح|ظهر|عصر|بعد ?از ?ظهر|شب)/.exec(m[0]); let h = ampm(+m[1], w ? w[1] : ""); if (!w && h >= 1 && h <= 6) h += 12; return { h, m: m[2] === "نیم" ? 30 : m[2] === "ربع" ? 15 : 0 };
  };
  const hhmm = ([h, m]) => pad(h) + ":" + pad(m);

  /* ---------- خروجی Excel: «خروجی نوبت‌های دکتر نوری ماه قبل»؛ فیلتر گفته‌نشده = همه؛ مبهم ← سؤال با دکمه (kind: ask) ---------- */
  /* f: فیلترهایی که هر خروجی می‌فهمد — period بازهٔ زمانی، year سال (پیش‌فرض امسال)، doctor/staff نفر، role نقش. mod: ماژولی که باید روشن باشد */
  const EXPORTS = [
    { key: "appts", label: "نوبت‌ها", words: ["نوبت", "نوبت ها", "نوبتها"], f: ["period", "doctor"] },
    { key: "patients", label: "بیماران", words: ["بیمار", "بیماران", "بیمارها", "پرونده", "پرونده ها"], f: ["doctor"] },
    { key: "staff", label: "فهرست کارکنان", words: ["کارکنان", "کارمندان", "کارمند ها", "کارمندها", "پرسنل", "کارمند"], f: ["role"] },
    { key: "leave", label: "مرخصی‌ها", words: ["مرخصی", "مرخصی ها", "مرخصیها"], f: ["period", "staff"] },
    { key: "meetings", label: "جلسه‌ها", words: ["جلسه", "جلسه ها", "جلسات"], f: ["period"] },
    { key: "adj", label: "جریمه و تشویق", words: ["جریمه", "تشویق", "جریمه ها"], f: ["year"] },
    { key: "staffpay", label: "پرداخت به کارکنان", words: ["حقوق", "پرداخت کارکنان", "پرداخت به کارکنان", "پرداختی کارکنان", "پرداختی ها"], f: ["period", "staff"] },
    { key: "debt", label: "بدهکاران", words: ["بدهکار", "بدهکاران", "بدهکارها", "بدهی", "بدهی ها"], f: [] },
    { key: "exp", label: "هزینه‌ها", words: ["هزینه", "هزینه ها", "هزینه‌ها"], f: ["period"] },
    { key: "chq", label: "چک‌ها", words: ["چک", "چک ها", "چکها"], f: [] },
    { key: "ledger", label: "خلاصهٔ مالی ماه‌به‌ماه", words: ["مالی", "درآمد", "دخل و خرج", "درآمد و هزینه"], f: ["period"] },
    { key: "journal", label: "دفتر روزنامه", words: ["دفتر روزنامه", "روزنامه"], f: ["period"], mod: "accounting" },
    { key: "trial", label: "تراز آزمایشی", words: ["تراز آزمایشی", "تراز"], f: ["period"], mod: "accounting" },
    { key: "pnl", label: "سود و زیان", words: ["سود و زیان", "سود", "صورت سود و زیان"], f: ["period"], mod: "accounting" },
    { key: "bs", label: "ترازنامه", words: ["ترازنامه"], f: [], mod: "accounting" },
    { key: "tax", label: "گزارش مالیاتی", words: ["مالیات", "مالیاتی"], f: ["year"], mod: "accounting" },
    { key: "ins", label: "بیماران بیمه‌ای", words: ["بیمه", "بیمه ای", "بیماران بیمه", "بیماران بیمه ای", "بیمار بیمه"], f: [], mod: "insurance" },
    { key: "insrep", label: "گزارش بیمه", words: ["بیمه", "گزارش بیمه", "کسورات"], f: ["period"], mod: "insurance" },
  ];
  const EXPORT_WORDS = ["خروجی", "اکسل", "excel", "خروجی اکسل", "فایل اکسل"];
  const modOk = (ctx, m) => !m || (ctx && typeof ctx.modOn === "function" ? ctx.modOn(m) !== false
    : typeof root.MC_MOD_ON === "function" ? root.MC_MOD_ON(m) !== false : true);
  const jl = i => { const [y, m, d] = AC.jparts(i); return fa(d) + " " + MONTHS[m - 1] + " " + fa(y); };
  /* بازهٔ زمانی گفته‌شده، یا null (= همه). خروجی { s, period: {from,to,label}|null } */
  function takePeriod(s, today) {
    const [ty, tm] = AC.jparts(today), monthOf = (y, m) => ({ from: AC.fromJalali(y, m, 1),
      to: AC.addDays(AC.fromJalali(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1), -1), label: MONTHS[m - 1] + " " + fa(y) });
    const yearOf = y => ({ from: AC.fromJalali(y, 1, 1), to: AC.addDays(AC.fromJalali(y + 1, 1, 1), -1), label: "سال " + fa(y), year: y });
    const cut = rx => { const m = rx.exec(s); if (m) s = s.replace(rx, " ").replace(/\s+/g, " ").trim(); return m; };
    let m;
    if (cut(/(?:^| )(?:همه|کل) (?:زمان ها|تاریخ ها|دوره ها)(?= |$)/)) return { s, period: null };
    if (cut(/(?:^| )(?:این|همین) هفته(?= |$)/)) { const f = AC.weekStart(today); return { s, period: { from: f, to: AC.addDays(f, 6), label: "این هفته" } }; }
    if (cut(/(?:^| )هفته (?:قبل|پیش|گذشته)(?= |$)/)) { const f = AC.addDays(AC.weekStart(today), -7); return { s, period: { from: f, to: AC.addDays(f, 6), label: "هفتهٔ قبل" } }; }
    if (cut(/(?:^| )(?:این|همین) ماه|(?:^| )ماه (?:جاری|فعلی)(?= |$)/)) return { s, period: monthOf(ty, tm) };
    if (cut(/(?:^| )ماه (?:قبل|پیش|گذشته)(?= |$)/)) return { s, period: tm === 1 ? monthOf(ty - 1, 12) : monthOf(ty, tm - 1) };
    if (cut(/(?:^| )(?:امسال|سال (?:جاری|فعلی)|این سال)(?= |$)/)) return { s, period: yearOf(ty) };
    if (cut(/(?:^| )(?:پارسال|سال (?:قبل|پیش|گذشته))(?= |$)/)) return { s, period: yearOf(ty - 1) };
    if (cut(/(?:^| )دیروز(?= |$)/)) { const d = AC.addDays(today, -1); return { s, period: { from: d, to: d, label: "دیروز" } }; }
    /* «۲۰ مهر تا ۵ آبان»، «از ۱ مهر»، «امروز»، «فردا» */
    const r = takeDates(s, today);
    if (r.dates.length) {
      s = r.s; const ds = r.dates.map(d => d.iso).sort();
      let from = ds[0], to = ds[ds.length - 1];
      if (ds.length === 1 && /(?:^| )از @/.test(s)) to = today > from ? today : from;   /* «از ۱ مهر» ← تا امروز */
      else if (ds.length === 1 && /(?:^| )تا @/.test(s)) from = "";                       /* «تا ۱۰ مهر» ← از ابتدا */
      s = s.replace(/(?:^| )(?:از|تا)(?= |$)/g, " ").replace(/@/g, " ").replace(/\s+/g, " ").trim();
      return { s, period: { from, to, label: from === to ? jl(from) : (from ? jl(from) : "ابتدا") + " تا " + jl(to) } };
    }
    if ((m = cut(new RegExp("(?:^| )(?:ماه )?(" + MONTHS.map(norm).join("|") + ")(?: (?:سال )?(1[34]\\d\\d|پارسال|امسال))?(?= |$)")))) {
      const mo = MONTHS.map(norm).indexOf(m[1]) + 1, y = !m[2] || m[2] === "امسال" ? (mo > tm ? ty - 1 : ty) : m[2] === "پارسال" ? ty - 1 : +m[2];
      return { s, period: monthOf(y, mo) };
    }
    if ((m = cut(/(?:^| )سال (1[34]\d\d)(?= |$)|(?:^| )(1[34]\d\d)(?= |$)/))) return { s, period: yearOf(+(m[1] || m[2])) };
    return { s, period: null };
  }
  function parseExport(s0, ctx) {
    const miss = why => ({ miss: why });
    if (ctx.self) return miss("خروجی گرفتن با دستور فقط برای مدیر است");
    const avail = EXPORTS.filter(e => modOk(ctx, e.mod));
    let s = s0;
    for (const w of EXPORT_WORDS) s = s.replace(new RegExp("(?:^| )" + norm(w) + "(?= |$)", "g"), " ");
    s = s.replace(/(?:^| )(?:بگیر|بده|بفرست|میخوام|می خواهم|بساز|را|رو|ی|های|برای|واسه|کن|لطفا)(?= |$)/g, " ").replace(/\s+/g, " ").trim();
    const p = takePeriod(s, ctx.today); s = p.s;
    /* هدف: کلمه‌های هر خروجی؛ کلمه‌ای که داخل کلمهٔ بلندتر یک خروجی دیگر است حساب نمی‌شود («گزارش بیمه» ← فقط گزارش بیمه) */
    const hits = avail.map(e => ({ e, w: e.words.map(norm).filter(w => new RegExp("(?:^| )" + w + "(?= |$)").test(s)).sort((a, b) => b.length - a.length)[0] })).filter(x => x.w);
    const top = hits.filter(x => !hits.some(y => y !== x && y.w.length > x.w.length && (" " + y.w + " ").includes(" " + x.w + " ")));
    const people = (ctx.staff || []).filter(st => { const nt = nameTokens(st.name); return nt.length && nt.every(w => new RegExp("(?:^| )" + w + "(?= |$)").test(s)); });
    const fs = findStaff(s, ctx.staff || []), role = (ROLES.find(([rx]) => rx.test(" " + s.replace(/ ها(?= |$)/g, "") + " ")) || [])[1];
    const build = (e, who) => {
      const it = { kind: "export", key: e.key, label: e.label };
      const bits = [];
      if (e.f.includes("year")) { const y = p.period && p.period.year ? p.period.year : p.period ? AC.jparts(p.period.to || p.period.from)[0] : AC.jparts(ctx.today)[0];
        it.year = y; bits.push("سال " + fa(y)); }
      else if (e.f.includes("period")) { if (p.period) { it.from = p.period.from; it.to = p.period.to; } bits.push(p.period ? p.period.label : "همهٔ زمان‌ها"); }
      if (who && (e.f.includes("doctor") || e.f.includes("staff"))) { it.staffId = who.id; it.staffName = who.name; bits.push(who.name); }
      else if (e.f.includes("doctor")) bits.push("همهٔ دکترها"); else if (e.f.includes("staff")) bits.push("همهٔ کارکنان");
      if (e.f.includes("role")) { if (role) { it.role = role; bits.push("فقط " + ROLE_FA[role]); } else bits.push("همهٔ نقش‌ها"); }
      it.text = "خروجی Excel «" + e.label + "»" + (bits.length ? " — " + bits.join("، ") : "");
      /* فیلتری که این خروجی نمی‌فهمد: گفته می‌شود، نه اینکه بی‌صدا کنار برود */
      const ign = [];
      if (who && !e.f.includes("doctor") && !e.f.includes("staff")) ign.push("نام «" + who.name + "»");
      if (p.period && !e.f.includes("period") && !e.f.includes("year")) ign.push("بازهٔ «" + p.period.label + "»");
      if (ign.length) it.note = "این خروجی فیلتر " + ign.join(" و ") + " ندارد؛ همه را می‌دهد";
      return it;
    };
    const ask = (q, list) => ({ kind: "ask", text: q, choices: list.map(x => ({ label: x.label, item: x.item })) });
    const ambWho = !fs.p && fs.ambiguous ? fs.ambiguous : people.length > 1 ? people : null;
    if (!top.length) return ask("از کدام بخش خروجی می‌خواهی؟", avail.map(e => ({ label: e.label, item: build(e, fs.p) })));
    if (top.length > 1) return ask("کدام خروجی؟", top.map(x => ({ label: x.e.label, item: build(x.e, fs.p) })));
    const e = top[0].e;
    if (ambWho && (e.f.includes("doctor") || e.f.includes("staff"))) {
      const pool = e.f.includes("doctor") ? ambWho.filter(x => x.role === "doctor") : ambWho;
      if (pool.length === 1) return build(e, pool[0]);
      return ask("منظور کدام نفر است؟", [...(pool.length ? pool : ambWho).map(w => ({ label: w.name, item: build(e, w) })),
        { label: "همه", item: build(e, null) }]);
    }
    if (fs.p && e.f.includes("doctor") && fs.p.role !== "doctor") return miss("«" + fs.p.name + "» دکتر نیست؛ این خروجی فقط با نام دکتر فیلتر می‌شود");
    return build(e, fs.p);
  }

  /* ---------- جلسه: «ساعت ۱۵ جلسه»، «فردا ساعت ۱۰ جلسهٔ دکترها به مدت یک ساعت دربارهٔ بیمه» ----------
     روز گفته نشود = امروز؛ نفرات گفته نشود = همه؛ مدت پیش‌فرض ۳۰ دقیقه. اجرا (mgrcmdui): مرخصی ساعتیِ kind:"meeting" برای هر نفر،
     لغو نوبت‌های هم‌زمانِ دکترهای جلسه و خبر به منشی برای جای جدید، و خبر جلسه به همه. */
  /* گروه با نقش فقط به صورت جمع («دکترها»، «منشی‌ها»)؛ «دکتر نوری» یعنی همان یک نفر */
  const PL = "(?: ?ها| ?های)";
  const ROLE_PL = [[new RegExp("(?:^| )(?:دکتر|دندانپزشک|پزشک)" + PL + "(?= |$)"), "doctor"], [new RegExp("(?:^| )دستیار" + PL + "(?= |$)"), "assistant"],
    [new RegExp("(?:^| )(?:منشی" + PL + "|پذیرش)(?= |$)"), "reception"], [new RegExp("(?:^| )مسئول(?:ین|ان)? بیمه(?= |$)"), "insurance"],
    [new RegExp("(?:^| )(?:لابراتوار|لاب)(?= |$)"), "lab"], [new RegExp("(?:^| )انباردار" + PL + "?(?= |$)"), "store"], [new RegExp("(?:^| )حسابدار" + PL + "?(?= |$)"), "accountant"]];
  const MEET = ["جلسه", "جلسات", "میتینگ", "نشست"];
  function parseMeeting(s0, ctx, raw) {
    const miss = why => ({ miss: why });
    if (ctx.self) return miss("گذاشتن جلسه کار مدیر است");
    let s = s0, topic = "";
    const tp = /(?:^| )(?:درباره ی|درباره|در مورد|با موضوع|موضوع|راجع به|برای)(?: ی)? (.+)$/.exec(s);
    if (tp) { topic = tp[1].replace(/ (?:بذار|بگذار|بزار|داریم|هست|است|باشه|باشد|کن|میذاریم|بگذاریم)$/, "").trim(); s = s.slice(0, tp.index); }
    /* مدت: «به مدت ۴۵ دقیقه»، «یک ساعت و نیم»، «نیم ساعت»، «۲ ساعته» */
    let dur = 30, dm;
    if ((dm = /(?:^| )(?:به مدت )?(\d{1,3}|یک|یه|دو|سه|نیم) ?(ساعت|دقیقه)(?: و (نیم|ربع))?(?: ه| ای)?(?= |$)/.exec(s)) && !/(?:^| )ساعت \d/.test(dm[0])) {
      const n = dm[1] === "نیم" ? 0.5 : NUM_WORD[dm[1]] != null ? NUM_WORD[dm[1]] : +dm[1];
      dur = Math.round(dm[2] === "ساعت" ? n * 60 + (dm[3] === "نیم" ? 30 : dm[3] === "ربع" ? 15 : 0) : n);
      s = s.replace(dm[0], " ");
    }
    if (dur < 15 || dur > 480 || dur % 15) return miss("مدت جلسه باید مضرب ۱۵ دقیقه و حداکثر ۸ ساعت باشد");
    const r = takeDates(s, ctx.today), wd = takeWeekdays(r.s, ctx.today);
    if (r.dates.length > 1 || wd.days.length > 1) return miss("جلسه فقط برای یک روز گذاشته می‌شود");
    const date = r.dates[0] ? r.dates[0].iso : wd.days[0] ? wd.dateOf(wd.days[0]) : ctx.today;
    const colon = /(?:^| )(\d{1,2}) : (\d{2})(?= |$)/.exec(wd.s), one = colon ? { h: ampm(+colon[1], wd.s), m: +colon[2] } : single(wd.s);
    if (!one) return miss("ساعت جلسه را بنویس (مثلاً «ساعت ۱۵»)");
    const start = hhmm([one.h, one.m]), endMin = HR.toMin(start) + dur;
    if (one.h > 23 || one.m > 59 || HR.toMin(start) % 15) return miss("ساعت جلسه باید مضرب ۱۵ دقیقه باشد");
    if (endMin > 24 * 60) return miss("جلسه از نیمه‌شب می‌گذرد");
    if (date < ctx.today) return miss("تاریخ جلسه گذشته است");
    const end = HR.fromMin(endMin);
    /* نفرات: نام‌های کامل، یا نقش‌ها («دکترها»، «منشی‌ها»)؛ هیچ‌کدام ← همه */
    const staff = ctx.staff || [];
    const named = staff.filter(st => { const nt = nameTokens(st.name); return nt.length && nt.every(w => new RegExp("(?:^| )" + w + "(?= |$)").test(wd.s)); });
    const roles = ROLE_PL.filter(([rx]) => rx.test(wd.s)).map(x => x[1]).filter(r => roleOn(ctx, r));
    const byRole = staff.filter(st => roles.includes(st.role) && !named.includes(st));
    const people = named.length || roles.length ? [...named, ...byRole] : staff;
    if (!people.length) return miss("کسی برای جلسه پیدا نشد");
    const all = !named.length && !roles.length;
    const whoTxt = all ? "همهٔ کارکنان" : [...roles.map(x => ROLE_FA[x] + "‌ها"), ...named.map(x => x.name)].join("، ");
    const topicRaw = topic && rawSpan(ctx.rawSentence || raw, topic);
    return { kind: "meeting", date, start, end, duration: dur, staffIds: people.map(x => x.id), all, topic: topicRaw || "",
      text: "جلسه " + (date === ctx.today ? "امروز" : jl(date)) + " ساعت " + fa(start) + " تا " + fa(end) + " — " + whoTxt + " (" + fa(people.length) + " نفر)"
        + (topicRaw ? "، موضوع: " + topicRaw : "") + ". نوبت‌های هم‌زمان دکترهای جلسه لغو می‌شود و به منشی خبر می‌رود." };
  }

  /* ---------- پرسش: «تعداد بیماران امروز»، «چه کسانی امروز سر کارند»، «گزارش کارکرد این ماه»… ----------
     جواب را mgrcmdui از دادهٔ همین گوشی می‌سازد (kind: query). روز نگفته = امروز (پرسش‌های روزانه)؛ بازهٔ پرسش‌های آماری مبهم ← سؤال با دکمه. */
  const ASKW = ["چند", "چندتا", "چند تا", "چقدر", "چه قدر", "تعداد", "کی", "کیا", "کی ها", "چه کسی", "چه کسانی", "کدام", "کدوم", "کدوما", "چی", "چیه", "چه",
    "گزارش", "وضعیت", "آمار", "لیست", "فهرست", "نشان بده", "نشون بده", "بگو", "ببینم", "هست", "هستند", "هستن", "داریم", "دارد", "داره"];
  /* day: بازهٔ پیش‌فرض امروز؛ span: بازهٔ نگفته ← سؤال؛ none: بی‌بازه. who: نام دکتر/کارمند فیلتر می‌شود */
  const QUERIES = [
    { key: "who", label: "چه کسی سر کار است", words: ["سر کار", "سرکار", "سر کارند", "سر کاره", "سرکارند", "سرکاره", "حاضر", "حاضرند", "حضور", "شیفت"], p: "day", who: true },
    { key: "work", label: "گزارش کارکرد", words: ["کارکرد", "عملکرد", "کار کرد"], p: "span", who: true },
    { key: "appts", label: "نوبت‌ها و بیماران", words: ["بیمار", "بیماران", "بیمارها", "نوبت", "نوبت ها", "نوبتها", "مراجعه", "مراجعین", "مراجعه کننده"], p: "day", who: true },
    { key: "newpat", label: "بیماران تازه", words: ["بیمار جدید", "بیماران جدید", "بیمار تازه", "بیماران تازه", "پرونده جدید", "پرونده های جدید"], p: "span" },
    { key: "noshow", label: "نیامده‌ها و لغوها", words: ["نیامد", "نیامدند", "نیومد", "نیومدن", "غایب", "لغو شده", "لغو", "کنسل", "کنسلی"], p: "span", who: true },
    { key: "income", label: "درآمد (دریافتی از بیماران)", words: ["درآمد", "دریافتی", "دریافت", "فروش", "دخل", "پول", "واریز"], p: "span", who: true },
    { key: "expense", label: "هزینه‌ها", words: ["هزینه", "هزینه ها", "خرج", "مخارج"], p: "span" },
    { key: "debt", label: "بدهکاران", words: ["بدهکار", "بدهکاران", "بدهکارها", "بدهی", "طلب"], p: "none", who: true },
    { key: "leave", label: "مرخصی‌ها", words: ["مرخصی", "مرخصیه", "مرخصی اند", "مرخصی ها", "مرخصیها", "نیستند", "غیبت"], p: "day", who: true },
    { key: "pending", label: "درخواست‌های منتظر", words: ["درخواست", "درخواست ها", "منتظر", "در انتظار", "تایید نشده"], p: "none" },
    { key: "stock", label: "کمبود انبار", words: ["موجودی", "انبار", "کمبود", "تموم", "تمام شده", "تموم شده", "کم داریم"], p: "none", mod: "inventory" },
    { key: "adj", label: "جریمه و تشویق", words: ["جریمه", "تشویق", "جریمه ها", "پاداش"], p: "span", who: true },
  ];
  const SPANS = [["امروز", 0], ["این هفته", 0], ["این ماه", 0], ["امسال", 0]];
  function parseQuery(s0, ctx, raw, force) {
    let s = (" " + s0 + " ").replace(/ (فردا|امروز|دیروز)(?:ی|ی ها)? /g, " $1 ").replace(/ ی /g, " ").replace(/\s+/g, " ").trim();
    const hits = QUERIES.filter(q => modOk(ctx, q.mod)).map(q => ({ q, w: q.words.map(norm).filter(w => new RegExp("(?:^| )" + w + "(?= |$)").test(s)).sort((a, b) => b.length - a.length)[0] })).filter(x => x.w);
    let top = hits.filter(x => !hits.some(y => y !== x && y.w.length > x.w.length && (" " + y.w + " ").includes(" " + x.w + " ")));
    /* اولویت: who، کارکرد و موضوع‌های خاص بر «بیمار/نوبت» عمومی غلبه می‌کنند */
    if (top.length > 1) { const spec = top.filter(x => x.q.key !== "appts"); if (spec.length) top = spec; }
    if (top.length > 1 && top.some(x => x.q.key === "who")) top = top.filter(x => x.q.key === "who" || x.q.key === "leave").slice(0, 1);
    if (!top.length) return null;
    if (!force && !has(s, ASKW) && !/[?؟]/.test(raw || "")) return null;
    const q = top[0].q;
    if (ctx.self && q.key !== "who") return { miss: "پرسش‌ها فعلاً فقط برای مدیر است (جز «چه کسی سر کار است»)" };
    for (const x of q.words.map(norm).sort((a, b) => b.length - a.length)) s = s.replace(new RegExp("(?:^| )" + x + "(?= |$)", "g"), " ");
    const fs = q.who ? findStaff(s, ctx.staff || []) : {};
    const per = takePeriod(s, ctx.today);
    let period = per.period;
    if (!period && q.p === "day") period = { from: ctx.today, to: ctx.today, label: "امروز" };
    if (!period && /(?:^| )فردا(?= |$)/.test(s)) { const d = AC.addDays(ctx.today, 1); period = { from: d, to: d, label: "فردا" }; }
    const build = (P, who, sub) => {
      const it = { kind: "query", key: sub || q.key, label: q.label };
      if (P) { it.from = P.from; it.to = P.to; it.plabel = P.label; }
      if (who) { it.staffId = who.id; it.staffName = who.name; }
      if (sub === "work_staff") it.label = "کارکرد کارکنان (ساعت حضور)"; else if (sub === "work_doc") it.label = "کارکرد دکترها";
      it.text = it.label + (P ? " — " + P.label : "") + (who ? "، " + who.name : "");
      return it;
    };
    const who = fs.p || null;
    if (fs.ambiguous) return { kind: "ask", text: "منظور کدام نفر است؟", choices: [...fs.ambiguous.map(w => ({ label: w.name, item: build(period, w) })), { label: "همه", item: build(period, null) }] };
    const spans = () => {
      const [ty, tm] = AC.jparts(ctx.today), ws = AC.weekStart(ctx.today);
      return [{ label: "امروز", P: { from: ctx.today, to: ctx.today, label: "امروز" } }, { label: "این هفته", P: { from: ws, to: AC.addDays(ws, 6), label: "این هفته" } },
        { label: "این ماه", P: takePeriod("این ماه", ctx.today).period }, { label: "امسال", P: takePeriod("امسال", ctx.today).period }]; };
    if (q.key === "work") {
      const kind = /(?:^| )(?:کارکنان|کارمندان|پرسنل|ساعت|ساعات|حضور|دستیار|منشی)/.test(s) ? "work_staff" : /(?:^| )(?:دکتر|دکترها|دکتر ها|پزشک|پزشکان)(?= |$)/.test(s) || (who && who.role === "doctor") ? "work_doc" : who ? "work_staff" : null;
      const P = period || takePeriod("این ماه", ctx.today).period;
      if (!kind) return { kind: "ask", text: "کارکرد دکترها (کار و مبلغ) یا کارکنان (ساعت حضور)؟", choices: [{ label: "کارکرد دکترها", item: build(P, who, "work_doc") },
        { label: "کارکرد کارکنان", item: build(P, who, "work_staff") }] };
      return build(P, who, kind);
    }
    if (!period && q.p === "span") return { kind: "ask", text: "برای چه بازه‌ای؟", choices: spans().map(x => ({ label: x.label, item: build(x.P, who) })) };
    return build(q.p === "none" ? null : period, who);
  }

  /* ---------- رفتن به صفحه: «برو به صفحهٔ بیمه»، «صندوق رو باز کن»؛ نام نزدیک هم قبول (یک حرف غلط) ---------- */
  const NAV = [
    ["cal", "تقویم", ["تقویم", "تقویم نوبت ها"]], ["clinicset", "برنامهٔ روز", ["برنامه روز", "برنامه روزانه"]], ["units", "یونیت‌ها", ["یونیت ها", "یونیتها", "یونیت"]],
    ["patients", "بیماران", ["بیماران", "بیمارها", "فهرست بیماران", "پرونده ها", "بیمار"]], ["ctdue", "اقساط", ["اقساط", "قسط ها", "قرارداد ها"]],
    ["lab", "لابراتوار", ["لابراتوار", "لاب", "لابراتور"]], ["insdesk", "بیمه (کارتابل)", ["بیمه", "کارتابل بیمه", "کارتابل"]],
    ["insclaims", "لیست‌های بیمه", ["لیست های بیمه", "لیست بیمه", "لیستهای بیمه"]], ["inspat", "بیماران بیمه‌دار", ["بیماران بیمه دار", "بیماران بیمه ای"]],
    ["insurers", "بیمه‌گرها", ["بیمه گرها", "بیمه گر ها", "بیمه گر"]], ["inscauses", "علت‌های کسورات", ["علت های کسورات", "کسورات"]],
    ["inventory", "انبار", ["انبار", "موجودی", "موجودی کالاها", "کالاها"]], ["invpapers", "اسناد انبار", ["اسناد انبار", "اسناد"]],
    ["staff", "کارکنان", ["کارکنان", "کارمندان", "پرسنل", "کارمند ها", "فهرست کارکنان"]], ["hours", "حضور و مرخصی", ["حضور و مرخصی", "مرخصی ها", "مرخصی", "ساعت حضور"]],
    ["att", "حضور و غیاب", ["حضور و غیاب"]], ["finpay", "پرداخت به کارکنان", ["پرداخت ها", "پرداخت کارکنان", "حقوق", "حقوق ها"]],
    ["acjournal", "حسابداری (روزنامه)", ["حسابداری", "روزنامه", "دفتر روزنامه"]], ["acledger", "دفتر کل", ["دفتر کل"]], ["actrial", "تراز", ["تراز", "تراز آزمایشی"]],
    ["acpnl", "سود و زیان", ["سود و زیان"]], ["acbs", "ترازنامه", ["ترازنامه"]], ["acmanual", "سند دستی", ["سند دستی"]], ["acclose", "بستن سال", ["بستن سال"]],
    ["fdash", "مالی (داشبورد)", ["مالی", "داشبورد", "داشبورد مالی"]], ["fcash", "صندوق", ["صندوق", "صندوق روزانه"]], ["fchq", "چک‌ها", ["چک ها", "چکها", "چک"]],
    ["fdebt", "بدهکاران", ["بدهکاران", "بدهکارها", "بدهی ها"]], ["fexp", "هزینه‌ها", ["هزینه ها", "هزینه"]], ["fparty", "طرف حساب‌ها", ["طرف حساب ها", "طرف حساب"]],
    ["fbank", "مغایرت بانکی", ["مغایرت بانکی", "مغایرت"]], ["reff", "گزارش (راندمان دکترها)", ["گزارش", "گزارش ها", "راندمان", "راندمان دکترها"]],
    ["treat", "گزارش درمان‌ها", ["درمان ها", "گزارش درمان ها"]], ["rappt", "گزارش نوبت‌ها", ["گزارش نوبت ها", "نوبت ها"]], ["rhr", "گزارش حضور کارکنان", ["حضور کارکنان", "گزارش حضور"]],
    ["rinv", "مصرف انبار", ["مصرف انبار"]], ["rins", "گزارش بیمه", ["گزارش بیمه"]], ["treatinfo", "تنظیمات (تعرفه‌ها)", ["تنظیمات", "تعرفه", "تعرفه ها"]],
    ["clinicwk", "کلینیک و ساعت کار", ["ساعت کار کلینیک", "کلینیک و ساعت کار"]], ["pos", "کارتخوان", ["کارتخوان", "پوز"]], ["access", "دسترسی‌ها", ["دسترسی ها", "دسترسی"]],
    ["feedback", "نظرها", ["نظرها", "نظر ها", "بازخورد"]], ["appearance", "ظاهر", ["ظاهر"]],
  ].map(([key, label, words]) => ({ key, label, words: words.map(norm) }));
  const NAV_GO = ["برو", "برو به", "بریم", "باز کن", "بازکن", "واکن", "بیار", "صفحه", "صفحه ی", "بخش", "تب", "منو"];
  const lev1 = (a, b) => {   /* فاصلهٔ ویرایش حداکثر ۱ */
    if (a === b) return true; if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 3) return false;
    let i = 0, j = 0, e = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
    return e + (a.length - i) + (b.length - j) <= 1;
  };
  function parseNav(s0, ctx) {
    if (!has(s0, NAV_GO) || has(s0, ["نوبت"]) && has(s0, [...MOVE, ...CANCEL])) return null;
    let s = s0; for (const w of NAV_GO.map(norm).sort((a, b) => b.length - a.length)) s = s.replace(new RegExp("(?:^| )" + w + "(?= |$)", "g"), " ");
    s = s.replace(/(?:^| )(?:به|رو|را|ی|من|لطفا|میخوام|بده|کن|برم)(?= |$)/g, " ").replace(/\s+/g, " ").trim();
    if (!s) return null;
    if (ctx.self) return { miss: "رفتن به صفحه با دستور فعلاً فقط برای مدیر است" };
    const avail = NAV.filter(n => !ctx.navOn || ctx.navOn(n.key)), toks = s.split(" ");
    const exact = avail.map(n => ({ n, w: n.words.filter(w => new RegExp("(?:^| )" + w + "(?= |$)").test(s)).sort((a, b) => b.length - a.length)[0] })).filter(x => x.w);
    let top = exact.filter(x => !exact.some(y => y !== x && y.w.length > x.w.length && (" " + y.w + " ").includes(" " + x.w + " ")));
    if (!top.length) {   /* نام نزدیک: هر کلمهٔ نام با یک حرف اختلاف */
      top = avail.map(n => ({ n, ok: n.words.some(w => w.split(" ").every(p => toks.some(t => lev1(t, p)))) })).filter(x => x.ok);
    }
    const uniq = [...new Map(top.map(x => [x.n.key, x.n])).values()];
    const item = n => ({ kind: "nav", key: n.key, label: n.label, text: "رفتن به صفحهٔ «" + n.label + "»" });
    if (!uniq.length) return { miss: "صفحه‌ای با این نام پیدا نشد" };
    if (uniq.length > 1) return { kind: "ask", text: "کدام صفحه؟", choices: uniq.slice(0, 8).map(n => ({ label: n.label, item: item(n) })) };
    return item(uniq[0]);
  }

  /* ---------- یک جمله ---------- */
  function parseClause0(raw, ctx) {
    const s0 = norm(raw), { staff, today, appts } = ctx;
    if (!s0 || s0 === "." || s0 === "،") return null;
    const miss = why => ({ miss: raw.trim(), why });
    /* خروجی و جلسه پیش از بقیه: «خروجی نوبت‌ها»، «جلسهٔ دکترها» نباید به نوبت/کارمند برود */
    if (has(s0, EXPORT_WORDS)) { const r = parseExport(s0, ctx); return r.miss !== undefined ? miss(r.miss) : r; }
    { const n = parseNav(s0, ctx); if (n) return n.miss !== undefined ? miss(n.miss) : n; }
    /* پرسش پیش از جلسه/فرمان: «امروز جلسه داریم؟» نه، ولی «چند بیمار امروز» بله؛ جمله‌ای که مبلغ یا ساعت دارد فرمان است */
    if (!has(s0, MEET)) { const q = parseQuery(s0, ctx, raw); if (q) return q.miss !== undefined ? miss(q.miss) : q; }
    if (has(s0, MEET) && !has(s0, ["مرخصی"])) { const r = parseMeeting(s0, ctx, raw); return r.miss !== undefined ? miss(r.miss) : r; }

    /* نوبت */
    if (has(s0, ["نوبت"])) {
      const cancel = has(s0, CANCEL), move = has(s0, MOVE);
      if (cancel || move) {
        if (ctx.self && !["doctor", "reception"].includes(ctx.self.role)) return miss("جابه‌جایی و لغو نوبت فقط برای پزشک (نوبت‌های خودش)، پذیرش و مدیر است");
        const list = Object.values(appts || {}).filter(a => a && a.status === "scheduled" && a.date >= today && (!ctx.self || ctx.self.role === "reception" || a.doctor === ctx.self.id)), toks = new Set(s0.split(" "));
        const cand = list.filter(a => { const nt = norm(a.name).split(" ").filter(w => w.length >= 2); return nt.length && nt.every(w => toks.has(w)); });
        if (!cand.length) return miss("نوبت آیندهٔ این بیمار پیدا نشد");
        if (cand.length > 1) return miss("این بیمار چند نوبت دارد؛ تاریخ یا دکترش را هم بنویس");
        const a = cand[0], label = a.name + " (" + jfa(a.date) + " " + fa(a.time) + ")";
        if (cancel && !move) return { kind: "cancel_appt", id: a.id, text: "لغو نوبت " + label };
        let r = takeDates(s0, today), wd = takeWeekdays(r.s, today), tm = takeTimes(wd.s), un = /(?:^| )یونیت (\d{1,2})(?= |$)/.exec(tm.s);
        const t1 = single(tm.s) || (tm.times[0] || null);
        const date = r.dates[0] ? r.dates[0].iso : wd.days[0] ? wd.dateOf(wd.days[0]) : a.date;
        const time = t1 ? hhmm([t1.h, t1.m]) : a.time, unit = un ? +un[1] : null;
        if (date === a.date && time === a.time && !unit) return miss("تاریخ، ساعت یا یونیت تازه را بنویس");
        if (HR.toMin(time) % 15) return miss("ساعت نوبت باید مضرب ۱۵ دقیقه باشد");
        return { kind: "move_appt", id: a.id, date, time, ...(unit ? { unit } : {}), text: "جابه‌جایی نوبت " + label + " به " + jfa(date) + " ساعت " + fa(time) + (unit ? "، یونیت " + fa(unit) : "") };
      }
    }

    let f = findStaff(s0, staff);
    /* جریمه و تشویق: مدیر ← تأییدشده؛ کسی که ردیف adj.request دارد ← درخواست در انتظار برای همکار */
    if (has(s0, [...FINE, ...BONUS]) && !has(s0, ["نوبت", "مرخصی"])) { const r = parseAdjust(s0, f, ctx, raw); return r.miss !== undefined ? miss(r.why) : r; }
    /* کارمندِ غیرمدیر: فقط برای خودش (اسم نیاید یعنی خودش)؛ دیگران فقط با مدیر */
    if (ctx.self) {
      if (f.p && f.p.id !== ctx.self.id) return miss("برای دیگران فقط مدیر می‌تواند؛ برای خودت بنویس");
      if (f.ambiguous && !f.ambiguous.some(x => x.id === ctx.self.id)) return miss("برای دیگران فقط مدیر می‌تواند؛ برای خودت بنویس");
      if (!f.p) f = { p: staff.find(x => x.id === ctx.self.id) || { id: ctx.self.id, name: "من" } };
    }

    /* حذف کارمند */
    if (has(s0, REMOVE) && !has(s0, ["نوبت"])) {
      if (ctx.self) return miss("حذف کارمند فقط با مدیر است");
      if (f.p) return { kind: "remove_staff", id: f.p.id, name: f.p.name, text: "حذف کامل «" + f.p.name + "» (کارمند، ساعت و مرخصی‌هایش)" };
      if (f.ambiguous) return miss("چند نفر با این نام هستند: " + f.ambiguous.map(x => x.name).join("، ") + " — نام کامل را بنویس");
      return miss("کارمندی با این نام پیدا نشد");
    }

    /* افزودن کارمند */
    if (has(s0, ADD) && !f.p && !f.ambiguous) {
      const role = (ROLES.find(([rx]) => rx.test(s0)) || [])[1];
      if (role && ctx.self) return miss("افزودن کارمند فقط با مدیر است");
      if (role && !roleOn(ctx, role)) return miss("ماژول " + ROLE_MOD[role] + " خاموش است");
      if (role) {
        const stop = new Set(["به", "نام", "اسم", "با", "یک", "یه", "اضافه", "کن", "شد", "کنید", "استخدام", "جدید", "ثبت", "وارد", "دکتر", "دندانپزشک", "دستیار", "منشی", "پذیرش", "مسئول", "بیمه", "لابراتوار", "لاب", "انباردار", "انبار", "دار", "را", "رو", "کلینیک", "به", "ی", ".", "،", "اش", "اسمش", "که"]);
        const nm = s0.split(" ").filter(w => !stop.has(w) && /[؀-ۿ]/.test(w));
        if (nm.length < 1 || nm.length > 3) return miss("اسم کارمند جدید را بنویس (۱ تا ۳ کلمه)");
        const name = (role === "doctor" ? "دکتر " : "") + nm.join(" ");
        return { kind: "add_staff", role, name, text: "افزودن " + ROLE_FA[role] + " جدید: «" + name + "»" };
      }
    }

    /* یونیت‌های مورد نظر یک دکتر: «دکتر نوری فقط روی یونیت ۱ و ۲ کار کند»، «روی همه یونیت‌ها» */
    if (has(s0, ["یونیت", "یونیت ها"]) && !has(s0, ["نوبت"]) && (f.p || f.ambiguous)) {
      if (f.ambiguous) return miss("چند نفر با این نام هستند: " + f.ambiguous.map(x => x.name).join("، ") + " — نام کامل را بنویس");
      if (f.p.role !== "doctor") return miss("یونیت فقط برای دکتر تعیین می‌شود");
      const nums = [...new Set((s0.match(/(?:^| )(\d{1,2})(?= |$)/g) || []).map(x => +x.trim()).filter(n => n >= 1 && n <= 20))].sort((a, b) => a - b);
      const all = has(s0, ["همه"]) && !nums.length;
      if (!nums.length && !all) return miss("شمارهٔ یونیت‌ها را بنویس (مثلاً: روی یونیت ۱ و ۲)");
      return { kind: "units", staffId: f.p.id, name: f.p.name, units: nums, all, text: "یونیت‌های مورد نظر «" + f.p.name + "»: " + (all ? "همهٔ یونیت‌ها" : nums.map(fa).join("، ")) };
    }

    /* ساعت حضور هفتگی یا مرخصی */
    if (f.p || f.ambiguous) {
      if (f.ambiguous) return miss("چند نفر با این نام هستند: " + f.ambiguous.map(x => x.name).join("، ") + " — نام کامل را بنویس");
      const p = f.p;
      let r = takeDates(s0, today), tmA = takeRangesColon(r.s), tmB = takeTimes(tmA.s), wd = takeWeekdays(tmB.s, today);
      const ranges = [...tmA.ranges, ...tmB.ranges], rest = wd.s;
      const hoursWords = has(s0, HOURS) || wd.plural;
      const leaveWords = has(s0, LEAVE) || has(s0, SICK);
      const dayOffWords = has(s0, OFFW);
      /* ساعت هفتگی: روز هفته + بازه (یا تعطیل) و نشانهٔ «همیشگی» */
      if (wd.days.length && !r.dates.length && (ranges.length && (hoursWords || !leaveWords) || (dayOffWords && (has(s0, ["تعطیل"]) || wd.plural)))) {
        const rs = ranges.map(x => ({ s: hhmm(x.a), e: hhmm(x.b) }));
        const v = HR.validateWeekly(Object.fromEntries(wd.days.map(d => [d, rs])));
        if (!v.ok) return miss("ساعت‌ها درست نیست: " + v.errors[0].msg);
        if (!rs.length && !(dayOffWords)) return miss("ساعت را بنویس (مثلاً از ۹ تا ۱۲)");
        const days = wd.days.map(d => ({ day: d, ranges: rs.map(x => ({ ...x })) }));
        const desc = rs.length ? rs.map(x => fa(x.s) + " تا " + fa(x.e)).join(" و ") : "تعطیل";
        return { kind: "hours", staffId: p.id, name: p.name, days, text: "ساعت حضور «" + p.name + "» از امروز، " + wd.days.map(d => DAYFA[d] + "‌ها").join(" و ") + ": " + desc };
      }
      if (leaveWords || r.dates.length || wd.days.length) {
        let from = null, to = null;
        const dts = r.dates.map(d => d.iso), wdd = [];
        for (const d of wd.ordered) { let x = wd.dateOf(d); if (wdd.length && !dts.length) while (x < wdd[0]) x = AC.addDays(x, 7); wdd.push(x); }
        const all = [...dts, ...wdd].sort();
        if (!all.length && /(?:^| )(?:امروز)/.test(s0)) all.push(today);
        const nd = /(?:^| )(\d{1,2}) روز(?= |$)/.exec(rest);
        if (!all.length && !nd) return miss("تاریخ مرخصی را بنویس (فردا، یک روز هفته یا ۲۰ مهر)");
        from = all[0] || today;
        to = /(?:^| )تا(?= )/.test(s0) && all.length >= 2 ? all[all.length - 1] : (nd && !(all.length >= 2) ? AC.addDays(from, +nd[1] - 1) : from);
        const one = ranges[0], tm = one ? { startTime: hhmm(one.a), endTime: hhmm(one.b) } : {};
        if (one && from !== to) return miss("مرخصی ساعتی فقط برای یک روز است");
        if (one && (HR.toMin(tm.startTime) % 15 || HR.toMin(tm.endTime) % 15 || HR.toMin(tm.endTime) <= HR.toMin(tm.startTime))) return miss("ساعت مرخصی نامعتبر است");
        const sick = has(s0, SICK) && !has(s0, ["مرخصی"]) || has(s0, ["استعلاجی"]);
        if (!leaveWords && !one) return miss("منظور «مرخصی» است؟ دوباره با کلمهٔ مرخصی بنویس");
        const span = from === to ? jfa(from) : jfa(from) + " تا " + jfa(to);
        return { kind: "leave", staffId: p.id, name: p.name, from, to, leaveKind: sick ? "sick" : "leave", ...tm, text: (sick ? "مرخصی استعلاجی" : "مرخصی") + " «" + p.name + "» — " + span + (one ? "، " + fa(tm.startTime) + " تا " + fa(tm.endTime) : "") };
      }
      return miss("نفهمیدم با «" + p.name + "» چه کنم");
    }
    return miss("");
  }

  /* نفهمیدیم ولی پرسش‌مانند است (بدون فعل کار و بدون مبلغ): «نوبت‌های فردای دکتر نوری»، «درآمد این ماه»، «جریمه‌های این ماه» */
  function parseClause(raw, ctx) {
    const r = parseClause0(raw, ctx);
    if (!r || r.miss === undefined) return r;
    const s0 = norm(raw);
    if (has(s0, [...MOVE, ...CANCEL, ...REMOVE, ...MEET, ...REASON_MARK]) || has(s0, ADD) && ROLES.some(([rx]) => rx.test(s0)) || takeAmount(s0).amount || /(?:^| )ساعت \d/.test(s0)) return r;
    if (has(s0, LEAVE) && findStaff(s0, ctx.staff || []).p && !has(s0, ASKW)) return r;
    const q = parseQuery(s0, ctx, raw, true);
    return q && q.miss === undefined ? q : r;
  }

  /* جمله‌ها: با نقطه/خط جدید/؛ جدا می‌شوند؛ «و» فقط وقتی دو طرفش هر کدام کارمند و فعل دارد */
  function parse(text, ctx) {
    const items = [], misses = [];
    const intent = s => has(s, [...REMOVE, ...LEAVE, ...HOURS, ...ADD, ...CANCEL, ...MOVE, ...FINE, ...BONUS, "مرخصی", "نوبت"]);
    const sentences = String(text || "").split(/[.\n؛;]+/).map(x => x.trim()).filter(Boolean);
    const clauses = [];
    for (const sen of sentences) {
      const n = norm(sen), parts = n.split(" و ");
      if (parts.length > 1) {
        const cuts = []; let acc = parts[0];
        for (let i = 1; i < parts.length; i++) {
          /* طرف راست تا تکهٔ بعدیِ کارمنددار («سارا احمدی دو میلیون» + «پانصد هزار تشویق…») */
          let k = i + 1; while (k < parts.length && !findStaff(parts[k], ctx.staff).p) k++;
          const L = acc, R = parts[i], Rx = parts.slice(i, k).join(" و ");
          if (findStaff(L, ctx.staff).p && findStaff(R, ctx.staff).p && intent(L) && intent(Rx)) { cuts.push(acc); acc = R; } else acc += " و " + R;
        }
        cuts.push(acc); clauses.push(...cuts.map(c => [c, sen]));
      } else clauses.push([sen, sen]);
    }
    for (const [c, sen] of clauses) {
      const r = parseClause(c, { ...ctx, rawSentence: sen });
      if (!r) continue;
      if (r.miss !== undefined) misses.push({ text: r.miss, why: r.why });
      else { if (ctx.self && (r.kind === "leave" || r.kind === "hours")) { r.request = true; r.text = "درخواست برای مدیر — " + r.text; } items.push(r); }
    }
    return { items, misses };
  }

  root.MC = { parse, MONTHS, EXPORTS, QUERIES, NAV, takePeriod };
  if (typeof module !== "undefined") module.exports = root.MC;
})(typeof globalThis !== "undefined" ? globalThis : this);
