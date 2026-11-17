# הספרייה שלי

אפליקציית ווב בעברית לניהול ספרייה ביתית: קטלוג ציבורי, בקשות שמירה, השאלות והחזרות,
הוספת ספרים מתמונת מדף והמלצות מתוך הקטלוג.

React + TypeScript (Vite) · Supabase (PostgreSQL, Auth, Storage, Edge Functions) · Claude API בצד השרת בלבד.

## הגדרה

### 1. פרויקט Supabase ומסד הנתונים

1. צרי פרויקט ב־[supabase.com](https://supabase.com).
2. הריצי את שלושת קובצי ה־migrations לפי הסדר — ב־SQL Editor (הדבקה והרצה של כל קובץ), או עם ה־CLI:

```bash
supabase link --project-ref <PROJECT_REF>
```

```bash
supabase db push
```

| קובץ | תוכן |
|---|---|
| `supabase/migrations/20261117000001_schema.sql` | טבלאות, אילוצים, views של זמינות, RLS והרשאות |
| `supabase/migrations/20261117000002_functions.sql` | פעולות אטומיות: השאלה, החזרה, שמירות, הגבלת קצב |
| `supabase/migrations/20261117000003_storage.sql` | אחסון: `covers` (ציבורי) ו־`shelf-photos` (פרטי) |

### 2. המנהלת הראשונה

אין הרשמה ציבורית. ב־Dashboard של Supabase:

1. **Authentication → Sign In / Providers**: כבי את "Allow new users to sign up".
2. **Authentication → Users → Add user**: צרי משתמשת עם דוא״ל וסיסמה (סמני Auto Confirm).
3. **SQL Editor**: הוסיפי אותה לטבלת המנהלות:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'YOUR-EMAIL@example.com';
```

לטבלה `admins` אין הרשאת כתיבה מה־API, ולכן אי אפשר להעניק הרשאת מנהלת מהדפדפן — רק מכאן.

### 3. הרצת האפליקציה

```bash
cp .env.example .env
```

מלאי ב־`.env` את `VITE_SUPABASE_URL` ואת `VITE_SUPABASE_ANON_KEY` (Project Settings → API; מפתח anon / publishable בלבד).

```bash
npm install
```

```bash
npm run dev
```

לפרסום: `npm run build` ולהעלות את `dist/` לאירוח סטטי (Netlify, Vercel, Cloudflare Pages). יש להגדיר הפניית כל הנתיבים ל־`index.html` (ל־Netlify כבר קיים `public/_redirects`).

### 4. תכונות ה־AI (רשות)

שתי Edge Functions: `analyze-shelf` (זיהוי ספרים מתמונת מדף, למנהלת בלבד) ו־`recommend-books` (המלצות, ציבורי עם הגבלת קצב).

```bash
supabase secrets set ANTHROPIC_API_KEY=<your key>
```

```bash
supabase functions deploy analyze-shelf --no-verify-jwt
```

```bash
supabase functions deploy recommend-books --no-verify-jwt
```

- `--no-verify-jwt` נדרש כי ההרשאות נבדקות בתוך הפונקציות עצמן (מנהלת / הגבלת קצב).
- מפתח ה־API נשמר רק בסודות של Supabase. הוא אינו מופיע בקוד הלקוח או ב־`.env`.
- סודות רשות: `AI_MODEL` (ברירת מחדל `claude-opus-5-5`), `ALLOWED_ORIGIN` (כתובת האתר, לצמצום CORS).
- כל עוד הפונקציות לא נפרסו או שהמפתח חסר, הממשק מציג "לא מוגדר" ואינו מציג תוצאות.

### 5. נתוני דוגמה (רשות)

`supabase/seed_sample.sql` מוסיף שישה ספרים מסומנים `is_sample = true`. הם מוצגים עם התווית "דוגמה"
וניתנים למחיקה בלחיצה אחת ממסך "ספרים". אין צורך להריץ אותו.

## כללי המוצר כפי שמומשו

- **זמינות מחושבת**, לא נשמרת: מושאל = יש השאלה בלי תאריך החזרה; שמור = יש שמירה מאושרת שתוקפה לא פג; אחרת פנוי.
  לכן שמירה שפגה משחררת את הספר מיד, גם בלי ניקוי ברקע.
- **אין השאלה או שמירה כפולה**: אינדקס ייחודי חלקי לכל ספר + נעילת שורת הספר בכל פעולה.
- **שמירה**: בקשה ציבורית ממתינה ואינה חוסמת; אישור שומר ל־48 שעות מרגע האישור; אפשר לדחות, לבטל, להאריך ולחדש.
  "נמסר לקוראת" ממיר שמירה להשאלה בפעולה אחת.
- **פרטיות**: לציבור יש גישה רק ל־view `catalog` (ללא מיקום וללא זהות שואלת) ולפונקציה `request_reservation`,
  שמחזירה קוד תוצאה בלבד. כל השאר נאכף ב־RLS ובבדיקת מנהלת בתוך הפונקציות.
- **הגבלת קצב**: בקשות שמירה — 5 לשעה לכתובת, 60 לשעה בסך הכול, עד 3 ממתינות לטלפון. המלצות — 8 ל־10 דקות לכתובת, 200 ביממה. זיהוי מדף — 40 לשעה.
- **AI**: למודל ההמלצות נשלחים רק שדות קטלוג. מזהי הספרים שחוזרים מאומתים בשרת מול המסד. טקסט בתמונה ובקטלוג מטופל כנתונים.
- **זמנים**: נשמרים ב־UTC (`timestamptz`), מוצגים לפי `Asia/Jerusalem`.

## בדיקות

```bash
npm run typecheck
```

בדיקות מסד (דורשות Postgres מקומי; יוצרות מסד זמני `hasifriya_test`):

```bash
scripts/test-db.sh
```

```bash
supabase/tests/concurrency_test.sh
```

`scripts/local-test/` מכיל כלי בדיקה בלבד: שער מקומי שמדמה חלק קטן מה־API של Supabase מעל Postgres מקומי,
ובדיקת קצה־לקצה בדפדפן (Playwright). הוא אינו חלק מהמוצר.

## מבנה

```
src/                 הממשק (React)
  pages/             קטלוג, עמוד ספר, המלצות, כניסה
  pages/admin/       אצל מי הספרים?, ספרים, קוראות, הוספה מתמונה, ייצוא
supabase/migrations/ סכימה, פונקציות, אחסון
supabase/functions/  analyze-shelf, recommend-books
supabase/tests/      בדיקות כללי המוצר ברמת המסד
```
