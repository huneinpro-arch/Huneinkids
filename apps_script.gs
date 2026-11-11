// Google Apps Script — تسجيل الطلبات + منع الطلبات الوهمية
// - كل زبون (نفس الهاتف أو نفس الاسم أو نفس الـ IP) له طلبان فقط في 24 ساعة.
// - المحاولة الثالثة تُحظر 6 ساعات (يُسجَّل الحظر في تبويب Blocks).
// - لا يقبل إلا الطلبات القادمة من دالة Vercel (api/order) عبر SECRET.
var SECRET = "PUT_SECRET_HERE";          // نفس قيمة ORDER_SECRET في Vercel
var SHEET_NAME = "Orders", BLOCK_SHEET = "Blocks";
var MAX_ORDERS = 2, WINDOW_MS = 24 * 3600 * 1000, BLOCK_MS = 6 * 3600 * 1000;
var HEAD = ["Order ID","التاريخ","الاسم الكامل","الهاتف","Wilaya","Commune","نوع التوصيل","الكمية","سعر الحقائب (دج)","سعر التوصيل (دج)","المجموع (دج)","لغة الزبون","الحالة","IP"];

function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
function pk(p) { return String(p || "").replace(/\D/g, "").replace(/^(00213|213)/, "0").slice(-9); }
function keysOf(name, phone, ip) {
  var k = [], p = pk(phone), n = norm(name), i = String(ip || "").trim();
  if (p) k.push("p:" + p); if (n) k.push("n:" + n); if (i) k.push("i:" + i);
  return k;
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false, reason: "forbidden" });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) sh.appendRow(HEAD);
    var bs = ss.getSheetByName(BLOCK_SHEET) || ss.insertSheet(BLOCK_SHEET);
    if (bs.getLastRow() === 0) bs.appendRow(["Key", "Until", "Blocked at"]);
    var now = Date.now(), keys = keysOf(d.name, d.phone, d.ip);

    // 1) هل أحد المفاتيح محظور حاليًا؟
    var blockedUntil = {}, bv = bs.getDataRange().getValues();
    for (var b = 1; b < bv.length; b++) {
      var u = new Date(bv[b][1]).getTime();
      if (!blockedUntil[bv[b][0]] || u > blockedUntil[bv[b][0]]) blockedUntil[bv[b][0]] = u;
    }
    for (var a = 0; a < keys.length; a++) {
      if (blockedUntil[keys[a]] && blockedUntil[keys[a]] > now)
        return out({ ok: false, reason: "blocked", until: blockedUntil[keys[a]] });
    }

    // 2) عدّ الطلبات الأخيرة لكل مفتاح (بعد آخر حظر)
    var lr = sh.getLastRow(), rows = lr > 1 ? sh.getRange(2, 1, lr - 1, 14).getValues() : [];
    var counts = {};
    for (var r = 0; r < rows.length; r++) {
      var t = new Date(rows[r][1]).getTime();
      if (!t || now - t > WINDOW_MS) continue;
      var rk = keysOf(rows[r][2], rows[r][3], rows[r][13]);
      for (var q = 0; q < rk.length; q++) {
        if (keys.indexOf(rk[q]) < 0) continue;
        if (blockedUntil[rk[q]] && t <= blockedUntil[rk[q]]) continue;
        counts[rk[q]] = (counts[rk[q]] || 0) + 1;
      }
    }
    for (var c = 0; c < keys.length; c++) {
      if ((counts[keys[c]] || 0) >= MAX_ORDERS) {
        var until = now + BLOCK_MS;
        keys.forEach(function (k) { bs.appendRow([k, new Date(until), new Date(now)]); });
        return out({ ok: false, reason: "blocked", until: until });
      }
    }

    // 3) تسجيل الطلب
    var row = sh.getLastRow() + 1;
    sh.getRange(row, 4).setNumberFormat("@");
    sh.getRange(row, 1, 1, 14).setValues([[
      d.id, new Date(now), d.name, d.phone, d.wilaya, d.commune,
      d.delivery === "للمنزل" ? "Domicile" : "Stopdesk",
      d.qty, d.price, d.ship, d.total, d.lang, "جديد", d.ip || ""
    ]]);
    return out({ ok: true, id: d.id });
  } catch (err) {
    return out({ ok: false, reason: "error", error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return ContentService.createTextOutput("Hunein orders endpoint OK"); }
