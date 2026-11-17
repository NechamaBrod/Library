import { useEffect, useMemo, useState } from "react";
import { fetchAll, supabase } from "../lib/supabase";
import { useAction, useToast } from "../lib/hooks";
import { errorText, fmtDateTime, jerusalemDay } from "../lib/format";
import type { AdminBook, Borrower, Reservation } from "../lib/types";
import { Dialog, StatusBadge } from "./ui";
import BorrowerPicker from "./BorrowerPicker";

function LoanExtras({
  due, setDue, note, setNote,
}: { due: string; setDue: (v: string) => void; note: string; setNote: (v: string) => void }) {
  return (
    <div className="form-grid" style={{ marginTop: 14 }}>
      <div className="field">
        <label htmlFor="ln-due">מועד החזרה צפוי <span className="hint">(רשות)</span></label>
        <input id="ln-due" type="date" min={jerusalemDay()} value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <div className="field wide">
        <label htmlFor="ln-note">הערה פרטית <span className="hint">(רשות)</span></label>
        <input id="ln-note" type="text" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </div>
  );
}

/** השאלה חדשה: בחירת ספר וקוראת. תאריך ההשאלה נקבע אוטומטית בשרת. */
export function NewLoanDialog({
  open, onClose, onDone, presetBookId,
}: { open: boolean; onClose: () => void; onDone: () => void; presetBookId?: string }) {
  const toast = useToast();
  const { busy, run } = useAction();
  const [books, setBooks] = useState<AdminBook[] | null>(null);
  const [q, setQ] = useState("");
  const [book, setBook] = useState<AdminBook | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [resChoice, setResChoice] = useState<"" | "fulfill" | "cancel">("");
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQ(""); setBook(null); setReservation(null); setResChoice(""); setBorrower(null);
    setDue(""); setNote(""); setError(null); setBooks(null);
    fetchAll<AdminBook>("admin_books", "*", { column: "title" })
      .then((list) => {
        const active = list.filter((b) => !b.archived_at);
        setBooks(active);
        if (presetBookId) setBook(active.find((b) => b.id === presetBookId) ?? null);
      })
      .catch((e) => setError(errorText(e)));
  }, [open, presetBookId]);

  // ספר שמור: טוענים את השמירה כדי לדרוש החלטה מפורשת
  useEffect(() => {
    setReservation(null);
    setResChoice("");
    if (!book || book.status !== "reserved") return;
    supabase
      .from("reservation_requests").select("*").eq("book_id", book.id).eq("status", "approved")
      .gt("expires_at", new Date().toISOString()).maybeSingle()
      .then(({ data }) => setReservation((data as Reservation | null) ?? null));
  }, [book]);

  const results = useMemo(() => {
    if (!books) return [];
    const needle = q.trim().toLowerCase();
    return (needle
      ? books.filter((b) => b.title.toLowerCase().includes(needle) || (b.author ?? "").toLowerCase().includes(needle))
      : books
    ).slice(0, 30);
  }, [books, q]);

  const needsChoice = book?.status === "reserved";
  const canSubmit = Boolean(book && borrower && book.status !== "loaned" && (!needsChoice || (reservation && resChoice)));

  const submit = () =>
    run("loan", async () => {
      if (!book || !borrower) return;
      setError(null);
      const { error: err } = await supabase.rpc("create_loan", {
        p_book_id: book.id,
        p_borrower_id: borrower.id,
        p_due_date: due || null,
        p_note: note || null,
        p_reservation_id: resChoice === "fulfill" ? reservation?.id ?? null : null,
        p_cancel_reservation: resChoice === "cancel",
      });
      if (err) return setError(errorText(err));
      toast(`„${book.title}” הושאל ל${borrower.name}.`);
      onDone();
      onClose();
    });

  return (
    <Dialog
      title="השאלה חדשה" open={open} onClose={onClose}
      footer={
        <>
          <button type="button" className="btn primary" disabled={!canSubmit || busy !== null} onClick={submit}>
            {busy ? "רושמת…" : "רישום השאלה"}
          </button>
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
        </>
      }
    >
      {error && <div className="notice error" role="alert">{error}</div>}

      <div className="field">
        {book ? (
          <>
            <label>ספר</label>
            <div className="chosen">
              <span><strong>{book.title}</strong>{book.author && ` · ${book.author}`} <StatusBadge status={book.status} /></span>
              <button type="button" className="btn sm" onClick={() => setBook(null)}>החלפה</button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="ln-book">ספר</label>
            <input id="ln-book" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם ספר או מחבר" />
            {!books && !error && <p className="muted small">טוען ספרים…</p>}
            {books && results.length === 0 && <p className="muted small">לא נמצא ספר מתאים.</p>}
            {results.length > 0 && (
              <ul className="pick-list">
                {results.map((b) => (
                  <li key={b.id}>
                    <button type="button" disabled={b.status === "loaned"} onClick={() => setBook(b)}>
                      <span>{b.title}{b.author && <span className="muted"> · {b.author}</span>}</span>
                      <span className="btn-row">
                        {b.status === "loaned" && b.holder_name && <span className="small">אצל {b.holder_name}</span>}
                        <StatusBadge status={b.status} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {book?.status === "loaned" && (
        <div className="notice error" role="alert">
          הספר מושאל כרגע{book.holder_name && ` אצל ${book.holder_name}`}. יש לרשום החזרה לפני השאלה נוספת.
        </div>
      )}

      {needsChoice && (
        <fieldset>
          <legend>הספר שמור</legend>
          {reservation ? (
            <>
              <p>
                שמור עבור <strong>{reservation.requester_name}</strong> (<span dir="ltr">{reservation.requester_phone}</span>)
                עד {fmtDateTime(reservation.expires_at!)}. מה לעשות עם השמירה?
              </p>
              <label className="radio">
                <input type="radio" name="res-choice" checked={resChoice === "fulfill"} onChange={() => setResChoice("fulfill")} />
                <span>ההשאלה היא למבקשת השמירה — לסמן את השמירה כ„נמסר”.</span>
              </label>
              <label className="radio">
                <input type="radio" name="res-choice" checked={resChoice === "cancel"} onChange={() => setResChoice("cancel")} />
                <span>לבטל את השמירה ולהשאיל לקוראת אחרת.</span>
              </label>
            </>
          ) : (
            <p className="muted">טוען את פרטי השמירה…</p>
          )}
        </fieldset>
      )}

      {book && book.status !== "loaned" && (
        <>
          <BorrowerPicker
            key={`${book.id}-${resChoice}`}
            value={borrower}
            onChange={setBorrower}
            suggestNew={
              resChoice === "fulfill" && reservation
                ? { name: reservation.requester_name, phone: reservation.requester_phone }
                : undefined
            }
          />
          <LoanExtras due={due} setDue={setDue} note={note} setNote={setNote} />
        </>
      )}
    </Dialog>
  );
}

/** "נמסר לקוראת": המרת שמירה מאושרת להשאלה */
export function FulfillDialog({
  reservation, onClose, onDone,
}: { reservation: Reservation | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { busy, run } = useAction();
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBorrower(null); setDue(""); setNote(""); setError(null);
  }, [reservation?.id]);

  const submit = () =>
    run("fulfill", async () => {
      if (!reservation || !borrower) return;
      setError(null);
      const { error: err } = await supabase.rpc("fulfill_reservation", {
        p_reservation_id: reservation.id,
        p_borrower_id: borrower.id,
        p_due_date: due || null,
        p_note: note || null,
      });
      if (err) return setError(errorText(err));
      toast(`הספר נמסר ל${borrower.name} ונרשם כהשאלה.`);
      onDone();
      onClose();
    });

  return (
    <Dialog
      title="נמסר לקוראת" open={reservation !== null} onClose={onClose}
      footer={
        <>
          <button type="button" className="btn primary" disabled={!borrower || busy !== null} onClick={submit}>
            {busy ? "רושמת…" : "אישור מסירה ורישום השאלה"}
          </button>
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
        </>
      }
    >
      {reservation && (
        <>
          {error && <div className="notice error" role="alert">{error}</div>}
          <p>
            הספר <strong>{reservation.book?.title}</strong> נשמר עבור <strong>{reservation.requester_name}</strong>{" "}
            (<span dir="ltr">{reservation.requester_phone}</span>). השמירה תהפוך להשאלה.
          </p>
          <BorrowerPicker
            key={reservation.id}
            value={borrower}
            onChange={setBorrower}
            suggestNew={{ name: reservation.requester_name, phone: reservation.requester_phone }}
          />
          <LoanExtras due={due} setDue={setDue} note={note} setNote={setNote} />
        </>
      )}
    </Dialog>
  );
}
