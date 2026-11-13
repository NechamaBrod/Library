// שרת האתר: ממשק, API, וגם נקודת MCP ב-HTTP בכתובת /mcp.
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AGE_GROUPS, LibraryError, openLibrary, today } from './db.js';
import { createAuth } from './auth.js';
import { createMcpServer } from './mcp.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createApp(lib, auth = createAuth()) {
  const app = express();
  app.set('trust proxy', 1); // מאחורי ה-proxy של שירות האירוח
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(resolve(here, '..', 'public')));

  app.get('/healthz', (_req, res) => res.send('ok'));

  const id = (req) => {
    const n = Number(req.params.id);
    if (!Number.isInteger(n)) throw new LibraryError('מזהה לא תקין');
    return n;
  };

  const api = express.Router();
  api.post('/login', auth.login);
  api.post('/logout', auth.logout);
  api.use(auth.requireLogin);

  api.get('/state', async (_req, res) => {
    const [books, categories, borrowers] = await Promise.all([
      lib.listBooks(),
      lib.listCategories(),
      lib.listBorrowers(),
    ]);
    res.json({ books, categories, borrowers, ageGroups: AGE_GROUPS, today: today(), authEnabled: auth.enabled });
  });

  api.post('/books', async (req, res) => res.status(201).json(await lib.addBook(req.body ?? {})));
  api.post('/books/import', async (req, res) => res.json(await lib.importBooks(req.body?.text)));
  api.put('/books/:id', async (req, res) => res.json(await lib.updateBook(id(req), req.body ?? {})));
  api.delete('/books/:id', async (req, res) => {
    await lib.deleteBook(id(req));
    res.status(204).end();
  });
  api.get('/books/:id/history', async (req, res) => res.json(await lib.loanHistory(id(req))));
  api.post('/books/:id/loan', async (req, res) =>
    res.json(await lib.openLoan(id(req), req.body?.borrower, req.body?.date))
  );
  api.post('/books/:id/return', async (req, res) =>
    res.json((await lib.closeLoan(id(req), req.body?.date)).book)
  );

  api.post('/categories', async (req, res) =>
    res.status(201).json(await lib.addCategory(req.body?.name))
  );
  api.put('/categories/:id', async (req, res) => {
    await lib.renameCategory(id(req), req.body?.name);
    res.status(204).end();
  });
  api.delete('/categories/:id', async (req, res) => {
    await lib.deleteCategory(id(req));
    res.status(204).end();
  });

  app.use('/api', api);

  // MCP ב-HTTP, ללא מצב: שרת ו-transport חדשים לכל בקשה.
  app.post(['/mcp', '/mcp/:token'], auth.requireMcpToken, async (req, res) => {
    const server = createMcpServer(lib);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.all(['/mcp', '/mcp/:token'], (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null,
    });
  });

  app.use((err, _req, res, _next) => {
    if (err instanceof LibraryError) return res.status(err.status).json({ error: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'בקשה לא תקינה' });
    console.error(err);
    res.status(500).json({ error: 'שגיאה בשרת' });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hosted = Boolean(process.env.RENDER || process.env.NODE_ENV === 'production');
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? (hosted ? '0.0.0.0' : '127.0.0.1');
  const auth = createAuth();

  // אתר שפתוח לאינטרנט בלי סיסמה חושף את כל הרשימה לעריכה - לא מפעילים כך.
  if ((hosted || host !== '127.0.0.1') && !auth.enabled) {
    console.error('האתר נגיש מחוץ למחשב הזה ולכן חובה להגדיר סיסמה במשתנה APP_PASSWORD.');
    process.exit(1);
  }
  if (hosted && !process.env.DATABASE_URL) {
    console.error('חסר DATABASE_URL (כתובת החיבור ל-Supabase). בלי זה הנתונים לא יישמרו.');
    process.exit(1);
  }

  const lib = await openLibrary();
  createApp(lib, auth).listen(port, host, () => {
    console.log(`הספריה פועלת בפורט ${port}${auth.enabled ? ' (מוגנת בסיסמה)' : ''}`);
    if (!hosted) console.log(`http://localhost:${port}`);
  });
}
