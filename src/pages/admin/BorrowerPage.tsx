import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAction, useLoad, useToast } from "../../lib/hooks";
import { elapsedSince, errorText, fmtDate, fmtDay, isOverdue, normalizePhone } from "../../lib/format";
import type { Borrower, Loan } from "../../lib/types";
import { ConfirmButton, ErrorNotice, Loading } from "../../components/ui";

async function load(id: string) {
  const [borrower, loans] = await Promise.all([
    supabase.from("borrowers").select("*").eq("id", id).maybeSingle(),
    supabase.from("loans").select("*, book:books(id,title,author)").eq("borrower_id", id).order("loaned_at", { ascending: false }),
  ]);
  if (borrower.error) throw borrower.error;
  if (loans.error) throw loans.error;
  return { borrower: borrower.data as Borrower | null, loans: loans.data as Loan[] };
}

export default function BorrowerPage() {
  const { id } = useParams();
  const toast = useToast();
  const { busy, run } = useAction();
  const { data, error, loading, reload } = useLoad(() => load(id!), [id]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const borrower = data?.borrower ?? null;
  useEffect(() => {
    if (!borrower) return;
    setName(borrower.name);
    setPhone(borrower.phone);
    setEmail(borrower.email ?? "");
  }, [borrower]);

  if (loading) return <Loading />;
  if (error) return <ErrorNotice text={error} onRetry={reload} />;
  if (!borrower) return <div className="empty">הקוראת לא נמצאה. <Link to="/admin/borrowers">חזרה לרשימה</Link></div>;

  const active = data!.loans.filter((l) => !l.returned_at);
  const history = data!.loans.filter((l) => l.returned_at);

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run("save", async () => {
      if (!name.trim()) return setFormError("נא למלא שם.");
      if (normalizePhone(phone).length < 9) return setFormError("נא למלא מספר טלפון תקין.");
      setFormError(null);
      const { error: err } = await supabase
        .from("borrowers").update({ name: name.trim(), phone: phone.trim(), email: email.trim() || null }).eq("id", id);
      if (err) return setFormError(errorText(err));
      toast("הפרטים נשמרו.");
      await reload();
    });
  };

  const returnLoan = (loan: Loan) =>
    run(`ret${loan.id}`, async () => {
      const { error: err } = await supabase.rpc("return_loan", { p_loan_id: loan.id });
      if (err) toast(errorText(err), "error");
      else toast(`„${loan.book?.title}” הוחזר.`);
      await reload();
    });

  return (
    <>
      <p><Link to="/admin/borrowers">→ כל הקוראות</Link></p>
      <h1>{borrower.name}</h1>

      <form className="card" onSubmit={save}>
        <h2>פרטים</h2>
        {formError && <div className="notice error" role="alert">{formError}</div>}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="b-name">שם</label>
            <input id="b-name" type="text" maxLength={120} required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="b-phone">טלפון</label>
            <input id="b-phone" type="tel" dir="ltr" maxLength={30} required value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="b-email">דוא״ל <span className="hint">(רשות)</span></label>
            <input id="b-email" type="email" dir="ltr" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <button type="submit" className="btn primary" disabled={busy !== null}>{busy === "save" ? "שומרת…" : "שמירה"}</button>
      </form>

      <section className="section">
        <h2>ספרים אצלה כעת <span className="count">{active.length}</span></h2>
        {active.length === 0 ? (
          <p className="muted">אין השאלות פעילות.</p>
        ) : (
          <div className="table-wrap">
            <table className="stack-sm">
              <thead><tr><th>ספר</th><th>הושאל</th><th>החזרה צפויה</th><th><span className="sr-only">פעולות</span></th></tr></thead>
              <tbody>
                {active.map((l) => (
                  <tr key={l.id}>
                    <td><Link to={`/admin/books/${l.book_id}`}>{l.book?.title}</Link>{l.note && <span className="sub">הערה: {l.note}</span>}</td>
                    <td>{elapsedSince(l.loaned_at)}<span className="sub">{fmtDate(l.loaned_at)}</span></td>
                    <td>
                      {l.due_date
                        ? <>{fmtDay(l.due_date)} {isOverdue(l.due_date) && <span className="badge overdue">באיחור</span>}</>
                        : <span className="muted">לא נקבע</span>}
                    </td>
                    <td className="actions">
                      <ConfirmButton label="החזרה" confirmLabel="לאשר החזרה" className="btn primary sm" busy={busy !== null} onConfirm={() => returnLoan(l)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <h2>היסטוריה <span className="count">{history.length}</span></h2>
        {history.length === 0 ? (
          <p className="muted">עדיין אין השאלות שהסתיימו.</p>
        ) : (
          <div className="table-wrap">
            <table className="stack-sm">
              <thead><tr><th>ספר</th><th>הושאל</th><th>הוחזר</th></tr></thead>
              <tbody>
                {history.map((l) => (
                  <tr key={l.id}>
                    <td><Link to={`/admin/books/${l.book_id}`}>{l.book?.title}</Link></td>
                    <td>{fmtDate(l.loaned_at)}</td>
                    <td>{fmtDate(l.returned_at!)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
