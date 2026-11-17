import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, useLoad } from "../lib/hooks";
import { normalizePhone } from "../lib/format";
import type { CatalogBook } from "../lib/types";
import { Cover, ErrorNotice, Loading, StatusBadge } from "../components/ui";

type FormState = "idle" | "sending" | "sent" | "unavailable" | "rate_limited" | "error";

function ReservationForm({ book, onChanged }: { book: CatalogBook; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    const cleanName = name.trim();
    const digits = normalizePhone(phone);
    if (cleanName.length < 2) return setFieldError("נא למלא שם מלא.");
    if (digits.length < 9 || digits.length > 15) return setFieldError("נא למלא מספר טלפון תקין.");
    setFieldError(null);
    setState("sending");
    const { data, error } = await supabase.rpc("request_reservation", {
      p_book_id: book.id, p_name: cleanName, p_phone: phone.trim(),
    });
    if (error) return setState("error");
    if (data === "ok") return setState("sent");
    if (data === "invalid") {
      setFieldError("הפרטים שהוזנו אינם תקינים. נא לבדוק את השם ואת מספר הטלפון.");
      return setState("idle");
    }
    if (data === "unavailable") {
      onChanged();
      return setState("unavailable");
    }
    setState(data === "rate_limited" ? "rate_limited" : "error");
  };

  if (state === "sent") {
    return (
      <div className="notice ok" role="status">
        <h3>הבקשה התקבלה</h3>
        הבקשה התקבלה וממתינה לאישור. לאחר האישור הספר יישמר עבורך ליומיים.
      </div>
    );
  }
  if (state === "unavailable") {
    return <div className="notice warn" role="status">הספר כבר אינו פנוי כרגע, ולכן לא ניתן לבקש לשמור אותו.</div>;
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>בקשה לשמירת הספר</h2>
      <p className="muted small">אין צורך בחשבון. הפרטים גלויים למנהלת הספרייה בלבד, לצורך תיאום.</p>
      {fieldError && <div className="notice error" role="alert">{fieldError}</div>}
      {state === "rate_limited" && (
        <div className="notice warn" role="alert">נשלחו יותר מדי בקשות בזמן קצר. אפשר לנסות שוב מאוחר יותר.</div>
      )}
      {state === "error" && <div className="notice error" role="alert">שליחת הבקשה נכשלה. נסי שוב בעוד רגע.</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="r-name">שם מלא</label>
          <input id="r-name" type="text" autoComplete="name" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="r-phone">טלפון</label>
          <input id="r-phone" type="tel" dir="ltr" autoComplete="tel" maxLength={30} required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <button className="btn accent" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "שולחת…" : "שליחת בקשה"}
      </button>
    </form>
  );
}

export default function BookPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const { data: book, error, loading, reload } = useLoad(async () => {
    const { data, error } = await supabase.from("catalog").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as CatalogBook | null) ?? "missing";
  }, [id]);

  if (loading) return <Loading />;
  if (error) return <ErrorNotice text={error} onRetry={reload} />;
  if (!book || book === "missing") {
    return <div className="empty">הספר לא נמצא בקטלוג. <Link to="/">חזרה לקטלוג</Link></div>;
  }

  return (
    <>
      <p><Link to="/">→ חזרה לקטלוג</Link></p>
      <div className="book-detail">
        <Cover title={book.title} author={book.author} url={book.cover_url} />
        <div>
          <h1>{book.title}</h1>
          {book.author && <p className="muted" style={{ fontSize: "1.15rem" }}>{book.author}</p>}
          <div className="btn-row">
            <StatusBadge status={book.status} />
            {book.is_sample && <span className="badge plain">נתוני דוגמה</span>}
            {isAdmin && <Link className="btn sm" to={`/admin/books/${book.id}`}>עריכה</Link>}
          </div>
          <dl className="meta">
            {book.category && (<><dt>קטגוריה</dt><dd>{book.category}</dd></>)}
            {book.audience && (<><dt>קהל יעד</dt><dd>{book.audience}</dd></>)}
            {book.language && (<><dt>שפה</dt><dd>{book.language}</dd></>)}
            {book.series && (
              <><dt>סדרה</dt><dd>{book.series}{book.series_number != null && ` · ספר ${book.series_number}`}</dd></>
            )}
          </dl>
          {book.tags.length > 0 && (
            <div className="tags">{book.tags.map((t) => <span key={t} className="badge plain">{t}</span>)}</div>
          )}
          {book.summary
            ? <p style={{ marginTop: 14, whiteSpace: "pre-line" }}>{book.summary}</p>
            : <p className="muted" style={{ marginTop: 14 }}>לא נוסף תקציר לספר הזה.</p>}

          <div className="section">
            {book.status === "available" && <ReservationForm book={book} onChanged={reload} />}
            {book.status === "reserved" && <div className="notice">הספר שמור כרגע. אפשר לבדוק שוב בעוד כמה ימים.</div>}
            {book.status === "loaned" && <div className="notice">הספר מושאל כרגע. אפשר לבדוק שוב מאוחר יותר.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
