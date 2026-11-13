// הגדרת כלי ה-MCP. אותה הגדרה משמשת גם את החיבור ב-stdio וגם את החיבור ב-HTTP.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AGE_GROUPS, LibraryError, normalize } from './db.js';

const text = (s) => ({ content: [{ type: 'text', text: s }] });
const fail = (s) => ({ content: [{ type: 'text', text: s }], isError: true });

const describeBook = (b) => {
  const parts = [`"${b.title}"`];
  if (b.author) parts.push(`מאת ${b.author}`);
  if (b.category) parts.push(`[${b.category}]`);
  if (b.ageGroup) parts.push(`· ${b.ageGroup}`);
  parts.push(b.loanId ? `· מושאל ל${b.borrower} מ-${b.loanedAt}` : '· על המדף');
  return parts.join(' ');
};

const bulletList = (books) => books.map((b) => `• ${describeBook(b)}`).join('\n');

/** עוטף כלי כך ששגיאות צפויות יחזרו כהודעה ברורה ולא כקריסה. */
const safe = (fn) => async (args) => {
  try {
    return await fn(args);
  } catch (e) {
    if (e instanceof LibraryError) return fail(e.message);
    throw e;
  }
};

export function createMcpServer(lib) {
  const server = new McpServer({ name: 'my-library', version: '1.0.0' });

  const dateField = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional();

  server.registerTool(
    'open_loan',
    {
      title: 'פתיחת השאלה',
      description:
        'רישום השאלה של ספר: מקבל את שם הספר ואת שם המשאילה. אם יש כמה ספרים מתאימים לשם - מחזיר את הרשימה כדי לדייק (אפשר להוסיף שם סופר).',
      inputSchema: {
        book_title: z.string().describe('שם הספר (אפשר גם חלק מהשם)'),
        borrower_name: z.string().describe('שם המשאילה'),
        author: z.string().optional().describe('שם הסופר - רק אם צריך להבחין בין ספרים בעלי שם דומה'),
        loan_date: dateField.describe('תאריך ההשאלה YYYY-MM-DD. ברירת מחדל: היום'),
      },
    },
    safe(async ({ book_title, borrower_name, author, loan_date }) => {
      const matches = await lib.findBooksByTitle(book_title, author);
      if (!matches.length) {
        return fail(
          `לא נמצא ספר בשם "${book_title}". אפשר לחפש עם search_books או להוסיף אותו עם add_book.`
        );
      }
      if (matches.length > 1) {
        return fail(
          `נמצאו ${matches.length} ספרים מתאימים. יש לדייק את השם או לציין סופר:\n${bulletList(matches.slice(0, 20))}`
        );
      }
      const book = await lib.openLoan(matches[0].id, borrower_name, loan_date);
      return text(`נרשמה השאלה: "${book.title}" אצל ${book.borrower} מתאריך ${book.loanedAt}.`);
    })
  );

  server.registerTool(
    'close_loan',
    {
      title: 'סגירת השאלה',
      description:
        'רישום החזרה של ספר מושאל: מקבל את שם הספר ואת שם המשאילה. שם המשאילה משמש לאימות ולהבחנה בין ספרים בעלי שם דומה.',
      inputSchema: {
        book_title: z.string().describe('שם הספר (אפשר גם חלק מהשם)'),
        borrower_name: z.string().optional().describe('שם המשאילה'),
        return_date: dateField.describe('תאריך ההחזרה YYYY-MM-DD. ברירת מחדל: היום'),
      },
    },
    safe(async ({ book_title, borrower_name, return_date }) => {
      const found = await lib.findBooksByTitle(book_title);
      if (!found.length) return fail(`לא נמצא ספר בשם "${book_title}".`);
      let loaned = found.filter((b) => b.loanId);
      if (!loaned.length) {
        return fail(`אין השאלה פתוחה על "${found[0].title}"${found.length > 1 ? ' או על ספרים דומים' : ''}.`);
      }
      const who = normalize(borrower_name);
      if (who) {
        const byName = loaned.filter((b) => {
          const n = normalize(b.borrower);
          return n === who || n.includes(who) || who.includes(n);
        });
        if (!byName.length) {
          return fail(
            `לא נמצאה השאלה פתוחה של הספר על שם "${borrower_name}". ההשאלות הפתוחות המתאימות:\n${bulletList(loaned)}`
          );
        }
        loaned = byName;
      }
      if (loaned.length > 1) {
        return fail(`נמצאו כמה השאלות פתוחות מתאימות, יש לדייק:\n${bulletList(loaned)}`);
      }
      const r = await lib.closeLoan(loaned[0].id, return_date);
      return text(
        `נסגרה ההשאלה: "${r.book.title}" הוחזר מ${r.borrower} בתאריך ${r.returnedAt} (הושאל ב-${r.loanedAt}).`
      );
    })
  );

  server.registerTool(
    'list_open_loans',
    {
      title: 'ספרים מושאלים',
      description: 'רשימת כל הספרים המושאלים כרגע - למי וממתי. אפשר לסנן לפי שם משאילה.',
      inputSchema: {
        borrower_name: z.string().optional().describe('סינון לפי שם משאילה'),
      },
    },
    safe(async ({ borrower_name }) => {
      const who = normalize(borrower_name);
      const loans = (await lib.listBooks())
        .filter((b) => b.loanId && (!who || normalize(b.borrower).includes(who)))
        .sort((a, b) => a.loanedAt.localeCompare(b.loanedAt));
      if (!loans.length) return text('אין ספרים מושאלים כרגע.');
      return text(`${loans.length} ספרים מושאלים:\n${bulletList(loans)}`);
    })
  );

  server.registerTool(
    'search_books',
    {
      title: 'חיפוש ספרים',
      description: 'חיפוש וסינון ברשימת הספרים לפי שם ספר או סופר, קטגוריה, גיל מומלץ ומצב השאלה.',
      inputSchema: {
        query: z.string().optional().describe('טקסט חופשי - שם ספר או שם סופר'),
        category: z.string().optional().describe('שם קטגוריה'),
        age_group: z.enum(AGE_GROUPS).optional().describe('גיל מומלץ'),
        status: z.enum(['available', 'loaned']).optional().describe('על המדף / מושאל'),
        limit: z.number().int().min(1).max(200).optional().describe('ברירת מחדל: 50'),
      },
    },
    safe(async ({ query, category, age_group, status, limit = 50 }) => {
      const q = normalize(query);
      const c = normalize(category);
      const books = (await lib.listBooks()).filter(
        (b) =>
          (!q || normalize(b.title).includes(q) || normalize(b.author).includes(q)) &&
          (!c || normalize(b.category) === c) &&
          (!age_group || b.ageGroup === age_group) &&
          (!status || (status === 'loaned') === Boolean(b.loanId))
      );
      if (!books.length) return text('לא נמצאו ספרים מתאימים.');
      const more = books.length > limit ? `\n(מוצגים ${limit} מתוך ${books.length})` : '';
      return text(`נמצאו ${books.length} ספרים:\n${bulletList(books.slice(0, limit))}${more}`);
    })
  );

  server.registerTool(
    'add_book',
    {
      title: 'הוספת ספר',
      description: 'הוספת ספר חדש לספריה. קטגוריה שאינה קיימת תיווצר אוטומטית.',
      inputSchema: {
        title: z.string().describe('שם הספר'),
        author: z.string().optional().describe('שם הסופר'),
        category: z.string().optional().describe('שם הקטגוריה'),
        age_group: z.enum(AGE_GROUPS).optional().describe('גיל מומלץ'),
        notes: z.string().optional().describe('הערות'),
      },
    },
    safe(async ({ title, author, category, age_group, notes }) => {
      const dup = (await lib.listBooks()).find(
          (b) => normalize(b.title) === normalize(title) && normalize(b.author) === normalize(author)
        );
      if (dup) return fail(`הספר כבר קיים ברשימה: ${describeBook(dup)}`);
      const book = await lib.addBook({ title, author, category, ageGroup: age_group, notes });
      return text(`נוסף: ${describeBook(book)}`);
    })
  );

  server.registerTool(
    'list_categories',
    {
      title: 'רשימת קטגוריות',
      description: 'רשימת הקטגוריות בספריה ומספר הספרים בכל אחת.',
      inputSchema: {},
    },
    safe(async () => {
      const cats = await lib.listCategories();
      if (!cats.length) return text('אין קטגוריות.');
      return text(cats.map((c) => `• ${c.name} (${c.bookCount})`).join('\n'));
    })
  );

  return server;
}
