// הזמנים נשמרים ב-UTC ומוצגים לפי שעון ישראל.
const TZ = "Asia/Jerusalem";
const dateFmt = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("he-IL", {
  timeZone: TZ, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
export const fmtDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

/** תאריך לוח (YYYY-MM-DD, ללא שעה) — מוצג כמו שהוא, בלי המרת אזור זמן. */
export function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

/** YYYY-MM-DD של רגע נתון בשעון ישראל */
export const jerusalemDay = (d: Date = new Date()) => ymdFmt.format(d);

function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** כמה זמן חלף מאז, בימים קלנדריים לפי שעון ישראל */
export function elapsedSince(iso: string, now: Date = new Date()): string {
  const days = dayNumber(jerusalemDay(now)) - dayNumber(jerusalemDay(new Date(iso)));
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  if (days === 2) return "לפני יומיים";
  if (days < 14) return `לפני ${days} ימים`;
  if (days < 60) return `לפני ${Math.floor(days / 7)} שבועות`;
  const months = Math.floor(days / 30);
  if (months < 12) return `לפני ${months} חודשים`;
  const years = Math.floor(days / 365);
  return years <= 1 ? "לפני יותר משנה" : `לפני ${years} שנים`;
}

/** איחור קיים רק כשנקבע מועד החזרה והוא עבר. */
export function isOverdue(dueDate: string | null, now: Date = new Date()): boolean {
  return Boolean(dueDate) && dueDate! < jerusalemDay(now);
}

export function timeLeft(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return "פג תוקף";
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return `עוד ${Math.max(1, Math.round(ms / 60000))} דקות`;
  if (hours < 24) return hours === 1 ? "עוד שעה" : `עוד ${hours} שעות`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const d = days === 1 ? "יום" : days === 2 ? "יומיים" : `${days} ימים`;
  return rest ? `עוד ${d} ו־${rest} שעות` : `עוד ${d}`;
}

/** זהה ל-normalize_phone במסד */
export function normalizePhone(phone: string): string {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.startsWith("972") ? "0" + d.slice(3) : d;
}

function normTitle(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[֑-ׇ]/g, "") // ניקוד וטעמים
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/** האם שני כותרים דומים מספיק כדי להתריע על כפילות אפשרית */
export function similarTitles(a: string, b: string): boolean {
  const x = normTitle(a);
  const y = normTitle(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 5 && long.includes(short)) return true;
  if (short.length >= 6 && levenshtein(x, y) <= Math.max(1, Math.floor(short.length * 0.2))) return true;
  return false;
}

const ERRORS: Record<string, string> = {
  NOT_ADMIN: "הפעולה מותרת למנהלת בלבד.",
  BOOK_ALREADY_LOANED: "הספר כבר מושאל. יש לרשום החזרה לפני השאלה נוספת.",
  BOOK_RESERVED: "הספר שמור כרגע לקוראת אחרת. יש לטפל בשמירה לפני כן.",
  BOOK_ARCHIVED: "הספר נמצא בארכיון.",
  BOOK_NOT_FOUND: "הספר לא נמצא.",
  BOOK_IN_USE: "אי אפשר לארכב ספר שיש לו השאלה או שמירה פעילה.",
  BORROWER_NOT_FOUND: "הקוראת לא נמצאה.",
  LOAN_NOT_FOUND: "ההשאלה לא נמצאה.",
  RESERVATION_NOT_FOUND: "הבקשה לא נמצאה.",
  RESERVATION_NOT_PENDING: "הבקשה כבר טופלה.",
  RESERVATION_NOT_ACTIVE: "השמירה כבר אינה פעילה.",
  INVALID_INPUT: "הנתונים שהוזנו אינם תקינים.",
  "permission denied": "אין הרשאה לבצע את הפעולה.",
  "row-level security": "אין הרשאה לבצע את הפעולה.",
  "Invalid login credentials": "כתובת הדוא״ל או הסיסמה שגויים.",
  "Failed to fetch": "אין חיבור לשרת. בדקי את החיבור לאינטרנט ונסי שוב.",
};

export function errorText(err: unknown): string {
  const msg = typeof err === "string" ? err : ((err as { message?: string })?.message ?? "");
  for (const [code, text] of Object.entries(ERRORS)) {
    if (msg.includes(code)) return text;
  }
  return "משהו השתבש. נסי שוב בעוד רגע.";
}

const AI_ERRORS: Record<string, string> = {
  ai_not_configured: "שירות ה־AI אינו מוגדר: חסר מפתח ANTHROPIC_API_KEY בסודות הפרויקט.",
  not_deployed: "פונקציית השרת לא נפרסה עדיין (supabase functions deploy).",
  unreachable: "לא ניתן להגיע לשרת. בדקי את החיבור ונסי שוב.",
  not_admin: "הפעולה מותרת למנהלת בלבד.",
  rate_limited: "בוצעו יותר מדי בקשות בזמן קצר. נסי שוב מאוחר יותר.",
  invalid_input: "הבקשה אינה תקינה.",
  ai_bad_key: "מפתח ה־AI נדחה על ידי הספק. יש לבדוק את ANTHROPIC_API_KEY.",
  ai_busy: "שירות ה־AI עמוס כרגע. נסי שוב בעוד דקה.",
  ai_unavailable: "שירות ה־AI אינו זמין כרגע. נסי שוב מאוחר יותר.",
  ai_refused: "המודל לא עיבד את הבקשה.",
  ai_invalid_output: "התקבלה מהמודל תשובה לא תקינה. נסי שוב.",
  ai_bad_request: "הבקשה נדחתה על ידי ספק ה־AI (ייתכן שהתמונה אינה נתמכת).",
  image_not_found: "התמונה לא נמצאה באחסון. נסי להעלות שוב.",
  unsupported_image: "סוג הקובץ אינו נתמך. יש להעלות JPG, PNG או WebP.",
  image_too_large: "התמונה גדולה מדי.",
  scan_not_found: "רשומת הצילום לא נמצאה.",
};

export const aiErrorText = (code: string) => AI_ERRORS[code] ?? "אירעה שגיאה בשרת. נסי שוב.";

export function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (v: unknown) => {
    const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM כדי שאקסל יזהה עברית
  return "﻿" + [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n");
}

/** הקטנת תמונה בדפדפן לפני העלאה. זורק שגיאה אם הקובץ אינו תמונה קריאה. */
export async function resizeImage(file: File, maxEdge: number, maxBytes: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("UNREADABLE_IMAGE");
  }
  let edge = maxEdge;
  let quality = 0.86;
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("UNREADABLE_IMAGE");
    if (blob.size <= maxBytes) return blob;
    edge = Math.round(edge * 0.8);
    quality -= 0.06;
  }
  throw new Error("IMAGE_TOO_LARGE");
}
