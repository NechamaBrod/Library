import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { callFunction, checkAi, fetchAll, supabase, type AiStatus } from "../../lib/supabase";
import { useAction, useToast } from "../../lib/hooks";
import { aiErrorText, errorText, resizeImage, similarTitles } from "../../lib/format";
import type { AdminBook } from "../../lib/types";
import { Loading } from "../../components/ui";
import { AiNotReady } from "../RecommendPage";

interface ShelfResult {
  image_ok: boolean;
  problem: "none" | "not_books" | "too_blurry" | "too_dark" | "other";
  unreadable_count: number;
  books: { title: string; author: string | null; confidence: "high" | "medium" | "low"; note: string | null }[];
}
interface Row {
  key: number;
  selected: boolean;
  title: string;
  author: string;
  confidence: "high" | "medium" | "low" | "manual";
  note: string | null;
}
type Step = "pick" | "working" | "review" | "saved";

const PROBLEM_TEXT: Record<string, string> = {
  not_books: "בתמונה לא זוהו ספרים. יש לצלם מדף שבו שדרות הספרים נראות.",
  too_blurry: "התמונה מטושטשת מדי לקריאה. כדאי לצלם שוב מקרוב וביד יציבה.",
  too_dark: "התמונה חשוכה מדי. כדאי לצלם שוב באור טוב יותר.",
  other: "לא ניתן היה לקרוא את התמונה. כדאי לנסות צילום אחר.",
};

export default function ShelfImportPage() {
  const toast = useToast();
  const { busy, run } = useAction();
  const [ai, setAi] = useState<AiStatus>("checking");
  const [existing, setExisting] = useState<AdminBook[]>([]);
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [location, setLocation] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [result, setResult] = useState<ShelfResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const nextKey = useRef(1);

  useEffect(() => {
    void checkAi("analyze-shelf").then(setAi);
    fetchAll<AdminBook>("admin_books", "id,title,author,archived_at", { column: "title" })
      .then(setExisting)
      .catch(() => setExisting([]));
  }, []);

  useEffect(() => {
    if (!file) return setPreviewUrl(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const duplicates = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const r of rows) {
      if (!r.title.trim()) continue;
      const inCatalog = existing.filter((b) => similarTitles(b.title, r.title)).map((b) => b.title);
      const inList = rows.some((o) => o.key !== r.key && o.selected && similarTitles(o.title, r.title));
      const hits = [...new Set(inCatalog)].slice(0, 3);
      if (inList) hits.push("שורה אחרת ברשימה הזו");
      if (hits.length) map.set(r.key, hits);
    }
    return map;
  }, [rows, existing]);

  const analyze = () =>
    run("analyze", async () => {
      if (!file) return;
      setError(null);
      setStep("working");
      let id: string | null = null;
      try {
        setProgress("מכינה את התמונה…");
        const blob = await resizeImage(file, 2400, 4.5 * 1024 * 1024);
        setProgress("מעלה את התמונה לאחסון הפרטי…");
        const path = `${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from("shelf-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error("UPLOAD_FAILED");
        const scan = await supabase
          .from("shelf_scans").insert({ image_path: path, location: location.trim() || null }).select("id").single();
        if (scan.error) throw new Error("UPLOAD_FAILED");
        id = scan.data.id as string;
        setScanId(id);
      } catch (e) {
        const msg = (e as Error).message;
        setError(
          msg === "UNREADABLE_IMAGE" ? "הקובץ אינו תמונה שניתן לקרוא. נסי קובץ JPG או PNG."
          : msg === "IMAGE_TOO_LARGE" ? "התמונה גדולה מדי גם לאחר הקטנה."
          : "העלאת התמונה נכשלה. בדקי את החיבור, ושאחסון הקבצים (Storage) הוגדר לפי ה־README.",
        );
        return setStep("pick");
      }

      setProgress("מנתחת את התמונה… זה יכול לקחת עד דקה.");
      const res = await callFunction<ShelfResult>("analyze-shelf", { scan_id: id });
      if (!res.ok) {
        setError(`התמונה נשמרה, אך הניתוח נכשל: ${aiErrorText(res.code)}`);
        return setStep("pick");
      }
      const data = res.data;
      if (!data || typeof data.image_ok !== "boolean" || !Array.isArray(data.books)) {
        setError("התקבלה מהשרת תשובה לא תקינה. נסי שוב.");
        return setStep("pick");
      }
      if (!data.image_ok) {
        setError(PROBLEM_TEXT[data.problem] ?? PROBLEM_TEXT.other);
        return setStep("pick");
      }
      setResult(data);
      setRows(
        data.books.map((b) => ({
          key: nextKey.current++,
          title: b.title,
          author: b.author ?? "",
          confidence: b.confidence,
          note: b.note,
          // זיהוי לא ודאי או חשד לכפילות אינם מסומנים לשמירה כברירת מחדל
          selected: b.confidence === "high" && !existing.some((e) => similarTitles(e.title, b.title)),
        })),
      );
      setStep("review");
    });

  const update = (key: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const toSave = rows.filter((r) => r.selected && r.title.trim());

  const save = () =>
    run("save", async () => {
      setError(null);
      const { error: err } = await supabase.from("books").insert(
        toSave.map((r) => ({
          title: r.title.trim(),
          author: r.author.trim() || null,
          location: location.trim() || null,
          source_scan_id: scanId,
        })),
      );
      if (err) {
        setConfirming(false);
        return setError(`השמירה נכשלה ושום ספר לא נוסף. ${errorText(err)}`);
      }
      if (scanId) {
        await supabase.from("shelf_scans").update({ status: "saved", books_saved: toSave.length }).eq("id", scanId);
      }
      setSavedCount(toSave.length);
      setConfirming(false);
      setStep("saved");
      toast(`${toSave.length} ספרים נוספו לקטלוג.`);
    });

  const reset = () => {
    setStep("pick"); setFile(null); setResult(null); setRows([]); setScanId(null);
    setError(null); setConfirming(false);
    fetchAll<AdminBook>("admin_books", "id,title,author,archived_at", { column: "title" }).then(setExisting).catch(() => {});
  };

  return (
    <>
      <div className="page-head"><h1>הוספת ספרים מתמונת מדף</h1></div>

      {ai === "checking" && <Loading text="בודק את זמינות שירות הזיהוי…" />}
      <AiNotReady status={ai} feature="זיהוי ספרים מתמונה" />
      {(ai === "not_configured" || ai === "not_deployed") && (
        <p>עד שהשירות יוגדר אפשר <Link to="/admin/books/new">להוסיף ספרים ידנית</Link>. הוראות ההגדרה נמצאות ב־README.</p>
      )}

      {error && <div className="notice error" role="alert">{error}</div>}

      {ai === "ready" && step === "pick" && (
        <div className="card">
          <p>
            צלמי מדף כך ששדרות הספרים נראות בבירור — אפשר כמה עשרות ספרים בתמונה אחת. התמונה נשמרת באחסון פרטי,
            וההצעות יוצגו לך לבדיקה. שום ספר לא נשמר בקטלוג לפני שתאשרי.
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="sh-file">תמונת המדף</label>
              <input id="sh-file" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="field">
              <label htmlFor="sh-loc">מיקום <span className="hint">(רשות; יוחל על הספרים שייבחרו)</span></label>
              <input id="sh-loc" type="text" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="למשל: חדר ילדים, מדף עליון" />
            </div>
          </div>
          {previewUrl && <img src={previewUrl} alt="התמונה שנבחרה" style={{ maxWidth: 320, width: "100%", borderRadius: 10, display: "block", marginBottom: 14 }} />}
          <button type="button" className="btn primary" disabled={!file || busy !== null} onClick={analyze}>שליחה לזיהוי</button>
        </div>
      )}

      {step === "working" && <Loading text={progress} />}

      {step === "review" && result && (
        <>
          <div className="notice">
            זוהו {result.books.length} ספרים.
            {result.unreadable_count > 0 && ` עוד כ־${result.unreadable_count} ספרים נראים בתמונה אך לא ניתן היה לקרוא אותם — כדאי לצלם אותם שוב מקרוב או להוסיף ידנית.`}
            {" "}שורות המסומנות „לבדיקה” זוהו באופן חלקי: השוו לתמונה ותקנו לפני הבחירה. לא נוספו פרטים שלא נראים על השדרה.
          </div>
          <div className="shelf-layout">
            <div className="shelf-photo">
              {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer"><img src={previewUrl} alt="תמונת המדף שהועלתה" /></a>}
              <p className="muted small">לחיצה על התמונה פותחת אותה בגודל מלא.</p>
            </div>
            <div>
              <div className="table-wrap">
                <table className="shelf-table">
                  <thead>
                    <tr><th>לשמור</th><th>שם הספר</th><th>מחבר</th><th>זיהוי</th><th><span className="sr-only">הסרה</span></th></tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && <tr><td colSpan={5} className="muted">אין שורות. אפשר להוסיף שורה ידנית.</td></tr>}
                    {rows.map((r, i) => {
                      const dup = duplicates.get(r.key);
                      const review = r.confidence === "medium" || r.confidence === "low";
                      return (
                        <tr key={r.key} className={review || dup ? "flag" : undefined}>
                          <td>
                            <input
                              type="checkbox" checked={r.selected} aria-label={`לשמור את שורה ${i + 1}`}
                              onChange={(e) => update(r.key, { selected: e.target.checked })}
                              style={{ width: 18, height: 18 }}
                            />
                          </td>
                          <td>
                            <input type="text" aria-label={`שם הספר, שורה ${i + 1}`} maxLength={300} value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} />
                            {dup && <span className="dup">⚠ ייתכן שכבר קיים: {dup.join(" · ")}</span>}
                            {r.note && <span className="dup">{r.note}</span>}
                          </td>
                          <td>
                            <input type="text" aria-label={`מחבר, שורה ${i + 1}`} maxLength={200} value={r.author} placeholder="לא זוהה" onChange={(e) => update(r.key, { author: e.target.value })} />
                          </td>
                          <td>
                            {r.confidence === "high" && <span className="badge available">ברור</span>}
                            {r.confidence === "medium" && <span className="badge reserved">לבדיקה</span>}
                            {r.confidence === "low" && <span className="badge loaned">לא ברור</span>}
                            {r.confidence === "manual" && <span className="badge plain">ידני</span>}
                          </td>
                          <td>
                            <button type="button" className="icon-btn" aria-label={`הסרת שורה ${i + 1}`} onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button
                  type="button" className="btn sm"
                  onClick={() => setRows((l) => [...l, { key: nextKey.current++, selected: true, title: "", author: "", confidence: "manual", note: null }])}
                >
                  + הוספת שורה ידנית
                </button>
              </div>

              <div className="card section">
                <div className="field">
                  <label htmlFor="sh-loc2">מיקום לספרים שנבחרו <span className="hint">(רשות)</span></label>
                  <input id="sh-loc2" type="text" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>
                {!confirming ? (
                  <div className="btn-row">
                    <button type="button" className="btn primary" disabled={toSave.length === 0} onClick={() => setConfirming(true)}>
                      המשך לשמירת {toSave.length} ספרים
                    </button>
                    <button type="button" className="btn" onClick={reset}>ביטול בלי לשמור</button>
                  </div>
                ) : (
                  <div className="notice warn" role="alertdialog" aria-label="אישור שמירה">
                    <p>
                      <strong>{toSave.length} ספרים</strong> יתווספו לקטלוג כרשומות חדשות
                      {location.trim() && <> במיקום „{location.trim()}”</>}.
                      {toSave.some((r) => duplicates.has(r.key)) && " חלק מהשורות שנבחרו דומות לספרים קיימים — הן יתווספו כרשומות נפרדות, בלי מיזוג."}
                    </p>
                    <div className="btn-row">
                      <button type="button" className="btn accent" disabled={busy !== null} onClick={save}>
                        {busy === "save" ? "שומרת…" : "אישור והוספה לקטלוג"}
                      </button>
                      <button type="button" className="btn" disabled={busy !== null} onClick={() => setConfirming(false)}>חזרה לעריכה</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {step === "saved" && (
        <div className="notice ok" role="status">
          <h3>{savedCount} ספרים נוספו לקטלוג</h3>
          <p>אפשר להשלים קטגוריה, קהל יעד ותקציר בעריכת כל ספר.</p>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={reset}>צילום מדף נוסף</button>
            <Link className="btn" to="/admin/books">לרשימת הספרים</Link>
          </div>
        </div>
      )}
    </>
  );
}
