/* Folio — online library. Data is stored in the browser (localStorage).
   Replace the `Store` section with API calls to a real backend to share data between devices. */
'use strict';

/* ---------- Store (database layer) ---------- */
const KEY = 'folio-db-v1';
const Store = {
  db: null,
  load() {
    try { this.db = JSON.parse(localStorage.getItem(KEY)); } catch { this.db = null; }
    if (!this.db) this.db = { users: [], books: [], comments: [], lib: {}, session: null };
    const url = 'https://online.fliphtml5.com/vboim/ykgf/';
    if (!this.db.books.some(b => b.embed === url)) {
      this.db.books.push({ bid: newBookId(), title: "English File Intermediate — Student's Book (4th ed.)",
        desc: 'Flipbook hosted on FlipHTML5, shown here in its original viewer.', text: '', embed: url,
        author: null, exclusive: false, price: 0, created: Date.now() });
    }
    this.save();
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
    h('div', { class: 'info' }, h('b', {}, b.title), a ? a.name : 'External source', ' ', h('span', { class: 'id' }, b.bid)));
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

const EXT_OK = u => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)fliphtml5\.com$/.test(x.hostname); } catch { return false; } };

function paginate(text, limit = 900) {
  const pages = []; let cur = '', cost = 0;
  for (const tok of text.split(/(\s+)/)) {
    const c = tok.length + (tok.match(/\n/g) || []).length * 50;
    if (cost + c > limit && cur.trim()) { pages.push(cur.trim()); cur = ''; cost = 0; }
    cur += tok; cost += c;
  }
  if (cur.trim()) pages.push(cur.trim());
  return pages.length ? pages : [''];
}

function pageRead(bid) {
  const b = Store.db.books.find(x => x.bid === bid);
  if (!b) return h('p', { class: 'empty' }, 'No book has that ID.');
  if (!canRead(b)) return h('div', { class: 'panel' }, h('p', {}, 'This is an exclusive book. Purchase it to start reading.'),
    h('a', { class: 'btn', href: '#/book/' + bid }, 'Go to book'));
  if (b.embed) return !EXT_OK(b.embed) ? h('p', { class: 'empty' }, 'Invalid book link.') : h('div', {},
    h('div', { class: 'row' }, h('a', { href: '#/book/' + bid }, '← Back'), h('b', {}, b.title),
      h('a', { class: 'btn ghost', href: b.embed, target: '_blank', rel: 'noopener noreferrer' }, 'Open in new tab')),
    h('iframe', { class: 'embed', src: b.embed, title: b.title, allowfullscreen: '' }));

  const u = me(), pages = paginate(b.text);
  let two = innerWidth >= 720, step = two ? 2 : 1, busy = false;
  const saved = (u && libOf(u)[bid]?.progress) || 0;
  let cur = Math.max(0, Math.round(saved * pages.length) - step); if (two) cur -= cur % 2;
  const pg = i => pages[i] ?? '';
  const left = h('div', { class: 'pg left' }), right = h('div', { class: 'pg right' });
  const stage = h('div', { class: 'book3d' + (two ? '' : ' single') }, two ? left : '', right);
  const fill = h('i'), label = h('span', {});
  const face = (t, side) => h('div', { class: 'pg face ' + side }, t);

  function show() {
    left.textContent = pg(cur); right.textContent = pg(cur + (two ? 1 : 0));
    const end = Math.min(pages.length, cur + step);
    label.textContent = `Page ${two && cur + 1 < pages.length ? (cur + 1) + '–' + end : cur + 1} of ${pages.length}`;
    fill.style.width = Math.round(end / pages.length * 100) + '%';
  }
  function save() {
    if (!u) return;
    const l = libOf(u); l[bid] = { ...l[bid], progress: Math.min(1, (cur + step) / pages.length) }; Store.save();
  }
  function turn(dir) {
    const nxt = cur + dir * step;
    if (busy || nxt < 0 || nxt >= pages.length) return;
    busy = true;
    const forward = dir > 0 || !two;
    const leaf = h('div', { class: 'leaf ' + (forward ? 'next' : 'prev') + (two ? '' : ' single') });
    let front, back = '';
    if (!two) { front = pg(cur); right.textContent = pg(nxt); }
    else if (dir > 0) { front = pg(cur + 1); back = pg(cur + 2); right.textContent = pg(cur + 3); }
    else { front = pg(cur); back = pg(cur - 1); left.textContent = pg(cur - 2); }
    leaf.append(face(front, 'front'), face(back, 'back')); stage.append(leaf);
    leaf.getBoundingClientRect();
    requestAnimationFrame(() => { leaf.style.transform = forward ? 'rotateY(-180deg)' : 'rotateY(180deg)'; });
    setTimeout(() => { cur = nxt; leaf.remove(); show(); save(); busy = false; }, 850);
  }
  const onKey = e => {
    if (!location.hash.startsWith('#/read/')) return removeEventListener('keydown', onKey);
    if (e.key === 'ArrowRight') turn(1); if (e.key === 'ArrowLeft') turn(-1);
  };
  const onResize = () => {
    if (!location.hash.startsWith('#/read/')) return removeEventListener('resize', onResize);
    if ((innerWidth >= 720) !== two) route();
  };
  addEventListener('keydown', onKey); addEventListener('resize', onResize);
  let x0 = null;
  stage.addEventListener('pointerdown', e => { x0 = e.clientX; });
  stage.addEventListener('pointerup', e => {
    if (x0 == null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) return turn(dx < 0 ? 1 : -1);
    const r = stage.getBoundingClientRect(); turn(e.clientX - r.left > r.width / 2 ? 1 : -1);
  });
  show();
  return h('div', {},
    h('div', { class: 'row' }, h('a', { href: '#/book/' + bid }, '← Back'), h('b', {}, b.title)),
    h('div', { class: 'flip' }, stage),
    h('div', { class: 'row flipctl' },
      h('button', { class: 'btn ghost', onclick: () => turn(-1) }, '← Previous'), label,
      h('button', { class: 'btn', onclick: () => turn(1) }, 'Next →')),
    h('div', { class: 'bar-progress' }, fill));
}

function pageUpload() {
  if (!me()) return h('div', { class: 'panel' }, h('p', {}, 'Sign in to publish books.'),
    h('button', { class: 'btn', onclick: () => openAuth('login') }, 'Sign in'));
  const f = h('form', { class: 'panel', onsubmit: e => {
    e.preventDefault();
    const d = new FormData(f), text = d.get('text').trim();
    const embed = d.get('embed').trim();
    if (embed && !EXT_OK(embed)) return toast('Use an https link from fliphtml5.com.');
    if (!embed && text.length < 20) return toast('Add at least a few sentences of text, or a flipbook link.');
    const price = d.get('exclusive') ? Math.max(1, Number(d.get('price')) || 1) : 0;
    const bid = newBookId();
    Store.db.books.push({ bid, title: d.get('title').trim(), desc: d.get('desc').trim(), text, embed,
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
    h('label', {}, 'Book text', h('textarea', { name: 'text', rows: 10 })),
    h('label', {}, 'Or link an existing flipbook (fliphtml5.com, optional)', h('input', { name: 'embed', type: 'url', placeholder: 'https://online.fliphtml5.com/…' })),
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
