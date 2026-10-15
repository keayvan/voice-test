/* صفحهٔ جدای آزمایش دستور صوتی (voicetest.html؛ بدون ورود): همان موتور (vendor/vosk)، همان voice.js و mgrcmd.js اپ، با کارکنان نمونه.
   برای مقایسهٔ گوشی‌ها: زمان دانلود و باز کردن مدل و زمان هر جمله ثبت می‌شود و «کپی گزارش» همه را یک‌جا می‌دهد. چیزی ذخیره یا فرستاده نمی‌شود.
   نسخهٔ گیت‌هاب با scripts/voice-test-sync.sh از همین فایل‌ها ساخته می‌شود. */
(function () {
  const $ = s => document.querySelector(s), fa = s => String(s).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MODEL = "vendor/vosk/model-fa.tar.gz", CACHE = "keep-vosk-fa-1";
  const STAFF = [{ id: "d1", name: "دکتر ندا اکبری", role: "doctor" }, { id: "s1", name: "الهام اکبری", role: "assistant" }, { id: "r1", name: "آزاده اکبری", role: "reception" },
    { id: "s2", name: "علی رضایی", role: "assistant" }, { id: "r2", name: "مریم رضایی", role: "reception" }, { id: "d2", name: "دکتر نوری", role: "doctor" }];
  const SAMPLES = ["علی رضایی پانصد هزار جریمه به خاطر تاخیر", "اکبری فردا مرخصی است", "ساعت پانزده جلسه", "تعداد بیماران امروز",
    "دکتر نوری شنبه ها از نه تا دوازده کار کند", "برو به صفحه بیمه", "درآمد این ماه"];
  const R = { device: navigator.userAgent, cached: null, downloadSec: null, openSec: null, turns: [] };
  let model = null, ctx = null, rec = null, stream = null, src = null, node = null, st = "idle", text = "", results = 0, t0 = 0, pend = null, ask = null;
  const today = () => AC.isoOf(new Date());
  const P = t => MC.parse(t, { staff: STAFF, today: today(), appts: {} });
  const mode = () => { try { return localStorage.getItem("vtMode") || "voice"; } catch (e) { return "voice"; } };
  function setMode(m) { try { localStorage.setItem("vtMode", m); } catch (e) {} document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    $("#voiceBox").hidden = m !== "voice"; $("#textBox").hidden = m !== "text"; }
  const log = (cls, html) => { $("#log").insertAdjacentHTML("beforeend", `<li class="${cls}">${html}</li>`); };
  function dev() {
    const row = (k, v) => `<tr><td>${k}</td><td>${v == null ? "—" : esc(v)}</td></tr>`;
    const ms = R.turns.filter(x => x.sec != null).map(x => x.sec), avg = ms.length ? (ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1) : null;
    $("#dev").innerHTML = row("گوشی و مرورگر", R.device.replace(/^Mozilla\/5\.0 /, "").slice(0, 140)) + row("مدل از قبل روی گوشی", R.cached == null ? null : R.cached ? "بله" : "نه (دانلود شد)")
      + row("دانلود مدل", R.downloadSec == null ? null : fa(R.downloadSec) + " ثانیه") + row("باز کردن مدل", R.openSec == null ? null : fa(R.openSec) + " ثانیه")
      + row("جمله‌ها", fa(R.turns.length) + " (فهمید: " + fa(R.turns.filter(x => x.ok).length) + ")") + row("میانگین تشخیص بعد از سکوت", avg == null ? null : fa(avg) + " ثانیه");
  }
  /* یک نوبت: جواب سؤال باز، ادامهٔ جملهٔ ناقص قبلی، یا دستور تازه — همان منطق حالت گفتاری اپ */
  function turn(heard, sec, voice) {
    const T = { heard, sec, ok: false, said: "" };
    if (ask) { const c = MC.answer(ask, heard); if (c >= 0) { const it = ask.choices[c].item; ask = null; pend = null; T.ok = true; T.said = it.text; log("ok", "✓ " + esc(it.text)); return done(T); } }
    let r = null;
    if (pend) { const r2 = P(pend + " " + heard); if (r2.items.length && !r2.misses.length) r = r2; }
    if (!r) r = P(heard);
    for (const it of r.items) {
      if (it.kind === "ask") { ask = it; log("", `<strong>❓ ${esc(it.text)}</strong><br>${it.choices.map((c, j) => `<button class="btn" data-pick="${j}">${esc(c.label)}</button>`).join("")}`); T.said = "سؤال: " + it.text; }
      else { log("ok", "✓ " + esc(it.text)); T.ok = true; T.said = it.text; }
    }
    if (r.items.length) pend = null;
    const m = r.misses[0];
    if (m && !r.items.length) {
      if (m.why) { pend = (pend ? pend + " " : "") + heard; log("", `<strong>❓ ${esc(m.why.replace(/بنویس/g, "بگو"))}</strong>`); T.said = "سؤال: " + m.why; }
      else { pend = null; log("bad", "✗ نفهمیدم؛ دوباره بگو"); }
    }
    return done(T);
    function done(T) { if (voice) $("#log").lastElementChild.insertAdjacentHTML("beforeend", `<div class="note">شنیده: «${esc(heard)}»${sec != null ? " · " + fa(sec.toFixed(1)) + " ثانیه" : ""}</div>`);
      R.turns.push(T); dev(); }
  }
  async function modelBlob() {
    let cache = null; try { cache = await caches.open(CACHE); const hit = await cache.match(MODEL); if (hit) { R.cached = true; return await hit.blob(); } } catch (e) {}
    R.cached = false; const t1 = Date.now(), res = await fetch(MODEL); if (!res.ok) throw new Error("مدل دانلود نشد (" + res.status + ")");
    const total = +res.headers.get("content-length") || 53e6, rd = res.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length;
      $("#prog").style.width = Math.min(99, Math.round(got * 100 / total)) + "%"; $("#hint").textContent = "دانلود مدل: " + fa(Math.round(got / 1048576)) + " از " + fa(Math.round(total / 1048576)) + " مگابایت"; }
    R.downloadSec = Math.round((Date.now() - t1) / 100) / 10;
    const blob = new Blob(parts, { type: "application/gzip" }); try { if (cache) await cache.put(MODEL, new Response(blob)); } catch (e) {}
    return blob;
  }
  async function load() {
    try {
      if (!window.Vosk) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "vendor/vosk/vosk.js?v=2"; s.onload = res; s.onerror = () => rej(new Error("موتور بار نشد")); document.head.appendChild(s); });
      const url = URL.createObjectURL(await modelBlob()), t1 = Date.now(); $("#prog").style.width = "100%";
      const tick = setInterval(() => { $("#hint").textContent = "باز کردن مدل در حافظهٔ گوشی… " + fa(Math.round((Date.now() - t1) / 1000)) + " ثانیه"; }, 500);
      model = await new Promise((res, rej) => { const m = new Vosk.Model(url); m.on("load", e => (e.result ? res(m) : rej(new Error("مدل باز نشد")))); m.on("error", e => rej(new Error(e.error || "خطای موتور"))); });
      clearInterval(tick); R.openSec = Math.round((Date.now() - t1) / 100) / 10;
      $("#hint").textContent = "آماده است ✓ — بزن و بگو؛ با سکوت خودش تمام می‌کند"; $("#mic").disabled = false;
    } catch (e) { $("#hint").innerHTML = `<span class="bad">${esc(e.message || e)}</span>`; R.error = String(e.message || e); }
    dev();
  }
  async function start() {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }); }
    catch (e) { $("#hint").innerHTML = `<span class="bad">اجازهٔ میکروفون داده نشد</span>`; return; }
    if (!ctx || ctx.state === "closed") ctx = new (window.AudioContext || window.webkitAudioContext)();   /* یک AudioContext برای همهٔ بارها */
    try { await ctx.resume(); } catch (e) {}
    try { if (rec) rec.remove(); } catch (e) {}
    rec = new model.KaldiRecognizer(ctx.sampleRate); text = ""; results = 0;
    rec.on("result", m => { results++; const x = (m.result.text || "").trim(); if (x) text += (text ? " " : "") + x; });
    src = ctx.createMediaStreamSource(stream); node = ctx.createScriptProcessor(4096, 1, 1);
    const G = VC.newGate(), fr = 4096 / ctx.sampleRate;
    node.onaudioprocess = e => {
      if (st !== "rec") return;
      const d = e.inputBuffer.getChannelData(0); let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      const g = VC.gateStep(G, Math.sqrt(s / d.length), fr);
      try { rec.acceptWaveform(e.inputBuffer); } catch (x) {}
      if (g.stop) stop();
    };
    src.connect(node); node.connect(ctx.destination);
    st = "rec"; t0 = 0; $("#mic").classList.add("on"); $("#mic").textContent = "⏹"; $("#hint").textContent = ask || pend ? "گوش می‌دهم… جواب سؤال را بگو" : "گوش می‌دهم…";
  }
  async function stop() {
    if (st !== "rec") return;
    st = "finishing"; t0 = Date.now(); $("#mic").classList.remove("on"); $("#mic").textContent = "🎤"; $("#mic").disabled = true; $("#hint").textContent = "در حال تمام کردن…";
    try { node.onaudioprocess = null; node.disconnect(); src.disconnect(); stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    const n0 = results; try { rec.retrieveFinalResult(); } catch (e) {}
    for (let i = 0; i < 30 && results === n0; i++) await new Promise(r => setTimeout(r, 100));
    st = "idle"; $("#mic").disabled = false; $("#hint").textContent = "آماده است ✓";
    const heard = VC.words2num(text.trim()), sec = (Date.now() - t0) / 1000;
    if (!heard) { log("bad", "✗ چیزی شنیده نشد؛ دوباره بگو (گوشی نزدیک دهان)"); R.turns.push({ heard: "", sec, ok: false }); return dev(); }
    turn(heard, sec, true);
  }
  function report() {
    return ["گزارش آزمایش دستور صوتی", "گوشی: " + R.device, "مدل از قبل روی گوشی: " + (R.cached == null ? "—" : R.cached ? "بله" : "نه"),
      "دانلود مدل: " + (R.downloadSec ?? "—") + " ثانیه", "باز کردن مدل: " + (R.openSec ?? "—") + " ثانیه", R.error ? "خطا: " + R.error : "",
      ...R.turns.map((x, i) => (i + 1) + ". شنید: «" + (x.heard || "") + "» ← " + (x.ok ? "✓ " : "✗ ") + (x.said || "نفهمید") + (x.sec != null ? " (" + x.sec.toFixed(1) + " ث)" : ""))]
      .filter(Boolean).join("\n");
  }
  $("#mic").onclick = () => (st === "rec" ? stop() : st === "idle" && model ? start() : null);
  $("#parse").onclick = () => { const t = $("#txt").value.trim(); if (!t) return; $("#txt").value = ""; turn(VC.words2num(t), null, false); };
  $("#reset").onclick = () => { $("#log").innerHTML = ""; ask = null; pend = null; };
  $("#log").onclick = e => { const b = e.target.closest("[data-pick]"); if (!b || !ask) return; const it = ask.choices[+b.dataset.pick].item; ask = null; pend = null; log("ok", "✓ " + esc(it.text)); };
  $("#copy").onclick = async () => { try { await navigator.clipboard.writeText(report()); $("#copied").textContent = "کپی شد؛ برای مدیر بفرست."; }
    catch (e) { $("#copied").textContent = "کپی نشد؛ این متن را دستی کپی کن:"; $("#copied").insertAdjacentHTML("afterend", `<textarea readonly>${esc(report())}</textarea>`); } };
  document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $("#samples").innerHTML = SAMPLES.map(s => `<li>${esc(s)}</li>`).join("");
  setMode(mode()); dev(); load();
})();
