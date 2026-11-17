import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { callFunction, checkAi, type AiStatus } from "../lib/supabase";
import { aiErrorText } from "../lib/format";
import type { CatalogBook } from "../lib/types";
import { Cover, Loading, StatusBadge } from "../components/ui";

interface RecResponse {
  status: "ok" | "empty_catalog";
  enough_information?: boolean;
  message?: string;
  recommendations?: { book: CatalogBook; reason: string }[];
}

export function AiNotReady({ status, feature }: { status: AiStatus; feature: string }) {
  if (status !== "not_configured" && status !== "not_deployed") return null;
  return (
    <div className="notice warn" role="status">
      <h3>{feature} — לא מוגדר</h3>
      {status === "not_deployed"
        ? "פונקציית השרת של התכונה הזו לא נפרסה עדיין, ולכן היא אינה פעילה."
        : "פונקציית השרת פרוסה, אך לא הוגדר מפתח לספק ה־AI (ANTHROPIC_API_KEY), ולכן התכונה אינה פעילה."}
    </div>
  );
}

export default function RecommendPage() {
  const [ai, setAi] = useState<AiStatus>("checking");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecResponse | null>(null);

  useEffect(() => {
    void checkAi("recommend-books").then(setAi);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const text = query.trim();
    if (text.length < 3) return setError("נא לתאר בכמה מילים מה מחפשים.");
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await callFunction<RecResponse>("recommend-books", { query: text });
    if (res.ok) setResult(res.data);
    else setError(aiErrorText(res.code));
    setBusy(false);
  };

  const recs = result?.recommendations ?? [];

  return (
    <div style={{ maxWidth: 760 }}>
      <h1>עזרה בבחירת ספר</h1>
      <p className="muted">
        תארי במילים שלך מה מתחשק לקרוא, ונציע ספרים מתוך הקטלוג בלבד, על סמך הפרטים שרשומים בו.
      </p>

      {ai === "checking" && <Loading text="בודק את זמינות השירות…" />}
      <AiNotReady status={ai} feature="המלצות" />
      {(ai === "not_configured" || ai === "not_deployed") && (
        <p>בינתיים אפשר <Link to="/">לחפש ולסנן בקטלוג</Link>.</p>
      )}

      {ai === "ready" && (
        <form className="card" onSubmit={submit}>
          <div className="field">
            <label htmlFor="rq">מה מחפשים?</label>
            <textarea
              id="rq" maxLength={500} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="למשל: ספר קריאה לבת עשר שאוהבת סיפורי הרפתקאות"
            />
          </div>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "מחפשת…" : "הצעת ספרים"}</button>
        </form>
      )}

      {busy && <Loading text="עוברת על הקטלוג…" />}
      {error && <div className="notice error section" role="alert">{error}</div>}

      {result?.status === "empty_catalog" && (
        <div className="notice section">עדיין אין ספרים בקטלוג, ולכן אין על מה להמליץ.</div>
      )}

      {result?.status === "ok" && (
        <div className="section" aria-live="polite">
          {result.message && (
            <div className={`notice ${result.enough_information ? "" : "warn"}`}>{result.message}</div>
          )}
          {!result.enough_information && (
            <p>
              אין בקטלוג מספיק מידע כדי להמליץ בביטחון על הבקשה הזו. אפשר{" "}
              <Link to="/">לחפש לפי שם או מחבר, או לסנן לפי קטגוריה וקהל יעד</Link>.
            </p>
          )}
          {recs.length > 0 && (
            <div className="card">
              {recs.map(({ book, reason }) => (
                <div key={book.id} className="rec-item">
                  <Link to={`/book/${book.id}`} tabIndex={-1} aria-hidden="true">
                    <Cover title={book.title} author={book.author} url={book.cover_url} />
                  </Link>
                  <div>
                    <h3><Link to={`/book/${book.id}`}>{book.title}</Link></h3>
                    {book.author && <div className="muted small">{book.author}</div>}
                    <p style={{ margin: "6px 0" }}>{reason}</p>
                    <StatusBadge status={book.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
