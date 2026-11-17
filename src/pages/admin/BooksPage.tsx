import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAll, supabase } from "../../lib/supabase";
import { useAction, useLoad, useToast } from "../../lib/hooks";
import type { AdminBook } from "../../lib/types";
import { ConfirmButton, Empty, ErrorNotice, Loading, StatusBadge } from "../../components/ui";

export default function BooksPage() {
  const toast = useToast();
  const { busy, run } = useAction();
  const { data, error, loading, reload } = useLoad(() => fetchAll<AdminBook>("admin_books", "*", { column: "title" }));
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const books = data ?? [];
  const archivedCount = books.filter((b) => b.archived_at).length;
  const sampleCount = books.filter((b) => b.is_sample).length;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return books.filter(
      (b) =>
        (showArchived ? Boolean(b.archived_at) : !b.archived_at) &&
        (!needle ||
          b.title.toLowerCase().includes(needle) ||
          (b.author ?? "").toLowerCase().includes(needle) ||
          (b.location ?? "").toLowerCase().includes(needle)),
    );
  }, [books, q, showArchived]);

  const deleteSamples = () =>
    run("samples", async () => {
      // ספרי דוגמה שיש להם היסטוריית השאלות לא יימחקו (מוגן במסד) — אותם אפשר לארכב.
      const { error: err } = await supabase.from("books").delete().eq("is_sample", true);
      if (err) toast("חלק מספרי הדוגמה לא נמחקו כי נרשמו עליהם השאלות או בקשות. אפשר לארכב אותם.", "error");
      else toast("נתוני הדוגמה נמחקו.");
      await reload();
    });

  return (
    <>
      <div className="page-head">
        <h1>ספרים</h1>
        <div className="btn-row">
          <Link className="btn" to="/admin/shelf">הוספה מתמונת מדף</Link>
          <Link className="btn accent" to="/admin/books/new">+ ספר חדש</Link>
        </div>
      </div>

      {sampleCount > 0 && (
        <div className="notice warn">
          בקטלוג יש {sampleCount} ספרי דוגמה (מסומנים „דוגמה”). הם אינם חלק מהספרייה האמיתית.{" "}
          <ConfirmButton label="מחיקת נתוני הדוגמה" confirmLabel="למחוק את כל ספרי הדוגמה?" busy={busy !== null} onConfirm={deleteSamples} />
        </div>
      )}

      <div className="toolbar">
        <div className="field grow">
          <label htmlFor="bq">חיפוש לפי שם, מחבר או מיקום</label>
          <input id="bq" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          הצגת הארכיון ({archivedCount})
        </label>
      </div>

      {loading && <Loading />}
      {error && <ErrorNotice text={error} onRetry={reload} />}
      {data && filtered.length === 0 && (
        <Empty>
          {books.length === 0
            ? "עדיין אין ספרים. אפשר להוסיף ספר ידנית או לצלם מדף."
            : showArchived ? "אין ספרים בארכיון." : "לא נמצאו ספרים שמתאימים לחיפוש."}
        </Empty>
      )}
      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="stack-sm">
            <thead><tr><th>ספר</th><th>קטגוריה</th><th>מיקום</th><th>מצב</th><th><span className="sr-only">פעולות</span></th></tr></thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link to={`/admin/books/${b.id}`}><strong>{b.title}</strong></Link>{" "}
                    {b.is_sample && <span className="badge plain">דוגמה</span>}
                    {b.author && <span className="sub">{b.author}</span>}
                  </td>
                  <td>{b.category ?? <span className="muted">—</span>}</td>
                  <td>{b.location ?? <span className="muted">—</span>}</td>
                  <td>
                    {b.archived_at ? <span className="badge plain">בארכיון</span> : <StatusBadge status={b.status} />}
                    {!b.archived_at && b.holder_name && (
                      <span className="sub">{b.status === "loaned" ? "אצל" : "עבור"} {b.holder_name}</span>
                    )}
                  </td>
                  <td className="actions"><Link className="btn sm" to={`/admin/books/${b.id}`}>עריכה</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <p className="muted small" style={{ marginTop: 10 }}>{filtered.length} ספרים מוצגים · {books.length} רשומות בסך הכול</p>}
    </>
  );
}
