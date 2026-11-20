import { SPORTS, COUNTRIES, PARTICIPANTS } from './data.js';
import { step, estimateRemaining, estimateTotal } from './sorter.js';

const STORE_KEY = 'hotranker:v1';
const byId = new Map(PARTICIPANTS.map((p) => [p.id, p]));
const $ = (s) => document.querySelector(s);

/* ---------------- state ---------------- */
let selected = new Set(Object.keys(SPORTS));
let mode = null; // null = full ranking, otherwise top K
const MODES = [[null, 'Full', 'every place'], [20, 'Top 20', 'faster'], [10, 'Top 10', 'fastest']];
let session = null; // { seed, sports, ids, answers, finished }
let busy = false;
let current = null; // [a, b]
let resultFilter = 'all';

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(session)); } catch { /* private mode */ }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!s || !Array.isArray(s.ids) || !Array.isArray(s.answers)) return null;
    s.ids = s.ids.filter((id) => byId.has(id)); // list may have changed since
    return s;
  } catch { return null; }
}
function clearSaved() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}

/* ---------------- helpers ---------------- */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function photoBox(p, cls) {
  const box = el('div', cls);
  box.append(el('div', 'initials', initials(p.name)));
  const img = new Image();
  img.alt = p.name;
  img.decoding = 'async';
  img.onload = () => img.classList.add('loaded');
  img.onerror = () => img.remove();
  img.src = `photos/${p.id}.webp`;
  if (img.complete && img.naturalWidth) img.classList.add('loaded');
  box.append(img);
  return box;
}
function metaLine(p, withLabel = true) {
  const m = el('div', 'meta');
  for (const f of p.flags) {
    const i = new Image();
    i.className = 'flag';
    i.src = `assets/flags/${f}.svg`;
    i.alt = i.title = COUNTRIES[f] || f;
    m.append(i);
  }
  const s = SPORTS[p.sport];
  const tag = el('span', 'sport-tag', s.icon + ' ');
  if (withLabel) tag.append(el('span', 'label', s.label));
  m.append(tag);
  return m;
}
const preloaded = new Set();
function preload(id) {
  if (!id || preloaded.has(id)) return;
  preloaded.add(id);
  const i = new Image();
  i.src = `photos/${id}.webp`;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function show(name) {
  for (const s of ['setup', 'duel', 'results']) $('#screen-' + s).hidden = s !== name;
  window.scrollTo(0, 0);
}

/* ---------------- setup screen ---------------- */
function idsFor(sports) {
  return PARTICIPANTS.filter((p) => sports.has(p.sport)).map((p) => p.id);
}

function renderSetup() {
  const wrap = $('#sport-chips');
  wrap.textContent = '';
  for (const [key, s] of Object.entries(SPORTS)) {
    const n = PARTICIPANTS.filter((p) => p.sport === key).length;
    const b = el('button', 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', selected.has(key));
    b.append(el('span', '', s.icon), el('span', '', s.label), el('span', 'count', n));
    b.onclick = () => {
      selected.has(key) ? selected.delete(key) : selected.add(key);
      renderSetup();
    };
    wrap.append(b);
  }
  const picker = $('#mode-picker');
  picker.textContent = '';
  const nSel = idsFor(selected).length;
  for (const [k, label, note] of MODES) {
    const b = el('button', 'seg');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', k === mode);
    b.append(el('b', '', label), el('small', '', nSel >= 2 ? `~${estimateTotal(nSel, k)} picks` : note));
    b.onclick = () => { mode = k; renderSetup(); };
    picker.append(b);
  }

  const n = nSel;
  const all = selected.size === Object.keys(SPORTS).length;
  $('#btn-toggle-all').textContent = all ? 'Clear all' : 'Select all';
  $('#setup-summary').innerHTML = n < 2
    ? 'Pick at least two athletes to start.'
    : `<b>${n}</b> athletes · about <b>${estimateTotal(n, mode)}</b> picks` + (mode && mode < n ? ` · exact top ${mode}` : ' · full ranking');
  $('#btn-start').disabled = n < 2;

  const saved = load();
  const card = $('#resume-card');
  if (saved && saved.ids.length > 1) {
    const done = saved.finished;
    const pct = done ? 100 : progressPct(saved);
    $('#resume-meta').textContent = done
      ? `Finished ranking of ${saved.ids.length} athletes`
      : `${modeLabel(saved)} · ${saved.ids.length} athletes · ${saved.answers.length} picks · ${pct}%`;
    $('#btn-resume').textContent = done ? 'View results' : 'Resume';
    card.hidden = false;
  } else {
    card.hidden = true;
  }
}

$('#btn-toggle-all').onclick = () => {
  const all = selected.size === Object.keys(SPORTS).length;
  selected = all ? new Set() : new Set(Object.keys(SPORTS));
  renderSetup();
};

$('#btn-start').onclick = () => {
  const ids = idsFor(selected);
  if (ids.length < 2) return;
  session = {
    seed: (Math.random() * 2 ** 31) | 0,
    sports: [...selected],
    ids,
    top: mode,
    answers: [],
    finished: false,
  };
  save();
  startDuel();
};

$('#btn-resume').onclick = () => {
  session = load();
  if (!session) return renderSetup();
  if (session.finished) return showResults();
  startDuel();
};

$('#btn-discard').onclick = () => {
  clearSaved();
  renderSetup();
};

/* ---------------- duel screen ---------------- */
function modeLabel(s) {
  return s.top && s.top < s.ids.length ? `Top ${s.top}` : 'Full ranking';
}

function progressPct(s) {
  const done = s.answers.length;
  const left = estimateRemaining(s.ids, s.seed, s.answers, s.top);
  if (done + left === 0) return 100;
  return Math.min(99, Math.floor((done / (done + left)) * 100));
}

function fillCard(btn, p) {
  btn.className = 'card';
  btn.textContent = '';
  btn.setAttribute('aria-label', `Pick ${p.name}`);
  btn.append(photoBox(p, 'photo'));
  const info = el('div', 'card-info');
  info.append(el('div', 'card-name', p.name), metaLine(p));
  btn.append(info);
}

function startDuel() {
  show('duel');
  next();
}

function next() {
  const r = step(session.ids, session.seed, session.answers, session.top);
  if (r.done) {
    session.finished = true;
    session.groups = r.groups;
    session.rest = r.rest;
    save();
    return showResults();
  }
  current = r.pair;
  const [a, b] = current;
  fillCard($('#card-a'), byId.get(a));
  fillCard($('#card-b'), byId.get(b));

  const n = session.answers.length;
  $('#pick-no').textContent = `Pick ${n + 1}`;
  const pct = progressPct(session);
  $('#pick-pct').textContent = `${pct}%`;
  $('#progress-fill').style.width = pct + '%';
  $('#btn-undo').disabled = n === 0;
  busy = false;

  // preload photos for every possible next pair
  for (const res of [-1, 1, 0]) {
    const nx = step(session.ids, session.seed, [...session.answers, { a, b, r: res }], session.top);
    if (!nx.done) nx.pair.forEach(preload);
  }
}

function answer(res) {
  if (busy || !current) return;
  busy = true;
  const [a, b] = current;
  const ca = $('#card-a'), cb = $('#card-b');
  if (res === 0) { ca.classList.add('tied'); cb.classList.add('tied'); }
  else if (res < 0) { ca.classList.add('picked'); cb.classList.add('lost'); }
  else { cb.classList.add('picked'); ca.classList.add('lost'); }
  session.answers.push({ a, b, r: res });
  save();
  setTimeout(next, 220);
}

function undo() {
  if (busy || !session || session.answers.length === 0) return;
  session.answers.pop();
  session.finished = false;
  delete session.groups;
  delete session.rest;
  save();
  next();
  toast('Last pick undone');
}

$('#card-a').onclick = () => answer(-1);
$('#card-b').onclick = () => answer(1);
$('#btn-tie').onclick = () => answer(0);
$('#btn-undo').onclick = undo;
$('#btn-home').onclick = () => { show('setup'); renderSetup(); };

document.addEventListener('keydown', (e) => {
  if ($('#screen-duel').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === '1') answer(-1);
  else if (k === 'ArrowRight' || k === '2') answer(1);
  else if (k === 'ArrowDown' || k === ' ' || k === 't' || k === 'T') answer(0);
  else if (k === 'Backspace' || k === 'z' || k === 'Z') undo();
  else return;
  e.preventDefault();
});

/* ---------------- results screen ---------------- */
function rankedRows(groups, sport) {
  // returns [{ rank, tie, p }]
  const rows = [];
  let pos = 1;
  for (const g of groups) {
    const members = g.map((id) => byId.get(id)).filter((p) => p && (sport === 'all' || p.sport === sport));
    if (!members.length) continue;
    for (const p of members) rows.push({ rank: pos, tie: members.length > 1, p });
    pos += members.length;
  }
  return rows;
}

function showResults() {
  if (!session.groups) {
    const r = step(session.ids, session.seed, session.answers, session.top);
    session.groups = r.groups;
    session.rest = r.rest;
  }
  show('results');
  const sportsIn = [...new Set(session.ids.map((id) => byId.get(id).sport))];
  $('#results-meta').textContent =
    `${modeLabel(session)} · ${session.ids.length} athletes · ${session.answers.length} picks`;

  const f = $('#result-filter');
  f.textContent = '';
  f.hidden = sportsIn.length < 2;
  if (!sportsIn.includes(resultFilter)) resultFilter = 'all';
  const tabs = [['all', '🏅', 'All'], ...sportsIn.map((k) => [k, SPORTS[k].icon, SPORTS[k].label])];
  for (const [key, icon, label] of tabs) {
    const b = el('button', 'chip');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', key === resultFilter);
    b.append(el('span', '', icon), el('span', '', label));
    b.onclick = () => { resultFilter = key; renderRanking(); showFilterState(); };
    f.append(b);
  }
  renderRanking();
}

function showFilterState() {
  [...$('#result-filter').children].forEach((b, i) => {
    const key = i === 0 ? 'all' : [...new Set(session.ids.map((id) => byId.get(id).sport))][i - 1];
    b.setAttribute('aria-selected', key === resultFilter);
  });
}

function renderRanking() {
  const rows = rankedRows(session.groups, resultFilter);

  const podium = $('#podium');
  podium.textContent = '';
  const top = rows.slice(0, 3);
  const order = top.length === 3 ? [1, 0, 2] : top.map((_, i) => i);
  podium.style.gridTemplateColumns = top.length === 3 ? '1fr 1.15fr 1fr' : `repeat(${top.length}, minmax(0, 200px))`;
  podium.style.justifyContent = 'center';
  const medals = ['🥇', '🥈', '🥉'];
  for (const i of order) {
    const { p, rank } = top[i];
    const item = el('div', `podium-item p${Math.min(rank, 3)}`);
    item.append(photoBox(p, 'podium-photo'), el('div', 'medal', medals[Math.min(rank, 3) - 1]),
      el('div', 'podium-name', p.name), metaLine(p, false));
    podium.append(item);
  }

  const list = $('#ranking');
  list.textContent = '';
  for (const { rank, tie, p } of rows.slice(3)) {
    const li = el('li', 'rank-row');
    const no = el('div', 'rank-no' + (tie ? ' tie' : ''), rank);
    const body = el('div', 'rank-body');
    body.append(el('div', 'rank-name', p.name), metaLine(p));
    li.append(no, photoBox(p, 'avatar'), body);
    list.append(li);
  }

  const rest = (session.rest || []).map((id) => byId.get(id))
    .filter((p) => p && (resultFilter === 'all' || p.sport === resultFilter))
    .sort((x, y) => x.name.localeCompare(y.name));
  $('#rest').hidden = rest.length === 0;
  const grid = $('#rest-grid');
  grid.textContent = '';
  for (const p of rest) {
    const it = el('div', 'rest-item');
    it.append(photoBox(p, 'avatar'), el('span', '', p.name));
    grid.append(it);
  }
}

function resultText() {
  const rows = rankedRows(session.groups, resultFilter);
  const base = session.top && session.top < session.ids.length ? `My Hot Ranker · Top ${session.top}` : 'My Hot Ranker';
  const title = resultFilter === 'all' ? base : `${base} · ${SPORTS[resultFilter].label}`;
  return `${title}\n` + rows.map(({ rank, tie, p }) => `${rank}${tie ? '=' : '.'} ${p.name} ${SPORTS[p.sport].icon}`).join('\n');
}

$('#btn-copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(resultText());
    toast('Ranking copied');
  } catch {
    toast('Copy is not available here');
  }
};
if (navigator.share) {
  $('#btn-share').hidden = false;
  $('#btn-share').onclick = () => navigator.share({ title: 'My Hot Ranker', text: resultText(), url: location.href }).catch(() => {});
}
$('#btn-again').onclick = () => { clearSaved(); session = null; show('setup'); renderSetup(); };

/* ---------------- boot ---------------- */
renderSetup();
show('setup');
