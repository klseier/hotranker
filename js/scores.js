// "Scores" tab: rate every athlete 1–10 (step 0.5) in three categories,
// the ranking is a weighted average and updates live.
import { SPORTS, PARTICIPANTS } from './data.js';
import { el, photoBox, metaLine, toast } from './ui.js';

const KEY = 'hotranker:scores:v1';
const MIN = 1, MAX = 10, STEP = 0.5;

export const CRITERIA = [
  { key: 'face', icon: '✨', label: 'Facecard', hint: 'Beauty — as objective as you can be' },
  { key: 'hot', icon: '🔥', label: 'Hotness', hint: 'How attractive they are to you' },
  { key: 'weak', icon: '🫠', label: 'Weakness', hint: 'Your level of weakness for them' },
];

const $ = (s) => document.querySelector(s);
const byId = new Map(PARTICIPANTS.map((p) => [p.id, p]));

let state = loadState();
let filter = 'all';
let unratedOnly = false;
let currentId = null;
let started = false;

function loadState() {
  const empty = { scores: {}, weights: { face: 1, hot: 1, weak: 1 } };
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (!s || typeof s.scores !== 'object') return empty;
    return { scores: s.scores, weights: { ...empty.weights, ...(s.weights || {}) } };
  } catch { return empty; }
}
function saveState() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

const fmt = (v) => (v == null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(1));
const clamp = (v) => Math.min(MAX, Math.max(MIN, Math.round(v / STEP) * STEP));

/* ---------- maths ---------- */
function overall(id) {
  const sc = state.scores[id];
  if (!sc) return null;
  let sum = 0, w = 0;
  for (const c of CRITERIA) {
    const v = sc[c.key];
    const wt = state.weights[c.key];
    if (v != null && wt > 0) { sum += v * wt; w += wt; }
  }
  return w ? sum / w : null;
}
function isComplete(id) {
  const sc = state.scores[id];
  return !!sc && CRITERIA.every((c) => sc[c.key] != null);
}
function isTouched(id) {
  const sc = state.scores[id];
  return !!sc && CRITERIA.some((c) => sc[c.key] != null);
}

function visibleIds() {
  return PARTICIPANTS.filter((p) => filter === 'all' || p.sport === filter).map((p) => p.id);
}
function queue() {
  const ids = visibleIds();
  return unratedOnly ? ids.filter((id) => !isComplete(id) || id === currentId) : ids;
}

/* ---------- rater ---------- */
function renderFilter() {
  const wrap = $('#score-filter');
  wrap.textContent = '';
  const tabs = [['all', '🏅', 'All'], ...Object.entries(SPORTS).map(([k, s]) => [k, s.icon, s.label])];
  for (const [key, icon, label] of tabs) {
    const b = el('button', 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', key === filter);
    b.append(el('span', '', icon), el('span', '', label));
    b.onclick = () => {
      filter = key;
      const q = queue();
      if (!q.includes(currentId)) currentId = firstUnrated(q) ?? q[0] ?? null;
      renderAll();
    };
    wrap.append(b);
  }
}

function firstUnrated(ids) {
  return ids.find((id) => !isComplete(id));
}

function renderProgress() {
  const ids = visibleIds();
  const done = ids.filter(isComplete).length;
  $('#rated-fill').style.width = (ids.length ? (done / ids.length) * 100 : 0) + '%';
  const q = queue();
  const i = q.indexOf(currentId);
  $('#rater-pos').textContent = `${i + 1} of ${q.length} · ${done}/${ids.length} fully rated`;
}

function renderAthlete() {
  const p = byId.get(currentId);
  const photo = $('#rater-photo');
  photo.textContent = '';
  if (!p) {
    $('#rater-name').textContent = unratedOnly ? 'All done here 🎉' : 'Nobody in this category';
    $('#rater-meta').textContent = '';
    $('#criteria').hidden = true;
    return;
  }
  $('#criteria').hidden = false;
  photo.append(photoBox(p, 'photo'));
  $('#rater-name').textContent = p.name;
  const meta = $('#rater-meta');
  meta.textContent = '';
  meta.append(metaLine(p));
  renderCriteria();
}

function renderCriteria() {
  const wrap = $('#criteria');
  wrap.textContent = '';
  const sc = state.scores[currentId] || {};
  for (const c of CRITERIA) {
    const v = sc[c.key];
    const row = el('div', 'crit' + (v == null ? ' unset' : ''));
    const head = el('div', 'crit-head');
    const title = el('div', 'crit-title');
    title.append(el('span', 'crit-icon', c.icon), el('b', '', c.label), el('small', '', c.hint));
    const val = el('div', 'crit-val', fmt(v));
    head.append(title, val);

    const ctrl = el('div', 'crit-ctrl');
    const minus = el('button', 'step-btn', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', `${c.label} minus 0.5`);
    const plus = el('button', 'step-btn', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', `${c.label} plus 0.5`);
    const range = document.createElement('input');
    range.type = 'range';
    range.min = MIN; range.max = MAX; range.step = STEP;
    range.value = v ?? 5.5;
    range.className = 'range';
    range.setAttribute('aria-label', c.label);
    paintRange(range);

    const set = (nv) => {
      nv = clamp(nv);
      setScore(c.key, nv);
      range.value = nv;
      paintRange(range);
      val.textContent = fmt(nv);
      row.classList.remove('unset');
      val.classList.remove('bump'); void val.offsetWidth; val.classList.add('bump');
    };
    range.addEventListener('input', () => set(+range.value));
    range.addEventListener('pointerup', () => set(+range.value)); // tap on the current spot also counts
    range.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set((state.scores[currentId]?.[c.key] ?? 5) + STEP); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set((state.scores[currentId]?.[c.key] ?? 6) - STEP); }
    });
    minus.onclick = () => set((state.scores[currentId]?.[c.key] ?? 6) - STEP);
    plus.onclick = () => set((state.scores[currentId]?.[c.key] ?? 5) + STEP);

    const ticks = el('div', 'ticks');
    for (let t = 1; t <= 10; t++) ticks.append(el('span', '', t));
    const mid = el('div', 'range-wrap');
    mid.append(range, ticks);
    ctrl.append(minus, mid, plus);
    row.append(head, ctrl);
    wrap.append(row);
  }
  renderOverall();
}

function paintRange(r) {
  r.style.setProperty('--pct', ((r.value - MIN) / (MAX - MIN)) * 100 + '%');
}

function setScore(key, v) {
  const sc = (state.scores[currentId] ||= {});
  sc[key] = v;
  saveState();
  renderOverall();
  renderProgress();
  scheduleBoard();
}

function renderOverall() {
  const o = overall(currentId);
  $('#overall').textContent = o == null ? '—' : o.toFixed(2);
}

function go(delta) {
  const q = queue();
  if (!q.length) { currentId = null; return renderAthlete(); }
  let i = q.indexOf(currentId);
  i = i === -1 ? 0 : (i + delta + q.length) % q.length;
  currentId = q[i];
  renderAthlete();
  renderProgress();
}

function nextAfterRating() {
  const q = queue();
  if (unratedOnly) {
    const i = q.indexOf(currentId);
    const rest = [...q.slice(i + 1), ...q.slice(0, i)].filter((id) => !isComplete(id));
    if (rest.length) { currentId = rest[0]; renderAthlete(); renderProgress(); return; }
    if (isComplete(currentId)) { toast('Everyone here is rated 🎉'); return; }
  }
  go(1);
}

/* ---------- board ---------- */
let boardTimer = null;
function scheduleBoard() {
  clearTimeout(boardTimer);
  boardTimer = setTimeout(renderBoard, 80);
}

function rows() {
  return visibleIds()
    .filter(isTouched)
    .map((id) => ({ id, p: byId.get(id), o: overall(id), done: isComplete(id) }))
    .filter((r) => r.o != null)
    .sort((a, b) => b.o - a.o
      || (state.scores[b.id].hot ?? 0) - (state.scores[a.id].hot ?? 0)
      || a.p.name.localeCompare(b.p.name));
}

function renderBoard() {
  const list = $('#board-list');
  list.textContent = '';
  const rs = rows();
  $('#board-empty').hidden = rs.length > 0;
  $('#board-count').textContent = rs.filter((r) => r.done).length ? `(${rs.filter((r) => r.done).length})` : '';
  const done = rs.filter((r) => r.done);
  const ranked = [...done, ...rs.filter((r) => !r.done)];
  let rank = 0, prev = null;
  ranked.forEach((r, i) => {
    const key = r.o.toFixed(2);
    if (r.done && key !== prev) rank = i + 1;
    const tie = r.done && done.some((x) => x !== r && x.o.toFixed(2) === key);
    prev = key;
    if (!r.done && (i === 0 || ranked[i - 1].done)) list.append(el('li', 'board-sep', 'Not fully rated yet'));
    const li = el('li', 'board-row' + (r.id === currentId ? ' current' : '') + (r.done ? '' : ' partial'));
    li.tabIndex = 0;
    const no = el('div', 'rank-no' + (tie ? ' tie' : ''), r.done ? rank : '·');
    const body = el('div', 'rank-body');
    const top = el('div', 'board-top');
    top.append(el('div', 'rank-name', r.p.name), el('div', 'board-score', r.o.toFixed(2)));
    const bars = el('div', 'bars');
    for (const c of CRITERIA) {
      const v = state.scores[r.id][c.key];
      const b = el('div', 'bar');
      b.title = `${c.label}: ${fmt(v)}`;
      const fill = el('i');
      fill.style.width = v == null ? '0' : ((v - MIN) / (MAX - MIN)) * 92 + 8 + '%';
      const track = el('span', 'bar-track');
      track.append(fill);
      b.append(el('span', 'bar-icon', c.icon), track, el('span', 'bar-val', fmt(v)));
      bars.append(b);
    }
    body.append(top, bars);
    li.append(no, photoBox(r.p, 'avatar'), body);
    const open = () => { currentId = r.id; setView('rate'); renderAll(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    li.onclick = open;
    li.onkeydown = (e) => { if (e.key === 'Enter') open(); };
    list.append(li);
  });
}

function renderWeights() {
  const body = $('#weights-body');
  body.textContent = '';
  const total = CRITERIA.reduce((s, c) => s + state.weights[c.key], 0) || 1;
  $('#weights-summary').textContent = CRITERIA.map((c) => `${c.icon} ${Math.round((state.weights[c.key] / total) * 100)}%`).join('  ');
  for (const c of CRITERIA) {
    const row = el('div', 'weight-row');
    const r = document.createElement('input');
    r.type = 'range'; r.min = 0; r.max = 3; r.step = 0.5; r.value = state.weights[c.key];
    r.className = 'range range-sm';
    r.setAttribute('aria-label', `${c.label} weight`);
    r.style.setProperty('--pct', (state.weights[c.key] / 3) * 100 + '%');
    const v = el('span', 'weight-val', '×' + fmt(state.weights[c.key]).replace('—', '0'));
    r.oninput = () => {
      state.weights[c.key] = +r.value;
      r.style.setProperty('--pct', (r.value / 3) * 100 + '%');
      v.textContent = '×' + r.value;
      saveState();
      renderOverall();
      scheduleBoard();
      const t = CRITERIA.reduce((s, x) => s + state.weights[x.key], 0) || 1;
      $('#weights-summary').textContent = CRITERIA.map((x) => `${x.icon} ${Math.round((state.weights[x.key] / t) * 100)}%`).join('  ');
    };
    row.append(el('span', 'weight-label', `${c.icon} ${c.label}`), r, v);
    body.append(row);
  }
}

/* ---------- view switch (phones) ---------- */
function setView(v) {
  $('#scores-layout').dataset.view = v;
  document.querySelectorAll('#view-switch .seg').forEach((b) => b.setAttribute('aria-checked', b.dataset.view === v));
}

function renderAll() {
  renderFilter();
  renderAthlete();
  renderProgress();
  renderBoard();
}

function boardText() {
  return 'My Hot Ranker · Scores\n' + rows().filter((r) => r.done).map((r, i) => {
    const sc = state.scores[r.id];
    return `${i + 1}. ${r.p.name} — ${r.o.toFixed(2)} (✨${fmt(sc.face)} 🔥${fmt(sc.hot)} 🫠${fmt(sc.weak)})`;
  }).join('\n');
}

/* ---------- swipe on photo ---------- */
function bindSwipe(node) {
  let x0 = null, y0 = null;
  node.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; });
  node.addEventListener('pointerup', (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  });
}

function bindOnce() {
  $('#prev-athlete').onclick = () => go(-1);
  $('#next-athlete').onclick = () => go(1);
  $('#next-btn').onclick = nextAfterRating;
  $('#clear-scores').onclick = () => {
    delete state.scores[currentId];
    saveState();
    renderCriteria();
    renderProgress();
    scheduleBoard();
  };
  $('#unrated-only').onchange = (e) => {
    unratedOnly = e.target.checked;
    const q = queue();
    if (!q.includes(currentId)) currentId = firstUnrated(q) ?? q[0] ?? null;
    renderAll();
  };
  document.querySelectorAll('#view-switch .seg').forEach((b) => { b.onclick = () => setView(b.dataset.view); });
  $('#copy-scores').onclick = async () => {
    try { await navigator.clipboard.writeText(boardText()); toast('Ranking copied'); }
    catch { toast('Copy is not available here'); }
  };
  let armed = false;
  $('#reset-scores').onclick = (e) => {
    if (!armed) {
      armed = true;
      e.target.textContent = 'Tap again to erase all scores';
      setTimeout(() => { armed = false; e.target.textContent = 'Reset all scores'; }, 3000);
      return;
    }
    state.scores = {};
    saveState();
    armed = false;
    e.target.textContent = 'Reset all scores';
    currentId = visibleIds()[0];
    renderAll();
    toast('All scores cleared');
  };
  bindSwipe($('#rater-photo'));
  document.addEventListener('keydown', (e) => {
    if ($('#screen-scores').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && e.target.tagName !== 'LI') {
      e.preventDefault();
      if (e.shiftKey) go(-1); else nextAfterRating();
    }
  });
}

export function openScores() {
  if (!started) {
    started = true;
    bindOnce();
    renderWeights();
    currentId = firstUnrated(visibleIds()) ?? visibleIds()[0];
  }
  renderAll();
}
