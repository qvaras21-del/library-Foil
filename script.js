/* Folio — online library. Data is stored in the browser (localStorage).
   Replace the `Store` section with API calls to a real backend to share data between devices. */
'use strict';

/* ---------- Store (database layer) ---------- */
const KEY = 'folio-db-v1';
const Store = {
  db: null,
  load() {
    try { this.db = JSON.parse(localStorage.getItem(KEY)); } catch { this.db = null; }
    if (!this.db) { this.db = { users: [], books: [], comments: [], lib: {}, session: null }; this.save(); }
  },
  save() { localStorage.setItem(KEY, JSON.stringify(this.db)); },
};
const uid = () => Math.random().toString(36).slice(2, 10);
const me = () => Store.db.users.find(u => u.id === Store.db.session) || null;
const userOf = id => Store.db.users.find(u => u.id === id);
const libOf = (u = me()) => (u ? (Store.db.lib[u.id] ||= {}) : {});

function newBookId() {
  let id;
  do { id = 'BK-' + (100000 + Math.floor(Math.random() * 900000)); }
  while (Store.db.books.some(b => b.bid === id));
  return id;
}

async function hash(text, salt) {
  const data = new TextEncoder().encode(salt + text);
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return btoa(salt + text); // fallback for non-secure contexts (demo only)
}

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  kids.flat().forEach(c => e.append(c?.nodeType ? c : document.createTextNode(c ?? '')));
  return e;
}
const COLORS = ['#0f5f73', '#7a3e65', '#3f6b45', '#8a4b1f', '#33477a', '#6b3a3a'];
const colorFor = s => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const money = n => '$' + Number(n).toFixed(2);
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}
const requireLogin = () => { if (me()) return true; openAuth('login'); return false; };

/* ---------- Components ---------- */
function bookCard(b) {
  const a = userOf(b.author);
  return h('a', { class: 'book', href: '#/book/' + b.bid },
    h('div', { class: 'cover', style: 'background:' + colorFor(b.title) },
      h('span', {}, b.title), h('small', {}, b.exclusive ? 'Exclusive · ' + money(b.price) : 'Free')),
    h('div', { class: 'info' }, h('b', {}, b.title), a ? a.name : 'Unknown author', ' ', h('span', { class: 'id' }, b.bid)));
}
const shelf = (list, msg = 'Nothing here yet.') =>
  list.length ? h('div', { class: 'shelf' }, list.map(bookCard)) : h('p', { class: 'empty' }, msg);

/* ---------- Pages ---------- */
function pageHome() {
  const free = Store.db.books.filter(b => !b.exclusive).sort((a, b) => b.created - a.created);
  return h('div', {},
    h('section', { class: 'hero' },
      h('h1', {}, 'A library written by its readers.'),
      h('p', {}, 'Publish your own books, read what others have shared, and unlock exclusive titles.'),
      h('div', { class: 'row' },
        h('a', { class: 'btn', href: '#/upload' }, 'Publish a book'),
        h('a', { class: 'btn ghost', href: '#/exclusive' }, 'Browse exclusive'))),
    h('h2', {}, 'Free to read'),
    shelf(free, 'No books yet. Be the first to publish one.'));
}

function pageExclusive() {
  return h('div', {}, h('h2', {}, 'Exclusive books'),
    h('p', { class: 'empty' }, 'Buy once, read any time. Content unlocks after payment.'),
    shelf(Store.db.books.filter(b => b.exclusive), 'No exclusive books yet.'));
}

function pageSearch(q) {
  const s = q.trim().toLowerCase();
  const res = Store.db.books.filter(b =>
    b.bid.toLowerCase() === s || b.bid.toLowerCase() === 'bk-' + s || b.title.toLowerCase().includes(s));
  return h('div', {}, h('h2', {}, `Results for “${q}”`), shelf(res, 'No book matches that title or ID.'));
}

function canRead(b) {
  const u = me();
  return !b.exclusive || (u && (b.author === u.id || libOf(u)[b.bid]?.purchased));
}

function pageBook(bid) {
  const b = Store.db.books.find(x => x.bid === bid);
  if (!b) return h('p', { class: 'empty' }, 'No book has that ID.');
  const u = me(), entry = u ? libOf(u)[bid] || {} : {}, a = userOf(b.author);
  const actions = [];
  if (canRead(b)) actions.push(h('a', { class: 'btn', href: '#/read/' + bid }, entry.progress > 0 ? 'Continue reading' : 'Read now'));
  else actions.push(h('button', { class: 'btn gold', onclick: () => checkout(b) }, 'Buy for ' + money(b.price)));
  actions.push(h('button', { class: 'btn ghost', onclick: () => {
    if (!requireLogin()) return;
    const l = libOf(); l[bid] = { ...l[bid], saved: !l[bid]?.saved }; Store.save(); route();
  } }, entry.saved ? 'Saved ✓' : 'Save to library'));
  if (u && u.id === b.author) actions.push(h('button', { class: 'btn danger', onclick: () => {
    if (!confirm('Delete this book permanently?')) return;
    Store.db.books = Store.db.books.filter(x => x.bid !== bid); Store.save(); location.hash = '#/';
  } }, 'Delete'));
  return h('div', { class: 'panel detail' },
    h('div', { class: 'cover', style: 'background:' + colorFor(b.title) }, h('span', {}, b.title)),
    h('div', {}, h('h1', {}, b.title),
      h('p', {}, 'By ', a ? h('a', { href: '#/profile/' + a.id }, a.name) : 'Unknown'),
      b.exclusive ? h('span', { class: 'badge' }, 'Exclusive') : '',
      h('p', {}, b.desc || 'No description.'),
      h('p', {}, 'Book ID: ', h('span', { class: 'id' }, b.bid)),
      h('div', { class: 'row' }, actions)));
}

function pageRead(bid) {
  const b = Store.db.books.find(x => x.bid === bid);
  if (!b) return h('p', { class: 'empty' }, 'No book has that ID.');
  if (!canRead(b)) return h('div', { class: 'panel' }, h('p', {}, 'This is an exclusive book. Purchase it to start reading.'),
    h('a', { class: 'btn', href: '#/book/' + bid }, 'Go to book'));
  const u = me(), fill = h('i', { style: `width:${Math.round((u && libOf(u)[bid]?.progress || 0) * 100)}%` });
  let timer;
  const onScroll = () => {
    if (!location.hash.startsWith('#/read/')) return removeEventListener('scroll', onScroll);
    const r = Math.min(1, scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight));
    fill.style.width = r * 100 + '%';
    if (!u) return;
    clearTimeout(timer);
    timer = setTimeout(() => { const l = libOf(u); l[bid] = { ...l[bid], progress: r }; Store.save(); }, 800);
  };
  addEventListener('scroll', onScroll);
  return h('div', {}, h('div', { class: 'readbar' },
      h('div', { class: 'row' }, h('a', { href: '#/book/' + bid }, '← Back'), h('b', {}, b.title)),
      h('div', { class: 'bar-progress' }, fill)),
    h('article', { class: 'reader' }, b.text));
}

function pageUpload() {
  if (!me()) return h('div', { class: 'panel' }, h('p', {}, 'Sign in to publish books.'),
    h('button', { class: 'btn', onclick: () => openAuth('login') }, 'Sign in'));
  const f = h('form', { class: 'panel', onsubmit: e => {
    e.preventDefault();
    const d = new FormData(f), text = d.get('text').trim();
    if (text.length < 20) return toast('Add at least a few sentences of text.');
    const price = d.get('exclusive') ? Math.max(1, Number(d.get('price')) || 1) : 0;
    const bid = newBookId();
    Store.db.books.push({ bid, title: d.get('title').trim(), desc: d.get('desc').trim(), text,
      author: me().id, exclusive: !!d.get('exclusive'), price, created: Date.now() });
    Store.save(); toast('Published! Book ID: ' + bid); location.hash = '#/book/' + bid;
  } },
    h('h2', {}, 'Publish a book'),
    h('label', {}, 'Title', h('input', { name: 'title', required: true, maxlength: 120 })),
    h('label', {}, 'Short description', h('input', { name: 'desc', maxlength: 300 })),
    h('label', {}, 'Upload a .txt or .md file (optional)', h('input', { type: 'file', accept: '.txt,.md', onchange: async e => {
      const file = e.target.files[0]; if (!file) return;
      f.text.value = await file.text(); if (!f.title.value) f.title.value = file.name.replace(/\.\w+$/, '');
    } })),
    h('label', {}, 'Book text', h('textarea', { name: 'text', rows: 10, required: true })),
    h('label', {}, h('input', { type: 'checkbox', name: 'exclusive' }), 'Make this an exclusive (paid) book'),
    h('label', {}, 'Price (USD)', h('input', { name: 'price', type: 'number', min: 1, step: '0.5', value: '4.99' })),
    h('button', { class: 'btn' }, 'Publish'));
  return f;
}

function pageLibrary() {
  if (!me()) return h('div', { class: 'panel' }, h('p', {}, 'Sign in to see your personal library.'),
    h('button', { class: 'btn', onclick: () => openAuth('login') }, 'Sign in'));
  const l = libOf();
  const mine = Store.db.books.filter(b => l[b.bid]?.saved || l[b.bid]?.purchased || l[b.bid]?.progress > 0);
  return h('div', {}, h('h2', {}, 'My library'),
    mine.length ? mine.map(b => {
      const e = l[b.bid], pct = Math.round((e.progress || 0) * 100);
      return h('div', { class: 'panel' }, h('div', { class: 'row' },
        h('a', { href: '#/book/' + b.bid }, h('b', {}, b.title)), h('span', { class: 'id' }, b.bid),
        e.purchased ? h('span', { class: 'badge' }, 'Purchased') : ''),
        h('div', { class: 'bar-progress', style: 'margin:10px 0 4px' }, h('i', { style: `width:${pct}%` })),
        h('small', {}, pct + '% read'));
    }) : h('p', { class: 'empty' }, 'Save or buy books and they will appear here.'));
}

function pageProfile(id) {
  const p = userOf(id);
  if (!p) return h('p', { class: 'empty' }, 'This profile does not exist.');
  const u = me(), mine = u && u.id === id;
  const bio = h('textarea', { rows: 3, maxlength: 500 }, p.bio || '');
  const box = h('textarea', { rows: 3, maxlength: 500, placeholder: 'Write a comment…' });
  const cs = Store.db.comments.filter(c => c.to === id).sort((a, b) => b.at - a.at);
  return h('div', {},
    h('div', { class: 'panel' }, h('h1', {}, p.name + (mine ? ' (you)' : '')),
      mine ? h('div', {}, h('label', {}, 'Your bio', bio),
        h('button', { class: 'btn', onclick: () => { p.bio = bio.value.trim(); Store.save(); toast('Profile saved'); } }, 'Save profile'))
        : h('p', {}, p.bio || 'No bio yet.')),
    h('h2', {}, 'Books by ' + p.name),
    shelf(Store.db.books.filter(b => b.author === id), 'No books published yet.'),
    h('h2', {}, 'Comments'),
    h('div', { class: 'panel' }, box,
      h('button', { class: 'btn', onclick: () => {
        if (!requireLogin()) return;
        const t = box.value.trim(); if (!t) return;
        Store.db.comments.push({ id: uid(), to: id, by: u.id, text: t, at: Date.now() }); Store.save(); route();
      } }, 'Post comment'),
      cs.length ? cs.map(c => h('div', { class: 'comment' },
        h('b', {}, userOf(c.by)?.name || 'Reader'), ' ', h('span', {}, new Date(c.at).toLocaleDateString()),
        h('p', {}, c.text),
        u && (u.id === c.by || u.id === id) ? h('a', { href: '#', onclick: e => {
          e.preventDefault(); Store.db.comments = Store.db.comments.filter(x => x.id !== c.id); Store.save(); route();
        } }, 'Delete') : '')) : h('p', { class: 'empty' }, 'No comments yet. Say hello.')));
}

/* ---------- Checkout (demo) ---------- */
function checkout(b) {
  if (!requireLogin()) return;
  const dlg = $('#payDlg');
  $('#payBody').replaceChildren(
    h('h2', {}, 'Checkout'), h('p', {}, `${b.title} — ${money(b.price)}`),
    h('p', { class: 'empty' }, 'Demo mode: no real payment is taken. In production, redirect to Stripe or Paddle and unlock the book from their payment confirmation on your server.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn gold', onclick: () => {
        const l = libOf(); l[b.bid] = { ...l[b.bid], purchased: true, paidAt: Date.now() };
        Store.save(); dlg.close(); toast('Payment successful. Book unlocked.'); route();
      } }, 'Pay ' + money(b.price)),
      h('button', { class: 'btn ghost', onclick: () => dlg.close() }, 'Cancel')));
  dlg.showModal();
}

/* ---------- Auth ---------- */
let authMode = 'login';
function openAuth(mode) {
  authMode = mode;
  $('#authTitle').textContent = mode === 'login' ? 'Sign in' : 'Create an account';
  $('#nameRow').hidden = mode === 'login';
  $('#authSwitch').textContent = mode === 'login' ? 'Create an account' : 'I have an account';
  $('#authErr').textContent = '';
  $('#authDlg').showModal();
}
$('#authSwitch').onclick = () => openAuth(authMode === 'login' ? 'register' : 'login');
$('#authClose').onclick = () => $('#authDlg').close();
$('#authForm').addEventListener('submit', async e => {
  const d = new FormData(e.target), email = d.get('email').trim().toLowerCase(), pw = d.get('password');
  const err = m => { e.preventDefault(); $('#authErr').textContent = m; };
  let user = Store.db.users.find(u => u.email === email);
  if (authMode === 'register') {
    if (user) return err('That email is already registered. Sign in instead.');
    const name = d.get('name').trim(); if (!name) return err('Enter a display name.');
    const salt = uid();
    user = { id: uid(), name, email, salt, hash: await hash(pw, salt), bio: '' };
    Store.db.users.push(user);
  } else if (!user || user.hash !== await hash(pw, user.salt)) return err('Email or password is incorrect.');
  Store.db.session = user.id; Store.save(); toast('Welcome, ' + user.name); route();
});

/* ---------- Router and nav ---------- */
function renderNav() {
  const u = me(), nav = $('#nav'), cur = location.hash;
  const link = (href, t) => h('a', { href, class: cur === href ? 'on' : '' }, t);
  nav.replaceChildren(link('#/', 'Library'), link('#/exclusive', 'Exclusive'), link('#/mylibrary', 'My library'), link('#/upload', 'Upload'),
    u ? link('#/profile/' + u.id, u.name) : '',
    u ? h('button', { onclick: () => { Store.db.session = null; Store.save(); location.hash = '#/'; route(); } }, 'Sign out')
      : h('button', { class: 'btn', onclick: () => openAuth('login') }, 'Sign in'));
}
function route() {
  const [, page, arg] = (location.hash || '#/').split('/').map(decodeURIComponent);
  const pages = { '': pageHome, exclusive: pageExclusive, mylibrary: pageLibrary, upload: pageUpload,
    book: () => pageBook(arg), read: () => pageRead(arg), profile: () => pageProfile(arg), search: () => pageSearch(arg || '') };
  renderNav(); $('#nav').classList.remove('open');
  $('#app').replaceChildren((pages[page || ''] || pageHome)());
}
$('#searchForm').addEventListener('submit', e => {
  e.preventDefault(); const q = $('#q').value.trim(); if (q) location.hash = '#/search/' + encodeURIComponent(q);
});
$('#burger').onclick = () => $('#nav').classList.toggle('open');
addEventListener('hashchange', () => { route(); scrollTo(0, 0); });

/* ---------- Start ---------- */
Store.load();
route();
