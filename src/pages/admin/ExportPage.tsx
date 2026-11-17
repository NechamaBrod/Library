import { useState } from "react";
import { fetchAll } from "../../lib/supabase";
import { useAction } from "../../lib/hooks";
import { downloadFile, errorText, jerusalemDay, toCsv } from "../../lib/format";

type Rows = Record<string, unknown>[];

const TABLES: { table: string; label: string; order: string; columns: string[] }[] = [
  { table: "books", label: "ספרים", order: "created_at",
    columns: ["id", "title", "author", "category", "audience", "language", "series", "series_number", "tags", "location", "summary", "cover_url", "is_sample", "archived_at", "created_at", "updated_at"] },
  { table: "borrowers", label: "קוראות", order: "created_at", columns: ["id", "name", "phone", "email", "created_at"] },
  { table: "loans", label: "השאלות (כולל היסטוריה)", order: "loaned_at",
    columns: ["id", "book_id", "borrower_id", "loaned_at", "due_date", "returned_at", "note", "reservation_id"] },
  { table: "reservation_requests", label: "בקשות שמירה", order: "requested_at",
    columns: ["id", "book_id", "requester_name", "requester_phone", "status", "requested_at", "approved_at", "expires_at", "resolved_at", "borrower_id", "loan_id"] },
];

export default function ExportPage() {
  const { busy, run } = useAction();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const guard = (key: string, fn: () => Promise<string>) =>
    run(key, async () => {
      setError(null);
      setDone(null);
      try {
        setDone(await fn());
      } catch (e) {
        setError(errorText(e));
      }
    });

  const exportAll = () =>
    guard("all", async () => {
      const out: Record<string, Rows> = {};
      for (const t of TABLES) out[t.table] = await fetchAll<Record<string, unknown>>(t.table, "*", { column: t.order });
      downloadFile(
        `hasifriya-${jerusalemDay()}.json`,
        JSON.stringify({ exported_at: new Date().toISOString(), timezone_note: "all timestamps are UTC", ...out }, null, 2),
        "application/json",
      );
      return `הקובץ ירד: ${TABLES.map((t) => `${out[t.table].length} ${t.label}`).join(", ")}.`;
    });

  const exportCsv = (t: (typeof TABLES)[number]) =>
    guard(t.table, async () => {
      const rows = await fetchAll<Record<string, unknown>>(t.table, "*", { column: t.order });
      downloadFile(`${t.table}-${jerusalemDay()}.csv`, toCsv(rows, t.columns), "text/csv;charset=utf-8");
      return `הקובץ ירד: ${rows.length} שורות.`;
    });

  return (
    <div style={{ maxWidth: 720 }}>
      <h1>ייצוא נתונים</h1>
      <p className="muted">
        הייצוא זמין למנהלת בלבד וכולל פרטים אישיים של קוראות. הזמנים בקבצים הם ב־UTC.
      </p>
      {error && <div className="notice error" role="alert">{error}</div>}
      {done && <div className="notice ok" role="status">{done}</div>}

      <div className="card">
        <h2>גיבוי מלא</h2>
        <p>קובץ JSON אחד עם כל הטבלאות.</p>
        <button type="button" className="btn primary" disabled={busy !== null} onClick={exportAll}>
          {busy === "all" ? "מכינה…" : "הורדת גיבוי מלא (JSON)"}
        </button>
      </div>
      <div className="card">
        <h2>טבלאות ל־Excel</h2>
        <p>קובצי CSV נפרדים שנפתחים בגיליון אלקטרוני.</p>
        <div className="btn-row">
          {TABLES.map((t) => (
            <button key={t.table} type="button" className="btn" disabled={busy !== null} onClick={() => exportCsv(t)}>
              {busy === t.table ? "מכינה…" : t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
