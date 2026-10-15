/* دستور صوتی (ماژول voice): منطق خالص — عددهای گفته‌شده به رقم، و دروازهٔ صدا/پایان خودکار با سکوت. تشخیص گفتار با Vosk روی خود گوشی (voiceui.js). */
(function (root) {
  const ONES = { صفر: 0, یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14,
    پانزده: 15, پونزده: 15, شانزده: 16, شونزده: 16, هفده: 17, هجده: 18, هیجده: 18, نوزده: 19, بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60,
    هفتاد: 70, هشتاد: 80, نود: 90, صد: 100, یکصد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500, ششصد: 600, هفتصد: 700, هشتصد: 800, نهصد: 900 };
  /* «یک»، «نه»، «سی» کلمهٔ معمولی هم هستند: فقط پیش از واحد/عدد دیگر عدد حساب می‌شوند */
  const AMBIG = new Set(["یک", "نه", "سی"]), UNIT = /^(ساعت|روز|هفته|ماه|سال|میلیون|هزار|نفر|تا|دقیقه|و)$/;
  function words2num(t) {
    const w = String(t || "").trim().split(/\s+/).filter(Boolean), out = [];
    for (let i = 0; i < w.length; i++) {
      if (ONES[w[i]] == null || AMBIG.has(w[i]) && ONES[w[i + 1]] == null && !UNIT.test(w[i + 1] || "")) { out.push(w[i]); continue; }
      let n = ONES[w[i]];
      while (w[i + 1] === "و" && ONES[w[i + 2]] != null && ONES[w[i + 2]] < n) { n += ONES[w[i + 2]]; i += 2; }
      out.push(String(n));
    }
    return out.join(" ");
  }
  /* یک تکهٔ صدا (rms) با طول fr ثانیه: کف نویز از ۶ تکهٔ اول؛ «بلند» = بیش از ۲ برابر کف یا ۱۵٪ اوج گوینده؛ ۰٫۷ ثانیه باز می‌ماند.
     خروجی { open, loud, stop }؛ stop وقتی بعد از ۰٫۳ ثانیه حرف، quietSec سکوت شد یا maxSec گذشت */
  function newGate() { return { floor: 0, n: 0, peak: 0, open: 0, spoke: 0, quiet: 0, t: 0 }; }
  function gateStep(G, rms, fr, o) {
    o = o || {}; G.t += fr;
    if (G.n < 6) { G.floor = (G.floor * G.n + rms) / (G.n + 1); G.n++; }
    else if (rms < G.floor) G.floor = G.floor * 0.95 + rms * 0.05;
    const loud = rms > Math.max(G.floor * 2, G.peak * 0.15, 0.003);
    if (loud) { G.peak = Math.max(G.peak * 0.997, rms); G.open = 0.7; G.spoke += fr; G.quiet = 0; } else { G.open -= fr; if (G.spoke > 0.3) G.quiet += fr; }
    return { open: G.n < 6 || G.open > 0, loud, stop: G.quiet > (o.quietSec || 1.5) || G.t > (o.maxSec || 15) };
  }
  root.VC = { words2num, newGate, gateStep };
  if (typeof module !== "undefined") module.exports = root.VC;
})(typeof globalThis !== "undefined" ? globalThis : this);
