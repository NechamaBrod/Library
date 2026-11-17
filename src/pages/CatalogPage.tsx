import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAll } from "../lib/supabase";
import { useLoad } from "../lib/hooks";
import { STATUS_LABEL, type Availability, type CatalogBook } from "../lib/types";
import { Cover, Empty, ErrorNotice, Loading, StatusBadge } from "../components/ui";

const uniq = (values: (string | null)[]) =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, "he"));

export function BookCard({ book }: { book: CatalogBook }) {
  return (
    <Link to={`/book/${book.id}`} className="book-card">
      <Cover title={book.title} author={book.author} url={book.cover_url} />
      <div>
        <div className="t">{book.title}</div>
        {book.author && <div className="a">{book.author}</div>}
      </div>
      <div className="btn-row">
        <StatusBadge status={book.status} />
        {book.is_sample && <span className="badge plain">דוגמה</span>}
      </div>
    </Link>
  );
}

export default function CatalogPage() {
  const { data, error, loading, reload } = useLoad(
    () => fetchAll<CatalogBook>("catalog", "*", { column: "title" }),
  );
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [audience, setAudience] = useState("");
  const [status, setStatus] = useState<"" | Availability>("");

  const books = data ?? [];
  const categories = useMemo(() => uniq(books.map((b) => b.category)), [books]);
  const audiences = useMemo(() => uniq(books.map((b) => b.audience)), [books]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return books.filter(
      (b) =>
        (!needle || b.title.toLowerCase().includes(needle) || (b.author ?? "").toLowerCase().includes(needle)) &&
        (!category || b.category === category) &&
        (!audience || b.audience === audience) &&
        (!status || b.status === status),
    );
  }, [books, q, category, audience, status]);

  const hasFilters = Boolean(q || category || audience || status);

  return (
    <>
      <div className="page-head">
        <h1>קטלוג הספרים</h1>
        {data && <span className="muted">{filtered.length} מתוך {books.length} ספרים</span>}
      </div>

      <form className="toolbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="field grow">
          <label htmlFor="q">חיפוש לפי שם ספר או מחבר</label>
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="למשל: שם הספר" />
        </div>
        <div className="field">
          <label htmlFor="cat">קטגוריה</label>
          <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">הכול</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="aud">קהל יעד</label>
          <select id="aud" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="">הכול</option>
            {audiences.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="st">זמינות</label>
          <select id="st" value={status} onChange={(e) => setStatus(e.target.value as "" | Availability)}>
            <option value="">הכול</option>
            {(Object.keys(STATUS_LABEL) as Availability[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setQ("");
              setCategory("");
              setAudience("");
              setStatus("");
            }}
          >
            ניקוי
          </button>
        )}
      </form>

      {loading && <Loading text="טוען את הקטלוג…" />}
      {error && <ErrorNotice text={error} onRetry={reload} />}
      {data && books.length === 0 && <Empty>עדיין אין ספרים בקטלוג.</Empty>}
      {data && books.length > 0 && filtered.length === 0 && (
        <Empty>לא נמצאו ספרים שמתאימים לחיפוש. אפשר לנסות מילה אחרת או לנקות את הסינון.</Empty>
      )}
      {filtered.length > 0 && (
        <ul className="book-grid">
          {filtered.map((b) => (
            <li key={b.id}><BookCard book={b} /></li>
          ))}
        </ul>
      )}
    </>
  );
}
