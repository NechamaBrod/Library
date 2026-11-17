import { useEffect, useMemo, useState } from "react";
import { fetchAll, supabase } from "../lib/supabase";
import { errorText, normalizePhone } from "../lib/format";
import type { Borrower } from "../lib/types";

/** טופס קוראת חדשה, עם איתור קוראת קיימת לפי טלפון לפני יצירה */
export function NewBorrowerForm({
  borrowers, initial, onCreated, onPickExisting, onCancel,
}: {
  borrowers: Borrower[];
  initial?: { name: string; phone: string };
  onCreated: (b: Borrower) => void;
  onPickExisting: (b: Borrower) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const digits = normalizePhone(phone);
  const matches = useMemo(
    () => (digits.length >= 9 ? borrowers.filter((b) => b.phone_normalized === digits) : []),
    [borrowers, digits],
  );

  const create = async () => {
    if (busy) return;
    if (name.trim().length < 1) return setError("נא למלא שם.");
    if (digits.length < 9) return setError("נא למלא מספר טלפון תקין.");
    setBusy(true);
    setError(null);
    // בדיקה נוספת מול המסד, למקרה שהרשימה המקומית אינה עדכנית
    if (!allowDuplicate) {
      const { data: existing } = await supabase.from("borrowers").select("*").eq("phone_normalized", digits).limit(1);
      if (existing && existing.length > 0 && matches.length === 0) {
        setBusy(false);
        return onPickExisting(existing[0] as Borrower);
      }
    }
    const { data, error: err } = await supabase
      .from("borrowers")
      .insert({ name: name.trim(), phone: phone.trim(), email: email.trim() || null })
      .select()
      .single();
    setBusy(false);
    if (err) return setError(errorText(err));
    onCreated(data as Borrower);
  };

  const blocked = matches.length > 0 && !allowDuplicate;

  return (
    <fieldset>
      <legend>קוראת חדשה</legend>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="nb-name">שם</label>
          <input id="nb-name" type="text" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="nb-phone">טלפון</label>
          <input
            id="nb-phone" type="tel" dir="ltr" maxLength={30} value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setAllowDuplicate(false);
            }}
          />
        </div>
        <div className="field wide">
          <label htmlFor="nb-email">דוא״ל <span className="hint">(רשות)</span></label>
          <input id="nb-email" type="email" dir="ltr" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      {matches.length > 0 && (
        <div className="notice warn" role="alert">
          כבר רשומה קוראת עם מספר הטלפון הזה:
          <ul className="pick-list">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onPickExisting(m)}>
                  <span>{m.name}</span><span className="muted small">בחירה בקוראת הקיימת</span>
                </button>
              </li>
            ))}
          </ul>
          {!allowDuplicate && (
            <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => setAllowDuplicate(true)}>
              זו קוראת אחרת — ליצור בכל זאת
            </button>
          )}
        </div>
      )}
      <div className="btn-row">
        <button type="button" className="btn primary sm" onClick={create} disabled={busy || blocked}>
          {busy ? "שומרת…" : "יצירת קוראת"}
        </button>
        {onCancel && <button type="button" className="btn sm" onClick={onCancel}>ביטול</button>}
      </div>
    </fieldset>
  );
}

export default function BorrowerPicker({
  value, onChange, suggestNew,
}: {
  value: Borrower | null;
  onChange: (b: Borrower | null) => void;
  /** פרטי מבקשת שמירה, להצעת יצירה/התאמה */
  suggestNew?: { name: string; phone: string };
}) {
  const [borrowers, setBorrowers] = useState<Borrower[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchAll<Borrower>("borrowers", "*", { column: "name" })
      .then((list) => {
        setBorrowers(list);
        if (suggestNew) {
          const digits = normalizePhone(suggestNew.phone);
          if (!list.some((b) => b.phone_normalized === digits)) setCreating(true);
          else setQ(suggestNew.phone);
        }
      })
      .catch((e) => setLoadError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(() => {
    if (!borrowers) return [];
    const needle = q.trim().toLowerCase();
    const digits = normalizePhone(q);
    const list = needle
      ? borrowers.filter(
          (b) => b.name.toLowerCase().includes(needle) || (digits.length >= 3 && b.phone_normalized.includes(digits)),
        )
      : borrowers;
    return list.slice(0, 30);
  }, [borrowers, q]);

  if (value) {
    return (
      <div className="chosen">
        <span><strong>{value.name}</strong> · <span dir="ltr">{value.phone}</span></span>
        <button type="button" className="btn sm" onClick={() => onChange(null)}>החלפה</button>
      </div>
    );
  }
  if (loadError) return <div className="notice error" role="alert">{loadError}</div>;
  if (!borrowers) return <div className="muted">טוען קוראות…</div>;

  if (creating) {
    return (
      <NewBorrowerForm
        borrowers={borrowers}
        initial={suggestNew}
        onCreated={(b) => {
          setBorrowers([...borrowers, b]);
          setCreating(false);
          onChange(b);
        }}
        onPickExisting={(b) => {
          setCreating(false);
          onChange(b);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <div>
      <label htmlFor="bp-q">קוראת</label>
      <input id="bp-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או טלפון" />
      {results.length > 0 ? (
        <ul className="pick-list">
          {results.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => onChange(b)}>
                <span>{b.name}</span><span className="muted small" dir="ltr">{b.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small" style={{ margin: "6px 0" }}>
          {borrowers.length === 0 ? "עדיין אין קוראות רשומות." : "לא נמצאה קוראת מתאימה."}
        </p>
      )}
      <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => setCreating(true)}>
        + קוראת חדשה
      </button>
    </div>
  );
}
