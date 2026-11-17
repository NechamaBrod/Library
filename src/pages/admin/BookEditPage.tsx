import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAction, useLoad, useToast } from "../../lib/hooks";
import { errorText, fmtDate, resizeImage } from "../../lib/format";
import type { AdminBook, Loan } from "../../lib/types";
import { ConfirmButton, Cover, ErrorNotice, Loading, StatusBadge } from "../../components/ui";
import { NewLoanDialog } from "../../components/LoanDialogs";

const CATEGORIES = ["סיפורת", "ילדים", "נוער", "עיון", "יהדות", "ביוגרפיה", "היסטוריה", "בישול", "הורות וחינוך", "לימוד והעשרה"];
const AUDIENCES = ["פעוטות", "ילדים", "נוער", "מבוגרים", "כל המשפחה"];

const blank = {
  title: "", author: "", summary: "", category: "", audience: "", language: "עברית",
  series: "", series_number: "", tags: "", location: "", cover_url: "" as string | null,
};
type Form = typeof blank;

async function loadBook(id: string) {
  const [book, loans] = await Promise.all([
    supabase.from("admin_books").select("*").eq("id", id).maybeSingle(),
    supabase.from("loans").select("*, borrower:borrowers(id,name,phone)").eq("book_id", id).order("loaned_at", { ascending: false }),
  ]);
  if (book.error) throw book.error;
  if (loans.error) throw loans.error;
  return { book: book.data as AdminBook | null, loans: loans.data as Loan[] };
}

export default function BookEditPage() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const toast = useToast();
  const { busy, run } = useAction();
  const { data, error, loading, reload } = useLoad(
    async () => (isNew ? { book: null, loans: [] as Loan[] } : loadBook(id!)),
    [id],
  );
  const [form, setForm] = useState<Form>(blank);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loanOpen, setLoanOpen] = useState(false);

  const book = data?.book ?? null;
  useEffect(() => {
    if (isNew) return setForm(blank);
    if (!book) return;
    setForm({
      title: book.title, author: book.author ?? "", summary: book.summary ?? "",
      category: book.category ?? "", audience: book.audience ?? "", language: book.language,
      series: book.series ?? "", series_number: book.series_number?.toString() ?? "",
      tags: book.tags.join(", "), location: book.location ?? "", cover_url: book.cover_url,
    });
  }, [book, isNew]);

  const set = (key: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const uploadCover = async (file: File | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    setFormError(null);
    try {
      const blob = await resizeImage(file, 900, 1024 * 1024);
      const path = `${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from("covers").upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      setForm((f) => ({ ...f, cover_url: supabase.storage.from("covers").getPublicUrl(path).data.publicUrl }));
    } catch (e) {
      const msg = (e as Error).message;
      setFormError(
        msg === "UNREADABLE_IMAGE"
          ? "לא ניתן לקרוא את קובץ התמונה. נסי קובץ JPG או PNG."
          : "העלאת הכריכה נכשלה. ייתכן שאחסון הקבצים (Storage) לא הוגדר עדיין.",
      );
    } finally {
      setUploading(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run("save", async () => {
      if (!form.title.trim()) return setFormError("שם הספר הוא שדה חובה.");
      const seriesNumber = form.series_number.trim() ? Number(form.series_number) : null;
      if (seriesNumber !== null && (!Number.isInteger(seriesNumber) || seriesNumber < 0)) {
        return setFormError("מספר בסדרה צריך להיות מספר שלם.");
      }
      setFormError(null);
      const row = {
        title: form.title.trim(),
        author: form.author.trim() || null,
        summary: form.summary.trim() || null,
        category: form.category.trim() || null,
        audience: form.audience.trim() || null,
        language: form.language.trim() || "עברית",
        series: form.series.trim() || null,
        series_number: form.series.trim() ? seriesNumber : null,
        tags: [...new Set(form.tags.split(",").map((t) => t.trim()).filter(Boolean))],
        location: form.location.trim() || null,
        cover_url: form.cover_url || null,
      };
      if (isNew) {
        const { data: created, error: err } = await supabase.from("books").insert(row).select("id").single();
        if (err) return setFormError(errorText(err));
        toast("הספר נוסף לקטלוג.");
        navigate(`/admin/books/${created.id}`, { replace: true });
      } else {
        const { error: err } = await supabase.from("books").update(row).eq("id", id);
        if (err) return setFormError(errorText(err));
        toast("השינויים נשמרו.");
        await reload();
      }
    });
  };

  const setArchived = (archived: boolean) =>
    run("archive", async () => {
      const { error: err } = await supabase
        .from("books").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
      if (err) toast(errorText(err), "error");
      else toast(archived ? "הספר הועבר לארכיון." : "הספר הוחזר לקטלוג.");
      await reload();
    });

  if (loading) return <Loading />;
  if (error) return <ErrorNotice text={error} onRetry={reload} />;
  if (!isNew && !book) return <div className="empty">הספר לא נמצא. <Link to="/admin/books">חזרה לרשימה</Link></div>;

  const inUse = book ? book.status !== "available" : false;

  return (
    <>
      <p><Link to="/admin/books">→ כל הספרים</Link></p>
      <div className="page-head">
        <h1>{isNew ? "ספר חדש" : book!.title}</h1>
        {book && (
          <div className="btn-row">
            {book.archived_at ? <span className="badge plain">בארכיון</span> : <StatusBadge status={book.status} />}
            {book.holder_name && !book.archived_at && (
              <span className="muted">{book.status === "loaned" ? "אצל" : "שמור עבור"} {book.holder_name}</span>
            )}
            {!book.archived_at && book.status !== "loaned" && (
              <button type="button" className="btn accent sm" onClick={() => setLoanOpen(true)}>השאלה</button>
            )}
          </div>
        )}
      </div>

      <form className="card" onSubmit={save}>
        {formError && <div className="notice error" role="alert">{formError}</div>}
        <div className="form-grid">
          <div className="field wide">
            <label htmlFor="f-title">שם הספר</label>
            <input id="f-title" type="text" required maxLength={300} value={form.title} onChange={set("title")} />
          </div>
          <div className="field">
            <label htmlFor="f-author">מחבר <span className="hint">(רשות)</span></label>
            <input id="f-author" type="text" maxLength={200} value={form.author} onChange={set("author")} />
          </div>
          <div className="field">
            <label htmlFor="f-location">מיקום בבית <span className="hint">(למנהלת בלבד)</span></label>
            <input id="f-location" type="text" maxLength={200} value={form.location} onChange={set("location")} placeholder="למשל: סלון, מדף שני" />
          </div>
          <div className="field">
            <label htmlFor="f-category">קטגוריה</label>
            <input id="f-category" type="text" list="categories" maxLength={80} value={form.category} onChange={set("category")} />
            <datalist id="categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="field">
            <label htmlFor="f-audience">קהל יעד</label>
            <input id="f-audience" type="text" list="audiences" maxLength={80} value={form.audience} onChange={set("audience")} />
            <datalist id="audiences">{AUDIENCES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="field">
            <label htmlFor="f-language">שפה</label>
            <input id="f-language" type="text" maxLength={40} value={form.language} onChange={set("language")} />
          </div>
          <div className="field">
            <label htmlFor="f-series">סדרה <span className="hint">(אם רלוונטי)</span></label>
            <input id="f-series" type="text" maxLength={200} value={form.series} onChange={set("series")} />
          </div>
          <div className="field">
            <label htmlFor="f-series-n">מספר בסדרה</label>
            <input id="f-series-n" type="number" min={0} max={9999} value={form.series_number} onChange={set("series_number")} disabled={!form.series.trim()} />
          </div>
          <div className="field wide">
            <label htmlFor="f-tags">תגיות <span className="hint">(מופרדות בפסיקים; משמשות גם להמלצות)</span></label>
            <input id="f-tags" type="text" value={form.tags} onChange={set("tags")} />
          </div>
          <div className="field wide">
            <label htmlFor="f-summary">תקציר</label>
            <textarea id="f-summary" maxLength={5000} value={form.summary} onChange={set("summary")} />
          </div>
          <div className="field wide">
            <label htmlFor="f-cover">תמונת כריכה <span className="hint">(רשות)</span></label>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 90 }}>
                <Cover title={form.title || "שם הספר"} author={form.author} url={form.cover_url} />
              </div>
              <div>
                <input id="f-cover" type="file" accept="image/*" disabled={uploading} onChange={(e) => void uploadCover(e.target.files?.[0])} />
                {uploading && <p className="muted small">מעלה…</p>}
                {form.cover_url && (
                  <p><button type="button" className="btn sm" onClick={() => setForm((f) => ({ ...f, cover_url: null }))}>הסרת הכריכה</button></p>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="btn-row">
          <button type="submit" className="btn primary" disabled={busy !== null || uploading}>
            {busy === "save" ? "שומרת…" : isNew ? "הוספה לקטלוג" : "שמירת שינויים"}
          </button>
          <Link className="btn" to="/admin/books">ביטול</Link>
        </div>
      </form>

      {book && (
        <>
          <section className="section">
            <h2>היסטוריית השאלות <span className="count">{data!.loans.length}</span></h2>
            {data!.loans.length === 0 ? (
              <p className="muted">הספר עדיין לא הושאל.</p>
            ) : (
              <div className="table-wrap">
                <table className="stack-sm">
                  <thead><tr><th>קוראת</th><th>הושאל</th><th>הוחזר</th><th>הערה</th></tr></thead>
                  <tbody>
                    {data!.loans.map((l) => (
                      <tr key={l.id}>
                        <td><Link to={`/admin/borrowers/${l.borrower_id}`}>{l.borrower?.name}</Link></td>
                        <td>{fmtDate(l.loaned_at)}</td>
                        <td>{l.returned_at ? fmtDate(l.returned_at) : <span className="badge loaned">אצל הקוראת</span>}</td>
                        <td>{l.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="section card">
            <h2>ארכיון</h2>
            {book.archived_at ? (
              <>
                <p>הספר בארכיון מאז {fmtDate(book.archived_at)} ואינו מוצג בקטלוג. ההיסטוריה שלו נשמרת.</p>
                <button type="button" className="btn" disabled={busy !== null} onClick={() => setArchived(false)}>החזרה לקטלוג</button>
              </>
            ) : inUse ? (
              <p className="muted">אי אפשר לארכב ספר שיש לו השאלה או שמירה פעילה.</p>
            ) : (
              <>
                <p className="muted">ספר בארכיון אינו מוצג בקטלוג, אך היסטוריית ההשאלות שלו נשמרת.</p>
                <ConfirmButton label="העברה לארכיון" confirmLabel="לארכב את הספר?" className="btn danger" busy={busy !== null} onConfirm={() => setArchived(true)} />
              </>
            )}
          </section>
          <NewLoanDialog open={loanOpen} onClose={() => setLoanOpen(false)} onDone={reload} presetBookId={book.id} />
        </>
      )}
    </>
  );
}
