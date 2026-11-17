export default function SetupNeeded() {
  return (
    <main>
      <div className="card" style={{ maxWidth: 720, margin: "40px auto" }}>
        <h1>הספרייה שלי — נדרשת הגדרה</h1>
        <p>
          האפליקציה אינה מחוברת עדיין למסד נתונים, ולכן אין מה להציג. לא מוצגים כאן נתוני דוגמה במקום נתונים אמיתיים.
        </p>
        <h2>מה חסר</h2>
        <ol>
          <li>פרויקט Supabase שבו הורצו קובצי ה־migrations שבתיקייה <code dir="ltr">supabase/migrations</code>.</li>
          <li>
            קובץ <code dir="ltr">.env</code> בשורש הפרויקט עם שני ערכים ציבוריים:
            <pre dir="ltr" style={{ background: "#f5ecea", padding: 12, borderRadius: 8, overflowX: "auto" }}>
{`VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>`}
            </pre>
          </li>
          <li>הפעלה מחדש של השרת (<code dir="ltr">npm run dev</code>) אחרי יצירת הקובץ.</li>
        </ol>
        <p className="muted">הוראות מלאות, כולל יצירת המנהלת הראשונה והגדרת ה־AI, נמצאות בקובץ README.</p>
      </div>
    </main>
  );
}
