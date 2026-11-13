// ממשק הספריה. כל הספרים נטענים פעם אחת והסינון נעשה בדפדפן - מיידי גם עם מאות ספרים.

const $ = (sel) => document.querySelector(sel);

/** יצירת אלמנט. טקסט נכנס תמיד כטקסט ולא כ-HTML. */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...children.filter((c) => c != null && c !== false));
  return el;
}

const norm = (s) =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'`׳״.,:;!?()\-־–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    showLogin();
    throw new Error('נדרשת התחברות');
  }
  if (!res.ok) throw new Error(data.error ?? 'שגיאה בשרת');
  return data;
}

const state = { books: [], categories: [], ageGroups: [], borrowers: [], today: '', authEnabled: false };
const filters = { q: '', status: '', category: '', author: '', age: '' };

const NO_CATEGORY = 'none';

function todayStr() {
  if (state.today) return state.today;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const fmtDate = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
};

function daysSince(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const [ty, tm, td] = todayStr().split('-').map(Number);
  return Math.round((new Date(ty, tm - 1, td) - then) / 86400000);
}

function agoText(days) {
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 60) return `לפני ${days} ימים`;
  if (days < 365) return `לפני ${Math.round(days / 30)} חודשים`;
  return 'לפני יותר משנה';
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- טעינה ----------
async function load() {
  Object.assign(state, await api('GET', '/state'));
  // סינון שמצביע על קטגוריה או סופר שכבר אינם קיימים - מתאפס.
  if (filters.category && filters.category !== NO_CATEGORY &&
      !state.categories.some((c) => String(c.id) === filters.category)) filters.category = '';
  if (filters.author && !state.books.some((b) => b.author === filters.author)) filters.author = '';
  renderAll();
}

function setOptions(select, options, value) {
  select.replaceChildren(...options.map(([v, label]) => h('option', { value: v }, label)));
  select.value = value;
}

function renderAll() {
  $('#btn-logout').hidden = !state.authEnabled;
  const loaned = state.books.filter((b) => b.loanId).length;
  $('#stats').textContent = `${state.books.length} ספרים · ${loaned} מושאלים`;

  const authors = [...new Set(state.books.map((b) => b.author).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'he')
  );
  setOptions($('#f-author'), [['', 'כל הסופרים'], ...authors.map((a) => [a, a])], filters.author);
  setOptions($('#f-age'), [['', 'כל הגילאים'], ...state.ageGroups.map((a) => [a, a])], filters.age);
  $('#authors-list').replaceChildren(...authors.map((a) => h('option', { value: a })));
  $('#borrowers-list').replaceChildren(...state.borrowers.map((b) => h('option', { value: b })));

  renderChips();
  renderList();
}

function renderChips() {
  const uncategorized = state.books.filter((b) => !b.categoryId).length;
  const chip = (value, label, count) =>
    h(
      'button',
      {
        class: `chip${filters.category === value ? ' on' : ''}`,
        'aria-pressed': String(filters.category === value),
        onclick: () => {
          filters.category = filters.category === value ? '' : value;
          renderChips();
          renderList();
        },
      },
      label,
      h('small', {}, String(count))
    );
  $('#chips').replaceChildren(
    ...state.categories.map((c) => chip(String(c.id), c.name, c.bookCount)),
    uncategorized ? chip(NO_CATEGORY, 'ללא קטגוריה', uncategorized) : null
  );
}

function matches(b) {
  const q = norm(filters.q);
  if (q && !norm(b.title).includes(q) && !norm(b.author).includes(q)) return false;
  if (filters.status === 'loaned' && !b.loanId) return false;
  if (filters.status === 'available' && b.loanId) return false;
  if (filters.category === NO_CATEGORY && b.categoryId) return false;
  if (filters.category && filters.category !== NO_CATEGORY && String(b.categoryId) !== filters.category) return false;
  if (filters.author && b.author !== filters.author) return false;
  if (filters.age && b.ageGroup !== filters.age) return false;
  return true;
}

function renderList() {
  let books = state.books.filter(matches);
  // בתצוגת "מושאלים" - ההשאלות הוותיקות ביותר ראשונות.
  if (filters.status === 'loaned') {
    books = [...books].sort((a, b) => a.loanedAt.localeCompare(b.loanedAt));
  }
  const active = Object.values(filters).some(Boolean);
  $('#clear').hidden = !active;
  $('#count').textContent = active ? `מוצגים ${books.length} מתוך ${state.books.length}` : '';

  const list = $('#list');
  if (!books.length) {
    list.replaceChildren(
      h(
        'div',
        { class: 'empty' },
        state.books.length
          ? 'לא נמצאו ספרים שמתאימים לסינון.'
          : 'הספריה עדיין ריקה. אפשר להוסיף ספר ראשון, או להדביק רשימה שלמה דרך "הוספה מרוכזת".'
      )
    );
    return;
  }
  list.replaceChildren(...books.map(card));
}

function card(b) {
  const days = b.loanId ? daysSince(b.loanedAt) : 0;
  return h(
    'article',
    { class: `card${b.loanId ? ' loaned' : ''}` },
    h('div', { class: 'card-title' }, b.title),
    b.author && h('div', { class: 'card-author' }, b.author),
    (b.category || b.ageGroup) &&
      h(
        'div',
        { class: 'tags' },
        b.category && h('span', { class: 'tag' }, b.category),
        b.ageGroup && h('span', { class: 'tag' }, b.ageGroup)
      ),
    b.notes && h('div', { class: 'card-notes' }, b.notes),
    b.loanId &&
      h(
        'div',
        { class: 'loan-box' },
        'אצל ',
        h('b', {}, b.borrower),
        ` · מ-${fmtDate(b.loanedAt)} `,
        h('span', { class: days > 60 ? 'late' : '' }, `(${agoText(days)})`)
      ),
    h(
      'div',
      { class: 'card-foot' },
      b.loanId
        ? h('button', { class: 'btn small primary', onclick: () => returnBook(b) }, 'הוחזר ✓')
        : h('button', { class: 'btn small', onclick: () => openLoanDialog(b) }, 'השאלה'),
      !b.loanId && h('span', { class: 'status-ok' }, 'על המדף'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'link', onclick: () => openBookDialog(b) }, 'עריכה')
    )
  );
}

// ---------- סינון ----------
$('#search').addEventListener('input', (e) => {
  filters.q = e.target.value;
  renderList();
});
$('#f-author').addEventListener('change', (e) => {
  filters.author = e.target.value;
  renderList();
});
$('#f-age').addEventListener('change', (e) => {
  filters.age = e.target.value;
  renderList();
});
$('#status').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  filters.status = btn.dataset.status;
  syncStatusButtons();
  renderList();
});
function syncStatusButtons() {
  for (const b of $('#status').children) b.classList.toggle('on', b.dataset.status === filters.status);
}
$('#clear').addEventListener('click', () => {
  for (const k of Object.keys(filters)) filters[k] = '';
  $('#search').value = '';
  syncStatusButtons();
  renderAll();
});

// ---------- חלונות ----------
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}

/** מריץ פעולה מול השרת; שגיאה מוצגת בתוך החלון ואינה סוגרת אותו. */
async function attempt(errorEl, fn) {
  errorEl.textContent = '';
  try {
    await fn();
    return true;
  } catch (e) {
    errorEl.textContent = e.message;
    return false;
  }
}

// --- ספר ---
let editing = null;

async function openBookDialog(book = null) {
  editing = book;
  const form = $('#form-book');
  $('#book-heading').textContent = book ? 'עריכת ספר' : 'ספר חדש';
  $('#book-error').textContent = '';
  setOptions(
    form.categoryId,
    [['', 'ללא קטגוריה'], ...state.categories.map((c) => [String(c.id), c.name])],
    String(book?.categoryId ?? (filters.category !== NO_CATEGORY ? filters.category : ''))
  );
  setOptions(form.ageGroup, [['', 'לא צוין'], ...state.ageGroups.map((a) => [a, a])], book?.ageGroup ?? '');
  form.title.value = book?.title ?? '';
  form.author.value = book?.author ?? '';
  form.notes.value = book?.notes ?? '';
  $('#book-delete').hidden = !book;

  const hist = $('#history');
  hist.hidden = true;
  $('#dlg-book').showModal();
  if (book) {
    const rows = await api('GET', `/books/${book.id}/history`).catch(() => []);
    if (rows.length && editing === book) {
      hist.replaceChildren(
        h('h3', {}, 'היסטוריית השאלות'),
        h(
          'ul',
          {},
          ...rows.map((r) =>
            h(
              'li',
              {},
              `${r.borrower} · ${fmtDate(r.loanedAt)} – ${r.returnedAt ? fmtDate(r.returnedAt) : 'עדיין אצלה'}`
            )
          )
        )
      );
      hist.hidden = false;
    }
  }
}

$('#btn-add').addEventListener('click', () => openBookDialog());

$('#form-book').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    title: f.title.value,
    author: f.author.value,
    categoryId: f.categoryId.value,
    ageGroup: f.ageGroup.value,
    notes: f.notes.value,
  };
  const ok = await attempt($('#book-error'), () =>
    editing ? api('PUT', `/books/${editing.id}`, body) : api('POST', '/books', body)
  );
  if (!ok) return;
  $('#dlg-book').close();
  toast(editing ? 'הספר עודכן' : 'הספר נוסף');
  await load();
});

$('#book-delete').addEventListener('click', async () => {
  if (!confirm(`למחוק את "${editing.title}" מהספריה? גם היסטוריית ההשאלות שלו תימחק.`)) return;
  const ok = await attempt($('#book-error'), () => api('DELETE', `/books/${editing.id}`));
  if (!ok) return;
  $('#dlg-book').close();
  toast('הספר נמחק');
  await load();
});

// --- השאלה ---
let loaning = null;

function openLoanDialog(book) {
  loaning = book;
  const form = $('#form-loan');
  $('#loan-book').textContent = book.author ? `${book.title} · ${book.author}` : book.title;
  $('#loan-error').textContent = '';
  form.borrower.value = '';
  form.date.value = todayStr();
  form.date.max = todayStr();
  $('#dlg-loan').showModal();
  form.borrower.focus();
}

$('#form-loan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const ok = await attempt($('#loan-error'), () =>
    api('POST', `/books/${loaning.id}/loan`, { borrower: f.borrower.value, date: f.date.value })
  );
  if (!ok) return;
  $('#dlg-loan').close();
  toast(`"${loaning.title}" נרשם כמושאל`);
  await load();
});

async function returnBook(book) {
  if (!confirm(`לסמן ש"${book.title}" הוחזר מ${book.borrower}?`)) return;
  try {
    await api('POST', `/books/${book.id}/return`, {});
    toast(`"${book.title}" חזר למדף`);
  } catch (e) {
    toast(e.message);
  }
  await load();
}

// --- קטגוריות ---
function renderCategoryManager() {
  $('#cat-list').replaceChildren(
    ...state.categories.map((c) => {
      const input = h('input', { value: c.name, maxlength: 60, 'aria-label': 'שם הקטגוריה' });
      const save = async () => {
        if (input.value.trim() === c.name) return;
        const ok = await attempt($('#cat-error'), () =>
          api('PUT', `/categories/${c.id}`, { name: input.value })
        );
        if (ok) toast('הקטגוריה עודכנה');
        await load();
        renderCategoryManager();
      };
      input.addEventListener('change', save);
      return h(
        'li',
        {},
        input,
        h('small', {}, `${c.bookCount} ספרים`),
        h(
          'button',
          {
            class: 'btn small danger',
            type: 'button',
            onclick: async () => {
              const note = c.bookCount ? ` ${c.bookCount} הספרים שבה יישארו בספריה, ללא קטגוריה.` : '';
              if (!confirm(`למחוק את הקטגוריה "${c.name}"?${note}`)) return;
              await attempt($('#cat-error'), () => api('DELETE', `/categories/${c.id}`));
              await load();
              renderCategoryManager();
            },
          },
          'מחיקה'
        )
      );
    })
  );
}

$('#btn-categories').addEventListener('click', () => {
  $('#cat-error').textContent = '';
  renderCategoryManager();
  $('#dlg-categories').showModal();
});

$('#form-cat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const ok = await attempt($('#cat-error'), () => api('POST', '/categories', { name: f.name.value }));
  if (ok) f.reset();
  await load();
  renderCategoryManager();
});

// --- הוספה מרוכזת ---
$('#btn-import').addEventListener('click', () => {
  $('#import-error').textContent = '';
  $('#dlg-import').showModal();
});

$('#form-import').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  let result;
  const ok = await attempt($('#import-error'), async () => {
    result = await api('POST', '/books/import', { text: f.text.value });
  });
  if (!ok) return;
  await load();
  if (result.errors.length) {
    $('#import-error').textContent =
      `נוספו ${result.added}. לא נוספו ${result.errors.length} שורות: ${result.errors.join(' ; ')}`;
    return;
  }
  f.reset();
  $('#dlg-import').close();
  toast(`נוספו ${result.added} ספרים${result.skipped ? ` · ${result.skipped} כבר היו ברשימה` : ''}`);
});

// --- כניסה ---
function showLogin() {
  const dlg = $('#dlg-login');
  if (dlg.open) return;
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  $('#login-error').textContent = '';
  dlg.showModal();
}
// חלון הכניסה נסגר רק אחרי התחברות מוצלחת.
$('#dlg-login').addEventListener('cancel', (e) => e.preventDefault());

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const ok = await attempt($('#login-error'), () => api('POST', '/login', { password: f.password.value }));
  if (!ok) return;
  f.reset();
  $('#dlg-login').close();
  await load();
});

$('#btn-logout').addEventListener('click', async () => {
  await api('POST', '/logout');
  state.books = [];
  renderAll();
  showLogin();
});

load().catch((e) => {
  if (!$('#dlg-login').open) toast(e.message);
});
