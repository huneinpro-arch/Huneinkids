// Google Apps Script — يسجّل طلبات صفحة الهبوط في Google Sheet
// 1) افتح الجدول > Extensions > Apps Script > الصق هذا الكود > Save
// 2) Deploy > New deployment > Web app: Execute as = Me ، Who has access = Anyone
// 3) انسخ رابط الـ Web app وضعه في SHEET_URL داخل الصفحة
var SHEET_NAME = "Orders";
var HEAD = ["Order ID","التاريخ","الاسم الكامل","الهاتف","Wilaya","Commune","نوع التوصيل","الكمية","سعر الحقائب (دج)","سعر التوصيل (دج)","المجموع (دج)","لغة الزبون","الحالة"];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) sh.appendRow(HEAD);
    sh.getRange(sh.getLastRow() + 1, 4).setNumberFormat("@"); // الهاتف كنص
    sh.appendRow([
      d.id, new Date(), d.name, "'" + d.phone, d.wilaya, d.commune,
      d.delivery === "للمنزل" ? "Domicile" : "Stopdesk",
      d.qty, d.price, d.ship, d.total, d.lang, "جديد"
    ]);
    return ContentService.createTextOutput(JSON.stringify({ok: true, id: d.id}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
