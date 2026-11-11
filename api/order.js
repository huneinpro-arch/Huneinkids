// Vercel serverless function: يستقبل الطلب من الصفحة، يضيف الـ IP للفحص، ثم يرسله إلى
// سكريبت "Order bot" الموجود في Google Sheet (doPost يقرأ حقولًا بصيغة form).
// المتغير المطلوب في Vercel: APPS_SCRIPT_URL = رابط الـ Web app (…/exec)

// حماية مبدئية (داخل ذاكرة الدالة): طلبان لكل هاتف/اسم/IP في 24 ساعة، والثالث يُحظر 6 ساعات.
// ملاحظة: الذاكرة تُمسح عند إعادة تشغيل الدالة، لذا هي حماية جزئية وليست نهائية.
const store = globalThis.__orderGuard || (globalThis.__orderGuard = { hits: new Map(), blocks: new Map() });
const MAX = 2, WIN = 24 * 3600e3, BLOCK = 6 * 3600e3;
const norm = (v) => String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
const pkey = (p) => String(p || "").replace(/\D/g, "").replace(/^(00213|213)/, "0").slice(-9);

function guard(name, phone, ip) {
  const now = Date.now();
  const keys = ["p:" + pkey(phone), "n:" + norm(name), ip ? "i:" + ip : ""].filter((k) => k.length > 2);
  for (const k of keys) { const u = store.blocks.get(k); if (u && u > now) return { blocked: true, until: u }; }
  for (const k of keys) {
    const arr = (store.hits.get(k) || []).filter((t) => now - t < WIN);
    store.hits.set(k, arr);
    if (arr.length >= MAX) { keys.forEach((x) => store.blocks.set(x, now + BLOCK)); return { blocked: true, until: now + BLOCK }; }
  }
  return { blocked: false, commit: () => keys.forEach((k) => store.hits.set(k, [...(store.hits.get(k) || []), now])) };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });
  try {
    const d = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const s = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
    const phone = s(d.phone, 20).replace(/[\s.\-]/g, "");
    const qty = Number(d.qty);
    if (!s(d.name, 80) || !/^(?:\+213|00213|213|0)[567]\d{8}$/.test(phone) ||
        !s(d.wilaya, 60) || !s(d.commune, 80) || !(qty >= 1 && qty <= 3)) {
      return res.status(400).json({ ok: false, reason: "invalid" });
    }
    if (!process.env.APPS_SCRIPT_URL) return res.status(500).json({ ok: false, reason: "config" });
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.headers["x-real-ip"] || "";
    const g = guard(d.name, phone, ip);
    if (g.blocked) return res.status(429).json({ ok: false, reason: "blocked", until: g.until });

    const unit = Number(d.price) && qty ? Math.round(Number(d.price) / qty) : 0;
    const form = new URLSearchParams({
      orderId: s(d.id, 30), fullName: s(d.name, 80), phone: s(d.phone, 20), phone2: "",
      wilaya: s(d.wilaya, 60), commune: s(d.commune, 80), delivery: s(d.delivery, 30),
      deliveryCompany: "DHD", product: "حقيبة عقيدة الطفل المسلم", items: "", qty: String(qty),
      basePrice: String(unit), price: String(unit), shipping: String(Number(d.ship) || 0),
      total: String(Number(d.total) || 0), paidNow: "0", receipt: ""
    });
    const r = await fetch(process.env.APPS_SCRIPT_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(), redirect: "follow"
    });
    const txt = (await r.text()).trim();
    if (txt !== "ok") {
      return res.status(502).json({ ok: false, reason: "upstream", status: r.status, snippet: txt.slice(0, 120).replace(/\s+/g, " ") });
    }
    g.commit();
    return res.status(200).json({ ok: true, id: s(d.id, 30) });
  } catch (e) {
    return res.status(502).json({ ok: false, reason: "upstream", error: String((e && e.message) || e).slice(0, 120) });
  }
};
