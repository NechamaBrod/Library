import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openLibrary, LibraryError } from '../src/db.js';
import { createMcpServer } from '../src/mcp.js';
import { createApp } from '../src/server.js';
import { createAuth } from '../src/auth.js';

async function setup() {
  const lib = await openLibrary(':memory:');
  const server = createMcpServer(lib);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    return { text: r.content[0].text, isError: Boolean(r.isError) };
  };
  return { lib, call };
}

test('פתיחה וסגירה של השאלה דרך MCP', async () => {
  const { lib, call } = await setup();
  await lib.addBook({ title: 'הַמַּפְתֵּחַ', author: 'רחל כהן', category: 'ספרי ילדים' });

  let r = await call('open_loan', { book_title: 'המפתח', borrower_name: 'שרה לוי' });
  assert.equal(r.isError, false, r.text);
  assert.equal((await lib.listBooks())[0].borrower, 'שרה לוי');

  r = await call('open_loan', { book_title: 'המפתח', borrower_name: 'מרים' });
  assert.equal(r.isError, true);
  assert.match(r.text, /כבר מושאל לשרה לוי/);

  r = await call('close_loan', { book_title: 'המפתח', borrower_name: 'מרים' });
  assert.equal(r.isError, true);

  r = await call('close_loan', { book_title: 'המפתח', borrower_name: 'שרה' });
  assert.equal(r.isError, false, r.text);
  const [book] = await lib.listBooks();
  assert.equal(book.loanId, null);
  assert.equal((await lib.loanHistory(book.id)).length, 1);
});

test('שם שמתאים לכמה ספרים מחזיר רשימה, והתאמה מדויקת גוברת', async () => {
  const { lib, call } = await setup();
  await lib.addBook({ title: 'סיפורי צדיקים א' });
  await lib.addBook({ title: 'סיפורי צדיקים ב' });
  await lib.addBook({ title: 'סיפורי צדיקים' });

  let r = await call('open_loan', { book_title: 'צדיקים', borrower_name: 'חנה' });
  assert.equal(r.isError, true);
  assert.match(r.text, /נמצאו 3 ספרים/);

  r = await call('open_loan', { book_title: 'סיפורי צדיקים', borrower_name: 'חנה' });
  assert.equal(r.isError, false, r.text);

  r = await call('open_loan', { book_title: 'לא קיים', borrower_name: 'חנה' });
  assert.equal(r.isError, true);

  r = await call('list_open_loans');
  assert.match(r.text, /1 ספרים מושאלים/);
});

test('קטגוריות והוספה מרוכזת', async () => {
  const lib = await openLibrary(':memory:');
  const res = await lib.importBooks('ספר א | סופר א | קטגוריה חדשה | נוער\nספר ב\nספר א | סופר א\nספר ג | | | גיל שגוי');
  assert.deepEqual([res.added, res.skipped, res.errors.length], [2, 1, 1]);
  const cat = await lib.findCategory('קטגוריה חדשה');
  assert.equal(cat.bookCount, 1);
  await assert.rejects(() => lib.addCategory('קטגוריה חדשה'), LibraryError);
  await lib.deleteCategory(cat.id);
  assert.equal((await lib.listBooks()).find((b) => b.title === 'ספר א').categoryId, null);
});

test('סיסמה לאתר וטוקן ל-MCP', async () => {
  const lib = await openLibrary(':memory:');
  const app = createApp(lib, createAuth({ password: 'sod-gadol', mcpToken: 'tok-123' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = { 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${base}/api/state`)).status, 401);
    assert.equal(
      (await fetch(`${base}/api/books`, { method: 'POST', headers: json, body: '{"title":"x"}' })).status,
      401
    );
    const bad = await fetch(`${base}/api/login`, { method: 'POST', headers: json, body: '{"password":"no"}' });
    assert.equal(bad.status, 401);
    const good = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: json,
      body: '{"password":"sod-gadol"}',
    });
    assert.equal(good.status, 204);
    const cookie = good.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${base}/api/state`, { headers: { cookie } })).status, 200);
    assert.equal(
      (await fetch(`${base}/api/state`, { headers: { cookie: cookie.slice(0, -2) + 'xx' } })).status,
      401
    );

    const rpc = { method: 'POST', body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' };
    const mcpHeaders = { ...json, Accept: 'application/json, text/event-stream' };
    assert.equal((await fetch(`${base}/mcp`, { ...rpc, headers: mcpHeaders })).status, 401);
    assert.equal((await fetch(`${base}/mcp/wrong`, { ...rpc, headers: mcpHeaders })).status, 401);
    assert.equal((await fetch(`${base}/mcp/tok-123`, { ...rpc, headers: mcpHeaders })).status, 200);
    assert.equal(
      (await fetch(`${base}/mcp`, { ...rpc, headers: { ...mcpHeaders, Authorization: 'Bearer tok-123' } })).status,
      200
    );
  } finally {
    server.close();
    server.closeAllConnections();
  }
});
