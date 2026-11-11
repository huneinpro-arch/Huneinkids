// Vercel serverless function: يستقبل الطلب، يضيف الـ IP، ويمرره إلى Google Apps Script
// المتغيرات المطلوبة في Vercel (Settings > Environment Variables):
//   APPS_SCRIPT_URL = رابط الـ Web app   |   ORDER_SECRET = كلمة سرية مطابقة لما في السكريبت
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
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.headers["x-real-ip"] || "";
    const body = {
      id: s(d.id, 30), name: s(d.name, 80), phone: s(d.phone, 20), wilaya: s(d.wilaya, 60),
      commune: s(d.commune, 80), delivery: s(d.delivery, 30), qty: qty,
      price: Number(d.price) || 0, ship: Number(d.ship) || 0, total: Number(d.total) || 0,
      lang: s(d.lang, 4), ip: ip, secret: process.env.ORDER_SECRET || ""
    };
    if (!process.env.APPS_SCRIPT_URL) return res.status(500).json({ ok: false, reason: "config" });
    const r = await fetch(process.env.APPS_SCRIPT_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body), redirect: "follow"
    });
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch (e) {
      return res.status(502).json({ ok: false, reason: "upstream", status: r.status, snippet: txt.slice(0, 160).replace(/\s+/g, " ") });
    }
    return res.status(200).json(j);
  } catch (e) {
    return res.status(502).json({ ok: false, reason: "upstream", error: String(e && e.message || e).slice(0, 120) });
  }
};
