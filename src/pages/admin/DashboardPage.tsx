import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAction, useLoad, useToast } from "../../lib/hooks";
import { elapsedSince, errorText, fmtDate, fmtDateTime, fmtDay, isOverdue, timeLeft } from "../../lib/format";
import type { Loan, Reservation } from "../../lib/types";
import { ConfirmButton, Empty, ErrorNotice, Loading } from "../../components/ui";
import { FulfillDialog, NewLoanDialog } from "../../components/LoanDialogs";

async function loadDashboard() {
  // סימון שמירות שפג תוקפן. הזמינות עצמה אינה תלויה בכך.
  await supabase.rpc("expire_stale_reservations");
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const [loans, open, lapsed] = await Promise.all([
    supabase
      .from("loans")
      .select("*, book:books(id,title,author), borrower:borrowers(id,name,phone)")
      .is("returned_at", null)
      .order("loaned_at", { ascending: false }),
    supabase
      .from("reservation_requests")
      .select("*, book:books(id,title,author)")
      .in("status", ["pending", "approved"])
      .order("requested_at", { ascending: true }),
    supabase
      .from("reservation_requests")
      .select("*, book:books(id,title,author)")
      .eq("status", "expired")
      .gte("resolved_at", weekAgo)
      .order("requested_at", { ascending: true }),
  ]);
  if (loans.error) throw loans.error;
  if (open.error) throw open.error;
  if (lapsed.error) throw lapsed.error;
  return {
    loans: loans.data as Loan[],
    reservations: [...(open.data as Reservation[]), ...(lapsed.data as Reservation[])],
  };
}

export default function DashboardPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(loadDashboard);
  const { busy, run } = useAction();
  const [q, setQ] = useState("");
  const [loanOpen, setLoanOpen] = useState(false);
  const [fulfilling, setFulfilling] = useState<Reservation | null>(null);

  const now = new Date();
  const loans = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data?.loans ?? [];
    if (!needle) return list;
    return list.filter(
      (l) =>
        (l.book?.title ?? "").toLowerCase().includes(needle) ||
        (l.borrower?.name ?? "").toLowerCase().includes(needle),
    );
  }, [data, q]);
  const all = data?.reservations ?? [];
  const pending = all.filter((r) => r.status === "pending");
  const active = all.filter((r) => r.status === "approved" && r.expires_at && new Date(r.expires_at) > now);
  const expired = all.filter((r) => r.status === "expired" || (r.status === "approved" && !active.includes(r)));

  const rpc = (key: string, fn: string, args: Record<string, unknown>, done: string) =>
    run(key, async () => {
      const { error: err } = await supabase.rpc(fn, args);
      if (err) toast(errorText(err), "error");
      else toast(done);
      await reload();
    });

  return (
    <>
      <div className="page-head">
        <h1>אצל מי הספרים?</h1>
        <button type="button" className="btn accent" onClick={() => setLoanOpen(true)}>+ השאלה חדשה</button>
      </div>

      {loading && <Loading />}
      {error && <ErrorNotice text={error} onRetry={reload} />}

      {data && (
        <>
          {pending.length > 0 && (
            <section className="section" aria-labelledby="h-pending" style={{ marginTop: 0 }}>
              <h2 id="h-pending">בקשות שמירה ממתינות <span className="count">{pending.length}</span></h2>
              <div className="table-wrap">
                <table className="stack-sm">
                  <thead><tr><th>ספר</th><th>מבקשת</th><th>התקבלה</th><th><span className="sr-only">פעולות</span></th></tr></thead>
                  <tbody>
                    {pending.map((r) => (
                      <tr key={r.id}>
                        <td><Link to={`/admin/books/${r.book_id}`}>{r.book?.title}</Link></td>
                        <td>{r.requester_name}<span className="sub"><a dir="ltr" href={`tel:${r.requester_phone}`}>{r.requester_phone}</a></span></td>
                        <td>{fmtDateTime(r.requested_at)}</td>
                        <td className="actions">
                          <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                            <button
                              type="button" className="btn primary sm" disabled={busy !== null}
                              onClick={() => rpc(`a${r.id}`, "approve_reservation", { p_reservation_id: r.id }, "הבקשה אושרה. הספר שמור ל־48 שעות.")}
                            >
                              אישור ושמירה ל־48 שעות
                            </button>
                            <ConfirmButton
                              label="דחייה" confirmLabel="לדחות?" busy={busy !== null}
                              onConfirm={() => rpc(`r${r.id}`, "reject_reservation", { p_reservation_id: r.id }, "הבקשה נדחתה.")}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(active.length > 0 || expired.length > 0) && (
            <section className="section" aria-labelledby="h-active">
              <h2 id="h-active">שמירות פעילות <span className="count">{active.length}</span></h2>
              <div className="table-wrap">
                <table className="stack-sm">
                  <thead><tr><th>ספר</th><th>שמור עבור</th><th>תוקף</th><th><span className="sr-only">פעולות</span></th></tr></thead>
                  <tbody>
                    {active.map((r) => (
                      <tr key={r.id}>
                        <td><Link to={`/admin/books/${r.book_id}`}>{r.book?.title}</Link></td>
                        <td>{r.requester_name}<span className="sub"><a dir="ltr" href={`tel:${r.requester_phone}`}>{r.requester_phone}</a></span></td>
                        <td>{timeLeft(r.expires_at!, now)}<span className="sub">עד {fmtDateTime(r.expires_at!)}</span></td>
                        <td className="actions">
                          <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                            <button type="button" className="btn primary sm" onClick={() => setFulfilling(r)}>נמסר לקוראת</button>
                            <button
                              type="button" className="btn sm" disabled={busy !== null}
                              onClick={() => rpc(`e${r.id}`, "extend_reservation", { p_reservation_id: r.id, p_hours: 48 }, "השמירה הוארכה ב־48 שעות.")}
                            >
                              הארכה ב־48 שעות
                            </button>
                            <ConfirmButton
                              label="ביטול שמירה" confirmLabel="לבטל?" busy={busy !== null}
                              onConfirm={() => rpc(`c${r.id}`, "cancel_reservation", { p_reservation_id: r.id }, "השמירה בוטלה.")}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {expired.map((r) => (
                      <tr key={r.id}>
                        <td><Link to={`/admin/books/${r.book_id}`}>{r.book?.title}</Link></td>
                        <td>{r.requester_name}<span className="sub"><a dir="ltr" href={`tel:${r.requester_phone}`}>{r.requester_phone}</a></span></td>
                        <td><span className="badge plain">פג תוקף</span><span className="sub">{r.expires_at && fmtDateTime(r.expires_at)}</span></td>
                        <td className="actions">
                          <button
                            type="button" className="btn sm" disabled={busy !== null}
                            onClick={() => rpc(`x${r.id}`, "extend_reservation", { p_reservation_id: r.id, p_hours: 48 }, "השמירה חודשה ל־48 שעות.")}
                          >
                            חידוש ל־48 שעות
                          </button>
                        </td>
                      </tr>
                    ))}
                    {active.length === 0 && expired.length === 0 && (
                      <tr><td colSpan={4} className="muted">אין שמירות פעילות.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="section" aria-labelledby="h-loans">
            <h2 id="h-loans">ספרים מושאלים <span className="count">{data.loans.length}</span></h2>
            {data.loans.length > 0 && (
              <div className="toolbar">
                <div className="field grow">
                  <label htmlFor="dq">חיפוש לפי ספר או קוראת</label>
                  <input id="dq" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
              </div>
            )}
            {data.loans.length === 0 ? (
              <Empty>כל הספרים בבית. אין השאלות פעילות.</Empty>
            ) : loans.length === 0 ? (
              <Empty>לא נמצאה השאלה שמתאימה לחיפוש.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="stack-sm">
                  <thead><tr><th>ספר</th><th>אצל</th><th>הושאל</th><th>החזרה צפויה</th><th><span className="sr-only">פעולות</span></th></tr></thead>
                  <tbody>
                    {loans.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <Link to={`/admin/books/${l.book_id}`}>{l.book?.title}</Link>
                          {l.note && <span className="sub">הערה: {l.note}</span>}
                        </td>
                        <td>
                          <Link to={`/admin/borrowers/${l.borrower_id}`}>{l.borrower?.name}</Link>
                          <span className="sub"><a dir="ltr" href={`tel:${l.borrower?.phone}`}>{l.borrower?.phone}</a></span>
                        </td>
                        <td>{elapsedSince(l.loaned_at, now)}<span className="sub">{fmtDate(l.loaned_at)}</span></td>
                        <td>
                          {l.due_date ? (
                            <>
                              {fmtDay(l.due_date)}{" "}
                              {isOverdue(l.due_date, now) && <span className="badge overdue">באיחור</span>}
                            </>
                          ) : (
                            <span className="muted">לא נקבע</span>
                          )}
                        </td>
                        <td className="actions">
                          <ConfirmButton
                            label="החזרה" confirmLabel="לאשר החזרה" className="btn primary sm" busy={busy !== null}
                            onConfirm={() => rpc(`ret${l.id}`, "return_loan", { p_loan_id: l.id }, `„${l.book?.title}” הוחזר.`)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <NewLoanDialog open={loanOpen} onClose={() => setLoanOpen(false)} onDone={reload} />
      <FulfillDialog reservation={fulfilling} onClose={() => setFulfilling(null)} onDone={reload} />
    </>
  );
}
