/* Rule-based Persian understanding for the clinic shift app.
   No network, no model: normalisation + phrase dictionaries + small grammar.
   Every function returns the same JSON shapes the app used to get from an LLM,
   plus `misses` (text it could not understand) so the app can log them for the developer. */
(function (root) {
  "use strict";
  const DAYS = ["sat", "sun", "mon", "tue", "wed", "thu"];
  const DAY_FA = { sat: "شنبه", sun: "یکشنبه", mon: "دوشنبه", tue: "سه‌شنبه", wed: "چهارشنبه", thu: "پنج‌شنبه" };
  const SPECS = ["عمومی", "ارتودنسی", "کودکان", "اندو (ریشه)", "جراحی", "پریو (لثه)", "ایمپلنت", "ترمیمی و زیبایی", "پروتز"];

  /* ---------- normalisation ---------- */
  function norm(t) {
    t = String(t || "");
    t = t.replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/ۀ/g, "ه").replace(/ة/g, "ه").replace(/[أإ]/g, "ا").replace(/ؤ/g, "و");
    t = t.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
    t = t.replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    t = t.replace(/[\u200c\u200d]/g, " ").replace(/[\u200e\u200f]/g, "");
    t = t.toLowerCase();
    t = t.replace(/([^\d\s])(\d)/g, "$1 $2").replace(/(\d)([^\d\s])/g, "$1 $2");
    t = t.replace(/[!?؟«»"'()\[\]{}]/g, " ");
    t = t.replace(/\n+/g, " . ");
    t = t.replace(/([،,.؛;:])/g, " $1 ");
    t = t.replace(/\s+/g, " ").trim();
    return t;
  }

  /* ---------- dictionaries (normalised forms) ---------- */
  const P = []; // [phrase, token]
  const add = (list, tok) => list.forEach(p => P.push([norm(p), tok]));
  add(["پنج شنبه", "پنجشنبه", "5 شنبه", "panjshanbe", "panj shanbe", "5shanbe"], { t: "DAY", v: "thu" });
  add(["چهار شنبه", "چهارشنبه", "چارشنبه", "4 شنبه", "chaharshanbe", "charshanbe", "chahar shanbe", "4shanbe"], { t: "DAY", v: "wed" });
  add(["سه شنبه", "سشنبه", "3 شنبه", "seshanbe", "se shanbe", "sishanbe", "3shanbe"], { t: "DAY", v: "tue" });
  add(["دو شنبه", "دوشنبه", "2 شنبه", "doshanbe", "do shanbe", "2shanbe"], { t: "DAY", v: "mon" });
  add(["یک شنبه", "یکشنبه", "یه شنبه", "1 شنبه", "yekshanbe", "yek shanbe", "1shanbe"], { t: "DAY", v: "sun" });
  add(["شنبه", "shanbe", "shanbeh"], { t: "DAY", v: "sat" });
  add(["همه روزها", "همه روزا", "همه ی روزها", "همه ی روزا", "همه روز", "هر روز", "هرروز", "کل هفته", "تمام هفته", "تمام روزها", "تمام روزا", "همه هفته", "کل روزها", "کل روزا", "کل روزهای هفته", "همه روزهای هفته", "همه ی هفته"], { t: "DAYSET", v: DAYS });
  add(["روزهای زوج", "روزای زوج", "زوج ها", "زوجا", "زوج"], { t: "DAYSET", v: ["sat", "mon", "wed"] });
  add(["روزهای فرد", "روزای فرد", "فرد ها", "فردا روزها", "فرد"], { t: "DAYSET", v: ["sun", "tue", "thu"] });
  add(["آخر هفته", "اخر هفته", "آخرهفته"], { t: "DAYSET", v: ["thu"] });
  add(["اول هفته", "اوایل هفته"], { t: "DAYSET", v: ["sat", "sun"] });
  add(["وسط هفته", "اواسط هفته"], { t: "DAYSET", v: ["mon", "tue"] });
  add(["صبح و عصر", "صبح تا عصر", "صبح تا شب", "هر دو شیفت", "هردو شیفت", "دو شیفت", "هر دو", "هردو", "تمام وقت", "فول تایم", "کل روز", "تمام روز", "صبح و بعد از ظهر", "صبح و بعدازظهر"], { t: "SHIFT", v: "b" });
  add(["قبل از ظهر", "قبل ظهر", "قبلازظهر", "پیش از ظهر", "صبح ها", "صبحها", "صبحا", "صبح", "شیفت اول", "شیفت صبح", "sobh", "sobhha"], { t: "SHIFT", v: "m" });
  add(["بعد از ظهر", "بعدازظهر", "بعد ظهر", "ظهر به بعد", "عصر ها", "عصرها", "عصرا", "عصر", "شب ها", "شبها", "شبا", "شب", "شیفت دوم", "شیفت عصر", "asr", "asor"], { t: "SHIFT", v: "e" });
  add(["به جز", "بجز", "به غیر از", "غیر از", "غیراز", "به استثنای", "به استثنا", "الا", "منهای", "جز"], { t: "EXCEPT" });
  add(["فقط", "تنها", "صرفا"], { t: "ONLY" });
  add(["مطمئن نیستم", "مطمئن نیستیم", "معلوم نیست", "هنوز نمیدونم", "نمیدونم", "نمی دونم", "نمی دانم", "فکر کنم", "فکر میکنم", "فکر می کنم", "شاید", "احتمالا", "احتمالاً", "ممکنه", "ممکن است", "اگه", "اگر"], { t: "UNSURE" });
  add(["از این به بعد", "از الان به بعد", "از حالا به بعد", "از این هفته به بعد", "از هفته بعد", "از هفته آینده", "تا اطلاع ثانوی", "همیشه", "دائم", "دائما", "هر هفته", "هیچ وقت", "هیچوقت", "دیگه هیچ وقت"], { t: "STANDING" });
  add(["این هفته", "همین هفته", "فعلا", "فعلاً", "موقتا", "موقتاً", "in hafte", "hamin hafte"], { t: "THISWEEK" });
  add(["امروز", "emrooz", "emruz", "emrouz"], { t: "THISWEEK", v: "today" });
  add(["فردا", "farda"], { t: "THISWEEK", v: "tomorrow" });
  add(["نمیتونم بیام", "نمی تونم بیام", "نمی توانم بیایم", "نمیتوانم بیایم", "نمیتونم", "نمی تونم", "نمی توانم", "نمیتوانم", "نمیام", "نمی آیم", "نمی ایم", "نمیایم", "نمیرسم", "نمی رسم", "نمیشه", "نمی شه", "نمی شود", "نیستم", "نیستیم", "نیستش", "مرخصی ام", "مرخصیم", "مرخصی", "غایبم", "غایب", "تعطیلم", "نخواهم آمد", "کار نمیکنم", "کار نمی کنم", "آف", "off", "نه", "خیر", "نمیاد", "نمیاید", "نمی آید", "نمی اید", "نیست", "نباشد", "نباشه", "نباشن", "نباشند", "نمیتونه", "نمی تونه", "نمی تواند", "شیفت نگیرد", "شیفت نگیره", "شیفت نداشته باشد", "شیفت نداشته باشه", "کار نمیکنه", "کار نمی کند", "nistam", "nemiam", "nemiyam", "nemitunam", "nemitoonam", "nemiad", "nist", "ندارم", "نداره", "ندارد", "ندارند", "نداریم"], { t: "NEG" });
  add(["میتونم بیام", "می تونم بیام", "می توانم بیایم", "میتونم", "می تونم", "می توانم", "میتوانم", "میام", "می آیم", "میایم", "می ایم", "هستم", "هستیم", "هستش", "حاضرم", "میرسم", "می رسم", "کار میکنم", "کار می کنم", "در دسترسم", "آزادم", "اوکیم", "اوکی", "ok", "هست", "میاد", "میاید", "می آید", "باشد", "باشه", "باشن", "باشند", "بیاد", "بیاید", "hastam", "miam", "miyam", "hazeram", "hazer", "miad", "hast"], { t: "POS" });
  add(["ترجیحا", "ترجیحاً", "ترجیح میدم", "ترجیح می دهم", "ترجیح می دهد", "ترجیح میده", "ترجیح", "بهتره", "بهتر است", "اگه بشه", "اگر بشود"], { t: "PREF" });
  add(["یونیت شماره", "یونیت های", "یونیتهای", "یونیتای", "یونیت ها", "یونیتا", "یونیت", "صندلی", "یونیتِ"], { t: "UNIT" });
  add(["دندانپزشک", "دندان پزشک", "پزشک", "دکتر ها", "دکترها", "دکتر", "doctor", "doktor"], { t: "ROLE", v: "doctor" });
  add(["دستیار ها", "دستیارها", "دستیارهای", "دستیاران", "دستیار", "دستیارش", "دستیارم", "دستیارای", "اسیستنت", "dastyar", "dastiar"], { t: "ROLE", v: "assistant" });
  add(["منشی ها", "منشیها", "منشی", "پذیرش", "رسپشن", "monshi"], { t: "ROLE", v: "reception" });
  add(["ارتودنسی", "ارتودنتیست", "ارتو"], { t: "SPEC", v: "ارتودنسی" });
  add(["کودکان", "اطفال", "کودک", "بچه ها"], { t: "SPEC", v: "کودکان" });
  add(["اندو", "اندودنتیست", "ریشه", "عصب کشی"], { t: "SPEC", v: "اندو (ریشه)" });
  add(["جراحی", "جراح"], { t: "SPEC", v: "جراحی" });
  add(["پریو", "لثه", "پریودنتیست"], { t: "SPEC", v: "پریو (لثه)" });
  add(["ایمپلنت"], { t: "SPEC", v: "ایمپلنت" });
  add(["ترمیمی", "زیبایی", "کامپوزیت", "لمینت"], { t: "SPEC", v: "ترمیمی و زیبایی" });
  add(["پروتز"], { t: "SPEC", v: "پروتز" });
  add(["عمومی", "جنرال"], { t: "SPEC", v: "عمومی" });
  add(["اخراج شد", "اخراج شده", "اخراج", "استعفا داد", "استعفا", "جدا شد", "جدا شده", "ترک کرد", "قطع همکاری", "تسویه کرد", "تسویه", "بازنشسته", "از سیستم حذف", "از فهرست حذف", "دیگه با ما نیست", "دیگر با ما نیست", "دیگه با ما کار نمیکنه", "رفت", "رفته"], { t: "KW", v: "LEAVE" });
  add(["دیگه", "دیگر"], { t: "KW", v: "ANYMORE" });
  add(["جدید", "تازه وارد", "تازه اومده", "تازه آمده", "استخدام شد", "استخدام کردیم", "استخدام", "به ما پیوست", "اضافه شده", "اضافه شد", "عضو جدید"], { t: "KW", v: "NEW" });
  add(["با هم نباشند", "با هم نباشن", "باهم نباشند", "باهم نباشن", "با هم نباشه", "با هم نباشد", "با هم نه", "هم شیفت نباشند", "هم شیفت نباشن", "همشیفت نباشن", "هم شیفت نشوند", "هم شیفت نشن", "جدا باشند", "جدا باشن", "با هم کار نکنند", "با هم کار نکنن", "نباید با هم", "نمیتونن با هم", "نمی توانند با هم", "کنار هم نباشن", "با هم نیفتند", "با هم نیفتن", "با هم نیوفتن", "تو یه شیفت نباشن", "در یک شیفت نباشند", "توی یه شیفت نباشن"], { t: "KW", v: "APART" });
  add(["حداکثر", "ماکزیمم", "نهایتا", "نهایتاً", "بیشتر از", "بیشتر نه", "سقف"], { t: "KW", v: "MAX" });
  add(["حداقل", "دست کم", "لااقل", "حتما", "حتماً", "باید", "لازم است", "لازمه", "لازم"], { t: "KW", v: "MIN" });
  add(["دندان", "دندون", "دندانِ", "دندونه"], { t: "KW", v: "TOOTH" });
  add(["بالا", "فک بالا", "دندان‌های بالا", "دندانهای بالا"], { t: "ARCH", v: "upper" });
  add(["پایین", "فک پایین", "دندان‌های پایین", "دندانهای پایین"], { t: "ARCH", v: "lower" });
  add(["کردم", "کردیم", "انجام شد", "انجام دادم", "تمام شد", "انجامش دادم", "انجام گرفت", "تموم شد", "شد"], { t: "KW", v: "DONE" });
  add(["آلرژی", "حساسیت دارویی", "حساسیت"], { t: "KW", v: "ALLERGY" });
  add(["نوبت", "نوبتش", "نوبت بعدی", "وقت بعدی"], { t: "KW", v: "APPT" });
  add(["درمان ریشه", "روت کانال"], { t: "TX", v: "root_canal", label: "عصب‌کشی" });
  add(["جرمگیری", "جرم‌گیری", "جرم گیری"], { t: "TX", v: "scaling", label: "جرمگیری" });
  add(["کشیدن دندان", "کشیدن", "خارج کردن دندان", "کشیده بشه", "کشیده شود"], { t: "TX", v: "extraction", label: "کشیدن دندان" });
  add(["روکش", "کراون"], { t: "TX", v: "crown", label: "روکش" });
  add(["پر کردن", "پرکردن", "ترمیم", "پر شد"], { t: "TX", v: "filling", label: "پرکردن" });
  add(["بلیچینگ", "سفید کردن دندان"], { t: "TX", v: "whitening", label: "بلیچینگ" });
  add(["معاینه", "چکاپ", "بررسی کلی دهان", "ویزیت"], { t: "TX", v: "checkup", label: "معاینه" });
  add(["بذار", "بگذار", "بزار", "قرار بده", "بیار", "بیاور", "شیفت بده", "بفرست", "اضافه کن", "اضافش کن", "اضافه اش کن"], { t: "KW", v: "PLACE" });
  add(["برش دار", "بردار", "حذف کن", "حذفش کن", "حذف", "کنسل کن", "کنسل", "خط بزن"], { t: "KW", v: "REMOVE" });
  add(["ببر", "ببرش", "بره", "برود", "منتقل کن", "منتقل", "جابجا کن", "جابجا", "جا به جا", "عوض کن"], { t: "KW", v: "MOVE" });
  add(["جای", "جاش", "به جای", "بجای"], { t: "KW", v: "INSTEAD" });
  add(["داریم", "تعداد"], { t: "KW", v: "COUNT" });
  add(["استفاده شد", "مصرف شد", "استفاده کردم", "مصرف کردم", "استفاده کردیم", "مصرف کردیم", "استفاده شده"], { t: "KW", v: "USED" });
  add(["چند", "چن", "چقدر", "چقد", "chand", "chan", "cheghadr"], { t: "KW", v: "HOWMANY" });
  add(["هم"], { t: "KW", v: "ALSO" });
  add(["یا"], { t: "KW", v: "OR" });
  add(["ولی", "اما", "ولیکن", "همچنین", "بعدش", "سپس"], { t: "SEP" });

  const NUMW = { "یک": 1, "یه": 1, "دو": 2, "سه": 3, "چهار": 4, "چار": 4, "پنج": 5, "شش": 6, "شیش": 6, "هفت": 7, "هشت": 8, "ده": 10 };
  const FILLER = new Set(["من", "ما", "هم", "رو", "را", "و", "که", "بیام", "بیایم", "کار", "شیفت", "شیفتا", "شیفت ها", "روز", "روزها", "روزا", "روزای", "روزهای", "هفته", "بعد", "آینده", "اینده", "ها", "های", "در", "به", "از", "تا", "لطفا", "لطفاً", "ممنون", "مرسی", "سلام", "دارم", "هستن", "ساعت", "کلینیک", "مطب", "اونجا", "اینجا", "برای", "واسه", "میشه", "بشه", "توی", "تو", "با", "اون", "این", "خب", "خوب", "میخوام", "می خواهم", "کنم", "کنید", "بکنید", "بی زحمت", "لطف", "کنین", "شه", "بشن", "هر", "همه", "ی", "رو هم", "مثل", "قبل", "طبق", "معمول", "همون", "همان", "حتی", "بیشتر", "کمتر", "خودم", "وقت", "زمان", "دیگه", "دیگر", ".", "،", ",", "؛", ";", ":"]);

  let lexCache = null, lexKey = "";
  function lexicon(staff) {
    const key = JSON.stringify((staff || []).map(s => [s.id, s.name]));
    if (lexCache && key === lexKey) return lexCache;
    const map = new Map();
    const put = (form, id) => { form = norm(form); if (!form || form.length < 2) return; if (!map.has(form)) map.set(form, new Set()); map.get(form).add(id); };
    for (const s of staff || []) {
      const n = norm(s.name);
      put(n, s.id);
      const parts = n.split(" ");
      if (parts[0] === "دکتر" && parts.length > 1) {
        const rest = parts.slice(1).join(" ");
        put(rest, s.id); put("دکتر " + rest, s.id); put("آقای دکتر " + rest, s.id); put("خانم دکتر " + rest, s.id);
      } else {
        put("خانم " + n, s.id); put("آقای " + n, s.id); put("اقای " + n, s.id);
        if (parts.length > 1) put(parts[0], s.id);
      }
    }
    lexCache = map; lexKey = key;
    return map;
  }

  /* ---------- tokenizer ---------- */
  const SUFFIX = "(?:ها|های|هارو|هارا|رو|را|و|ه|ی|یه|ا)?";
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function tokenize(text, staff) {
    let t = " " + norm(text) + " ";
    const table = [];
    const phrases = P.map(([p, tok]) => [p, tok]);
    const lex = lexicon(staff);
    for (const [form, ids] of lex) phrases.push([form, ids.size === 1 ? { t: "PERSON", v: [...ids][0] } : { t: "AMBIG", v: [...ids], s: form }]);
    phrases.sort((a, b) => b[0].length - a[0].length);
    for (const [p, tok] of phrases) {
      const personish = tok.t === "PERSON" || tok.t === "AMBIG";
      const re = new RegExp("(\\s)" + esc(p) + (tok.t === "DAY" || personish ? SUFFIX : "") + "(?=\\s)", "g");
      t = t.replace(re, (m, sp) => {
        const plural = tok.t === "DAY" && /ها|های/.test(m.slice(1 + p.length));
        table.push({ ...tok, s: p, plural });
        return sp + "\u0001" + (table.length - 1) + "\u0001";
      });
    }
    const out = [];
    for (const w of t.trim().split(/\s+/)) {
      if (!w) continue;
      const m = w.match(/^\u0001(\d+)\u0001$/);
      if (m) out.push(table[+m[1]]);
      else if (/^[،,.؛;:]$/.test(w)) out.push({ t: "SEP", s: w });
      else if (/^\d+$/.test(w)) out.push({ t: "NUM", v: +w, s: w });
      else out.push({ t: "WORD", s: w });
    }
    // "سه‌شنبه‌ها" → day + plural marker
    for (let i = 0; i < out.length - 1; i++) if (out[i].t === "DAY" && out[i + 1].t === "WORD" && /^(ها|های|هارو|هارا)$/.test(out[i + 1].s)) { out[i] = { ...out[i], plural: true }; out.splice(i + 1, 1); }
    // day ranges: "شنبه تا چهارشنبه"
    for (let i = 0; i < out.length - 2; i++) if (out[i].t === "DAY" && out[i + 1].t === "WORD" && out[i + 1].s === "تا" && out[i + 2].t === "DAY") {
      const a = DAYS.indexOf(out[i].v), b = DAYS.indexOf(out[i + 2].v);
      if (a <= b) out.splice(i, 3, { t: "DAYSET", v: DAYS.slice(a, b + 1), s: "range" });
    }
    // number words only near units / counts
    for (let i = 0; i < out.length; i++) {
      const tk = out[i];
      if (tk.t === "WORD" && NUMW[tk.s] != null) {
        const prev = out[i - 1], next = out[i + 1];
        if ((prev && prev.t === "UNIT") || (next && (next.t === "UNIT" || /^(تا|شیفت|نفر|منشی)$/.test(next.s || "") || next.t === "ROLE")) || (prev && prev.t === "NUM") || (prev && prev.s === "و" && out[i - 2] && out[i - 2].t === "NUM"))
          out[i] = { t: "NUM", v: NUMW[tk.s], s: tk.s };
      }
    }
    return out;
  }
  function clauses(text, staff) {
    const toks = tokenize(text, staff), res = [];
    let cur = [];
    for (const tk of toks) { if (tk.t === "SEP") { if (cur.length) res.push(cur); cur = []; } else cur.push(tk); }
    if (cur.length) res.push(cur);
    return res;
  }
  const surface = cl => cl.map(t => t.t === "PERSON" ? t.s : t.s || "").join(" ").trim();
  const has = (cl, t, v) => cl.some(x => x.t === t && (v === undefined || x.v === v));
  const meaningfulWords = cl => cl.filter(x => x.t === "WORD" && !FILLER.has(x.s));



  /* ---------- helpers for requests & manager commands ---------- */
  const people = (cl, staff, role) => { const ids = []; for (const x of cl) if (x.t === "PERSON" && (!role || staff.find(s => s.id === x.v)?.role === role) && !ids.includes(x.v)) ids.push(x.v); return ids; };
  const ambig = (cl, staff) => cl.filter(x => x.t === "AMBIG").map(x => `منظور از «${x.s}» مشخص نیست (${x.v.map(id => staff.find(s => s.id === id)?.name || id).join(" یا ")}). اسم کامل را بنویسید.`);
  const nums = cl => cl.filter(x => x.t === "NUM").map(x => x.v);
  const unitNums = cl => { const out = []; let after = false; for (const x of cl) { if (x.t === "UNIT") { after = true; continue; } if (after && x.t === "NUM") out.push(x.v); else if (after && !(x.t === "WORD" && ["و", "یا", "هم", "شماره"].includes(x.s)) && x.t !== "KW" && x.t !== "ONLY" && x.t !== "PREF") after = false; } if (!out.length) { const i = cl.findIndex(x => x.t === "UNIT"); if (i > 0 && cl[i - 1].t === "NUM") out.push(cl[i - 1].v); } return [...new Set(out)]; };
  const hasDay = cl => cl.some(x => x.t === "DAY" || (x.t === "DAYSET" && x.v.length < 6));
  const pluralDay = cl => cl.some(x => x.t === "DAY" && x.plural);
  const specOf = cl => cl.find(x => x.t === "SPEC")?.v || null;

  /* نفیِ «با X کار نکنم / نمی‌خوام با X کار کنم / نباشه»: واژه‌نامهٔ NEG فقط بعضی شکل‌ها را می‌شناسد، و بدون این بررسی جملهٔ منفی
     عیناً مثل مثبت (افزودن دستیار) خوانده می‌شد. شکایت بی‌تکلیف («مشکل دارم») حدس زده نمی‌شود، پرسیده می‌شود. */
  const NEGP_RE = /(نمی ?خوا(?:م|هم|ه|د|یم|ن|ند)|نخوا(?:م|هم|ه|د)|کار ?نکن|کار ?نمی ?کن|نمی ?کن(?:م|ه|د|یم|ن|ند)|نباش(?:ه|م|د|ن|یم|ند)|دیگه ?نه|دیگر ?نه)/;
  const COMPLAIN_RE = /(مشکل ?دارم|مشکل ?داره|ناراضی|راضی ?نیستم|راضی ?نیست|اذیت|بدم ?میاد|بدم ?می ?آد)/;
  const negIntent = raw => NEGP_RE.test(norm(raw));
  const complaint = raw => COMPLAIN_RE.test(norm(raw)) && !NEGP_RE.test(norm(raw));




  /* ---------- 4. patient treatment notes (per-tooth / per-arch plan items) ---------- */
  const SPEC_TX = { "اندو (ریشه)": ["root_canal", "عصب‌کشی"], "ترمیمی و زیبایی": ["composite", "کامپوزیت"], "ایمپلنت": ["implant", "ایمپلنت"], "پروتز": ["denture", "پروتز"], "ارتودنسی": ["ortho", "ارتودنسی"] };
  function patientNote(text) {
    const actions = [], rejected = [], misses = [];
    for (const cl of clauses(text, [])) {
      const raw = surface(cl);
      const kw = v => has(cl, "KW", v);
      if (kw("ALLERGY")) {
        actions.push({ op: "set_allergy", value: has(cl, "NEG") ? "ندارد" : raw, negative: has(cl, "NEG") });
        continue;
      }
      let tooth = (() => {
        let after = false;
        for (const x of cl) {
          if (x.t === "KW" && x.v === "TOOTH") { after = true; continue; }
          if (after && x.t === "NUM") return String(x.v);
          if (after && !(x.t === "WORD" && ["و", "یا", "شماره"].includes(x.s))) after = false;
        }
        return null;
      })();
      const arches = [...new Set(cl.filter(x => x.t === "ARCH").map(x => x.v))];
      const txList = [];
      for (const x of cl) {
        if (x.t === "TX" && !txList.some(t => t.v === x.v)) txList.push({ v: x.v, label: x.label });
        else if (x.t === "SPEC" && SPEC_TX[x.v] && !txList.some(t => t.v === SPEC_TX[x.v][0])) txList.push({ v: SPEC_TX[x.v][0], label: SPEC_TX[x.v][1] });
      }
      // "۴ پر شد" (no "دندان" word): if a treatment was recognized and a bare number
      // is sitting right there, treat it as the tooth number instead of dropping it.
      if (!tooth && txList.length) { const n = cl.find(x => x.t === "NUM"); if (n) tooth = String(n.v); }
      if (!txList.length && !tooth && !arches.length) {
        if (kw("APPT")) rejected.push(`نوبت از اینجا ثبت نمی‌شود: «${raw}». برای ثبت نوبت به تب «نوبت‌ها» بروید.`);
        else if (meaningfulWords(cl).length) misses.push(raw);
        continue;
      }
      const arch = arches.length === 2 ? null : (arches[0] || null);
      const impliedDone = cl.some(x => x.t === "TX" && /شد$/.test(x.s || ""));
      const op = kw("REMOVE") ? "remove_plan" : "upsert_plan", status = (kw("DONE") || impliedDone) ? "done" : "pending";
      if (!txList.length) actions.push({ op, tooth: tooth || null, arch, tx: null, label: null, text: raw, status });
      else for (const t of txList) actions.push({ op, tooth: tooth || null, arch, tx: t.v, label: t.label, text: raw, status });
    }
    for (const m of misses) rejected.push(`این بخش را نفهمیدم: «${m}»`);
    return { actions, rejected, misses };
  }

  /* ---------- 5. inventory usage mentioned inside a note (e.g. "۳ واحد آمالگام استفاده شد") ---------- */
  function inventoryUsage(text, items) {
    const actions = [], rejected = [];
    for (const cl of clauses(text, items || [])) {
      if (!has(cl, "KW", "USED")) continue;
      const amb = ambig(cl, items || []); if (amb.length) { rejected.push(...amb); continue; }
      const itemIdx = cl.findIndex(x => x.t === "PERSON");
      if (itemIdx < 0) continue;
      const itemId = cl[itemIdx].v;
      const nums = cl.map((x, i) => ({ x, i })).filter(o => o.x.t === "NUM");
      const qty = nums.length ? nums.sort((a, b) => Math.abs(a.i - itemIdx) - Math.abs(b.i - itemIdx))[0].x.v : 1;
      actions.push({ op: "consume", item: itemId, qty });
    }
    return { actions, rejected };
  }

  root.NLU = { norm, tokenize, clauses, patientNote, inventoryUsage, SPECS };
})(typeof window !== "undefined" ? window : globalThis);
