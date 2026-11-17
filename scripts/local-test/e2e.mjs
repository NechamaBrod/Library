// בדיקת קצה-לקצה בדפדפן מול שער הבדיקה המקומי (gateway.mjs) ומסד עם המיגרציות האמיתיות.
// הרצה: node scripts/local-test/e2e.mjs [תיקיית-צילומים]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const SHOTS = process.argv[2];
let passed = 0;
const ok = (cond, label) => {
  if (!cond) throw new Error(`FAILED: ${label}`);
  passed++;
  console.log(`ok - ${label}`);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "he-IL", acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

process.on("uncaughtException", async (e) => {
  console.error(String(e).split("\n")[0]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/failure.png` }).catch(() => {});
  console.error("visible notices:", await page.locator(".notice, .toast").allInnerTexts().catch(() => []));
  process.exit(1);
});

// ---------- מבקרת ----------
await page.goto(BASE);
await page.waitForSelector(".book-card");
ok((await page.locator(".book-card").count()) === 6, "catalog shows 6 books to anonymous visitor");
ok((await page.locator("html").getAttribute("dir")) === "rtl", "page is RTL");
await shot(page, "01-catalog");
await page.getByLabel("חיפוש לפי שם ספר או מחבר").fill("בלשים");
ok((await page.locator(".book-card").count()) === 2, "search by title filters catalog");
await page.getByLabel("חיפוש לפי שם ספר או מחבר").fill("");
await page.getByLabel("קטגוריה").selectOption("בישול");
ok((await page.locator(".book-card").count()) === 1, "category filter works");
await page.getByRole("button", { name: "ניקוי" }).click();

await page.getByRole("link", { name: /המסע אל ראש ההר/ }).click();
await page.waitForSelector("h1");
ok(await page.getByText("סלון, מדף 1").count() === 0, "location is not shown to visitors");
await page.getByLabel("שם מלא").fill("מרים כהן");
await page.getByLabel("טלפון").fill("054-1112222");
await shot(page, "02-book");
await page.getByRole("button", { name: "שליחת בקשה" }).click();
await page.getByText("הבקשה התקבלה וממתינה לאישור. לאחר האישור הספר יישמר עבורך ליומיים.").waitFor();
ok(true, "reservation request shows the required confirmation text");
await page.reload();
await page.waitForSelector("h1");
ok(await page.locator(".badge.available").count() === 1, "pending request does not block the book");

await page.goto(`${BASE}/recommend`);
await page.getByText("המלצות — לא מוגדר").waitFor();
ok(await page.getByRole("button", { name: "הצעת ספרים" }).count() === 0, "recommendations show 'not configured' instead of fake results");

await page.goto(`${BASE}/admin`);
await page.getByRole("heading", { name: "כניסת מנהלת" }).waitFor();
ok(true, "admin screen redirects visitor to login");

// ---------- משתמשת מחוברת שאינה מנהלת ----------
await page.getByLabel("דוא״ל").fill("other@test.local");
await page.getByLabel("סיסמה").fill("wrong");
await page.getByRole("button", { name: "כניסה" }).click();
await page.getByText("כתובת הדוא״ל או הסיסמה שגויים.").waitFor();
ok(true, "wrong password shows Hebrew error");
await page.getByLabel("סיסמה").fill("test-pass-2");
await page.getByRole("button", { name: "כניסה" }).click();
await page.getByText("אין הרשאת מנהלת").waitFor();
ok(true, "non-admin account is refused admin screens");
const leak = await page.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
  const token = JSON.parse(localStorage.getItem(key)).access_token;
  const r = await fetch("http://127.0.0.1:54321/rest/v1/borrowers?select=*", { headers: { Authorization: `Bearer ${token}` } });
  const r2 = await fetch("http://127.0.0.1:54321/rest/v1/reservation_requests?select=*", { headers: { Authorization: `Bearer ${token}` } });
  return [await r.json(), await r2.json()];
});
ok(Array.isArray(leak[0]) && leak[0].length === 0 && leak[1].length === 0, "non-admin token reads zero borrowers/requests straight from the API");
await page.getByRole("button", { name: "יציאה" }).first().click();
await page.getByRole("link", { name: "כניסת מנהלת" }).waitFor();

// ---------- מנהלת ----------
await page.goto(`${BASE}/login`);
await page.getByLabel("דוא״ל").fill("admin@test.local");
await page.getByLabel("סיסמה").fill("test-pass-1");
await page.getByRole("button", { name: "כניסה" }).click();
await page.getByRole("heading", { name: "אצל מי הספרים?" }).waitFor();
await page.getByText("מרים כהן").waitFor();
ok(true, "admin sees pending reservation request");
await page.getByText("כל הספרים בבית").waitFor();
await shot(page, "03-dashboard-pending");

await page.getByRole("button", { name: "אישור ושמירה ל־48 שעות" }).click();
await page.getByRole("button", { name: "נמסר לקוראת" }).waitFor();
const left = await page.locator("#h-active ~ .table-wrap tbody tr td").nth(2).innerText();
ok(/עוד יומיים|עוד יום ו־23 שעות/.test(left), `approved reservation shows ~48h left ("${left.split("\n")[0]}")`);

// השאלה חדשה עם קוראת חדשה
await page.getByRole("button", { name: "+ השאלה חדשה" }).click();
await page.locator("#ln-book").fill("סבתא");
await page.getByRole("button", { name: /סודות המטבח/ }).click();
await page.getByRole("button", { name: "+ קוראת חדשה" }).click();
await page.getByLabel("שם", { exact: true }).fill("רחל לוי");
await page.locator("#nb-phone").fill("050-7778888");
await page.getByRole("button", { name: "יצירת קוראת" }).click();
await page.locator(".chosen", { hasText: "רחל לוי" }).waitFor();
await shot(page, "04-new-loan");
await page.getByRole("button", { name: "רישום השאלה" }).dblclick();
await page.getByText("הושאל לרחל לוי").waitFor();
await page.locator("#h-loans ~ .table-wrap tbody tr").first().waitFor();
ok((await page.locator("#h-loans ~ .table-wrap tbody tr").count()) === 1, "double click creates exactly one loan");
ok(await page.locator("#h-loans ~ .table-wrap").getByText("לא נקבע").count() === 1, "no due date => no overdue marker");
ok(await page.locator(".badge.overdue").count() === 0, "no overdue badge without a due date");

await page.reload();
await page.locator("#h-loans ~ .table-wrap tbody tr").first().waitFor();
ok(await page.locator("#h-loans ~ .table-wrap").getByText("רחל לוי").count() === 1, "loan persists after refresh");

// ספר מושאל אינו ניתן להשאלה נוספת; ספר שמור דורש החלטה
await page.getByRole("button", { name: "+ השאלה חדשה" }).click();
await page.locator("#ln-book").fill("סבתא");
ok(await page.getByRole("button", { name: /סודות המטבח/ }).isDisabled(), "loaned book cannot be picked for another loan");
await page.locator("#ln-book").fill("ראש ההר");
await page.getByRole("button", { name: /המסע אל ראש ההר/ }).click();
await page.getByText("מה לעשות עם השמירה?").waitFor();
ok(await page.getByRole("button", { name: "רישום השאלה" }).isDisabled(), "reserved book requires an explicit decision before loaning");
await page.getByRole("button", { name: "ביטול", exact: true }).click();

// איתור קוראת קיימת לפי טלפון
await page.goto(`${BASE}/admin/borrowers`);
await page.getByRole("button", { name: "+ קוראת חדשה" }).click();
await page.getByLabel("שם", { exact: true }).fill("מישהי אחרת");
await page.locator("#nb-phone").fill("+972-50-7778888");
await page.getByText("כבר רשומה קוראת עם מספר הטלפון הזה").waitFor();
ok(await page.getByRole("button", { name: "יצירת קוראת" }).isDisabled(), "existing borrower is found by phone before creating a duplicate");

// נמסר לקוראת
await page.goto(`${BASE}/admin`);
await page.getByRole("button", { name: "נמסר לקוראת" }).click();
await page.locator("#nb-name").waitFor();
ok((await page.locator("#nb-name").inputValue()) === "מרים כהן", "handover pre-fills borrower from request details");
await page.getByRole("button", { name: "יצירת קוראת" }).click();
await page.locator(".chosen", { hasText: "מרים כהן" }).waitFor();
await page.locator("#ln-due").fill("2020-01-01");
await page.getByRole("button", { name: "אישור מסירה ורישום השאלה" }).click();
await page.getByText("נרשם כהשאלה").waitFor();
await page.waitForFunction(() => document.querySelectorAll("#h-loans ~ .table-wrap tbody tr").length === 2);
ok(await page.getByRole("button", { name: "נמסר לקוראת" }).count() === 0, "handover converts reservation into a loan");
ok(await page.locator(".badge.overdue").count() === 1, "overdue shown only for the loan with a past due date");
await shot(page, "05-dashboard-loans");

// החזרה
const row = page.locator("#h-loans ~ .table-wrap tbody tr", { hasText: "רחל לוי" });
await row.getByRole("button", { name: "החזרה" }).click();
await row.getByRole("button", { name: "לאשר החזרה" }).click();
await page.getByText("הוחזר.").waitFor();
await page.waitForFunction(() => document.querySelectorAll("#h-loans ~ .table-wrap tbody tr").length === 1);
await page.reload();
await page.locator("#h-loans ~ .table-wrap tbody tr").first().waitFor();
ok((await page.locator("#h-loans ~ .table-wrap tbody tr").count()) === 1, "return persists after refresh");
await page.goto(`${BASE}/admin/borrowers`);
await page.getByRole("link", { name: "רחל לוי" }).click();
await page.getByRole("heading", { name: /היסטוריה/ }).waitFor();
ok(await page.locator("section", { hasText: "היסטוריה" }).getByText("סודות המטבח").count() === 1, "returned loan kept in borrower history");
await shot(page, "06-borrower");

// הוספת ספר, עריכה וארכוב
await page.goto(`${BASE}/admin/books/new`);
await page.getByLabel("שם הספר").fill("ספר בדיקה ידני");
await page.getByLabel("קטגוריה").fill("עיון");
await page.getByRole("button", { name: "הוספה לקטלוג" }).click();
await page.getByRole("heading", { name: "ספר בדיקה ידני" }).waitFor();
await page.getByLabel(/^מחבר/).fill("מחברת בדיקה");
await page.getByRole("button", { name: "שמירת שינויים" }).click();
await page.getByText("השינויים נשמרו.").waitFor();
await page.reload();
await page.getByRole("heading", { name: "ספר בדיקה ידני" }).waitFor();
ok((await page.getByLabel(/^מחבר/).inputValue()) === "מחברת בדיקה", "book edit persists after refresh");
await shot(page, "07-book-edit");
await page.getByRole("button", { name: "העברה לארכיון" }).click();
await page.getByRole("button", { name: "לארכב את הספר?" }).click();
await page.getByText("הספר הועבר לארכיון.").waitFor();
await page.goto(BASE);
await page.waitForSelector(".book-card");
ok(await page.getByText("ספר בדיקה ידני").count() === 0, "archived book is hidden from the catalog");
await page.goto(`${BASE}/admin/books`);
await page.getByRole("link", { name: /המסע אל ראש ההר/ }).first().click();
await page.getByText("אי אפשר לארכב ספר שיש לו השאלה או שמירה פעילה.").waitFor();
ok(true, "book with active loan cannot be archived from the UI");
await shot(page, "08-books");

// AI לא מוגדר + ייצוא
await page.goto(`${BASE}/admin/shelf`);
await page.getByText("זיהוי ספרים מתמונה — לא מוגדר").waitFor();
ok(await page.locator("#sh-file").count() === 0, "shelf import shows 'not configured' and offers no upload");
await page.goto(`${BASE}/admin/export`);
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.getByRole("button", { name: "הורדת גיבוי מלא (JSON)" }).click(),
]);
const fs = await import("node:fs/promises");
const dump = JSON.parse(await fs.readFile(await download.path(), "utf8"));
ok(dump.books.length === 7 && dump.loans.length === 2 && dump.borrowers.length === 2 && dump.reservation_requests.length === 1,
  "export contains books, borrowers, full loan history and requests");

// מובייל
const mobile = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: "he-IL", storageState: await ctx.storageState() });
const m = await mobile.newPage();
await m.goto(BASE);
await m.waitForSelector(".book-card");
ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "catalog has no horizontal scroll on mobile");
if (SHOTS) await m.screenshot({ path: `${SHOTS}/09-mobile-catalog.png` });
await m.goto(`${BASE}/admin`);
await m.locator("#h-loans").waitFor();
ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "dashboard has no horizontal scroll on mobile");
if (SHOTS) await m.screenshot({ path: `${SHOTS}/10-mobile-dashboard.png`, fullPage: true });

ok(errors.length === 0, `no uncaught page errors ${errors.join(" | ")}`);
await browser.close();
console.log(`\nALL ${passed} UI CHECKS PASSED`);
