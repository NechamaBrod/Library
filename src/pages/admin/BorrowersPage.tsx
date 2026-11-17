import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchAll, supabase } from "../../lib/supabase";
import { useLoad } from "../../lib/hooks";
import { normalizePhone } from "../../lib/format";
import type { Borrower } from "../../lib/types";
import { Empty, ErrorNotice, Loading } from "../../components/ui";
import { NewBorrowerForm } from "../../components/BorrowerPicker";

async function load() {
  const [borrowers, active] = await Promise.all([
    fetchAll<Borrower>("borrowers", "*", { column: "name" }),
    supabase.from("loans").select("borrower_id").is("returned_at", null),
  ]);
  if (active.error) throw active.error;
  const counts = new Map<string, number>();
  for (const l of active.data) counts.set(l.borrower_id, (counts.get(l.borrower_id) ?? 0) + 1);
  return { borrowers, counts };
}

export default function BorrowersPage() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useLoad(load);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    const list = data?.borrowers ?? [];
    const needle = q.trim().toLowerCase();
    const digits = normalizePhone(q);
    if (!needle) return list;
    return list.filter(
      (b) => b.name.toLowerCase().includes(needle) || (digits.length >= 3 && b.phone_normalized.includes(digits)),
    );
  }, [data, q]);

  return (
    <>
      <div className="page-head">
        <h1>קוראות</h1>
        {!adding && <button type="button" className="btn accent" onClick={() => setAdding(true)}>+ קוראת חדשה</button>}
      </div>

      {adding && data && (
        <div className="card" style={{ marginBottom: 18 }}>
          <NewBorrowerForm
            borrowers={data.borrowers}
            onCreated={(b) => navigate(`/admin/borrowers/${b.id}`)}
            onPickExisting={(b) => navigate(`/admin/borrowers/${b.id}`)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      <div className="toolbar">
        <div className="field grow">
          <label htmlFor="brq">חיפוש לפי שם או טלפון</label>
          <input id="brq" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading && <Loading />}
      {error && <ErrorNotice text={error} onRetry={reload} />}
      {data && filtered.length === 0 && (
        <Empty>{data.borrowers.length === 0 ? "עדיין אין קוראות רשומות. קוראת נוספת גם מתוך רישום השאלה." : "לא נמצאה קוראת מתאימה."}</Empty>
      )}
      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="stack-sm">
            <thead><tr><th>שם</th><th>טלפון</th><th>ספרים אצלה כעת</th></tr></thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id}>
                  <td><Link to={`/admin/borrowers/${b.id}`}><strong>{b.name}</strong></Link></td>
                  <td><a dir="ltr" href={`tel:${b.phone}`}>{b.phone}</a></td>
                  <td className="num">{data!.counts.get(b.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
