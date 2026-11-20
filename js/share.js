// Shareable result links. The whole result is packed into the URL hash
// (#r=...), so no server is needed: whoever opens the link sees the ranking.
import { SPORTS, PARTICIPANTS } from './data.js';
import { el, photoBox, metaLine, toast } from './ui.js';

const byId = new Map(PARTICIPANTS.map((p) => [p.id, p]));
const $ = (s) => document.querySelector(s);

/* ---------- encoding ---------- */
const b64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encode(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined') {
    try { return 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw'))); } catch { /* fall through */ }
  }
  return 'j' + b64url(raw);
}

export async function decode(str) {
  const kind = str[0];
  const bytes = unb64url(str.slice(1));
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

export async function makeLink(payload) {
  const base = location.origin + location.pathname;
  return `${base}#r=${await encode(payload)}`;
}

/* ---------- clipboard / native share ---------- */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:absolute;left:-9999px;top:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

/**
 * Wires a set of share buttons.
 * getPayload() -> payload object or null (nothing to share yet)
 * getText()    -> plain text version
 * title        -> share sheet title
 */
export function wireShare({ linkBtn, textBtn, nativeBtn, getPayload, getText, title }) {
  const empty = () => toast('Nothing to share yet');
  linkBtn.onclick = async () => {
    const p = getPayload();
    if (!p) return empty();
    const url = await makeLink(p);
    toast((await copyText(url)) ? 'Link copied — send it to anyone' : 'Could not copy the link');
  };
  textBtn.onclick = async () => {
    const t = getText();
    if (!t) return empty();
    toast((await copyText(t)) ? 'Ranking copied as text' : 'Copy is not available here');
  };
  if (nativeBtn) {
    if (!navigator.share) { nativeBtn.hidden = true; return; }
    nativeBtn.hidden = false;
    nativeBtn.onclick = async () => {
      const p = getPayload();
      if (!p) return empty();
      const url = await makeLink(p);
      const top = getText().split('\n').slice(1, 4).join('\n');
      navigator.share({ title, text: `${title}\n${top}\n…full ranking:`, url }).catch(() => {});
    };
  }
}

/* ---------- payload builders ---------- */
export function h2hPayload(session, label) {
  return { v: 1, t: 'h', m: label, n: session.answers.length, g: session.groups, r: session.rest || [] };
}

export function scoresPayload(scores, weights, ids) {
  const s = {};
  for (const id of ids) {
    const x = scores[id];
    if (x && x.face != null && x.hot != null && x.weak != null) s[id] = [x.face * 2, x.hot * 2, x.weak * 2];
  }
  if (!Object.keys(s).length) return null;
  return { v: 1, t: 's', w: [weights.face, weights.hot, weights.weak], s };
}

/* ---------- shared view ---------- */
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function row(rank, tie, p, extra) {
  const li = el('li', 'rank-row');
  li.append(el('div', 'rank-no' + (tie ? ' tie' : ''), rank), photoBox(p, 'avatar'));
  const body = el('div', 'rank-body');
  const top = el('div', 'board-top');
  top.append(el('div', 'rank-name', p.name));
  if (extra) top.append(el('div', 'board-score', extra.total));
  body.append(top);
  if (extra) {
    const bars = el('div', 'bars');
    extra.vals.forEach(([icon, label, v]) => {
      const b = el('div', 'bar');
      b.title = `${label}: ${fmt(v)}`;
      const track = el('span', 'bar-track');
      const fill = el('i');
      fill.style.width = (v / 10) * 92 + 8 + '%';
      track.append(fill);
      b.append(el('span', 'bar-icon', icon), track, el('span', 'bar-val', fmt(v)));
      bars.append(b);
    });
    body.append(bars);
  } else {
    body.append(metaLine(p));
  }
  li.append(body);
  return li;
}

function renderH2H(d, list) {
  let pos = 1;
  let count = 0;
  for (const g of d.g) {
    const ps = g.map((id) => byId.get(id)).filter(Boolean);
    for (const p of ps) { list.append(row(pos, ps.length > 1, p)); count++; }
    pos += ps.length;
  }
  const rest = (d.r || []).map((id) => byId.get(id)).filter(Boolean);
  $('#shared-meta').textContent = `Head-to-head · ${d.m} · ${d.n} picks`;
  return rest;
}

function renderScores(d, list) {
  const [wf, wh, ww] = d.w;
  const tw = wf + wh + ww || 1;
  const rows = Object.entries(d.s)
    .filter(([id]) => byId.has(id))
    .map(([id, [f, h, w]]) => {
      const F = f / 2, H = h / 2, W = w / 2;
      return { p: byId.get(id), F, H, W, o: (F * wf + H * wh + W * ww) / tw };
    })
    .sort((a, b) => b.o.toFixed(2) - a.o.toFixed(2) || b.W - a.W || a.p.name.localeCompare(b.p.name));
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    const key = r.o.toFixed(2) + '|' + r.W;
    if (key !== prev) rank = i + 1;
    const tie = rows.some((x, j) => j !== i && x.o.toFixed(2) + '|' + x.W === key);
    prev = key;
    list.append(row(rank, tie, r.p, {
      total: r.o.toFixed(2),
      vals: [['✨', 'Facecard', r.F], ['🔥', 'Hotness', r.H], ['🫠', 'Weakness', r.W]],
    }));
  });
  const pct = (x) => Math.round((x / tw) * 100);
  $('#shared-meta').textContent = `Scores · ${rows.length} athletes · weights ✨${pct(wf)}% 🔥${pct(wh)}% 🫠${pct(ww)}%`;
  return [];
}

export async function showShared(code) {
  let d;
  try { d = await decode(code); } catch { d = null; }
  const list = $('#shared-list');
  list.textContent = '';
  const restWrap = $('#shared-rest');
  restWrap.hidden = true;
  if (!d || !d.t) {
    $('#shared-meta').textContent = 'This link looks broken or incomplete.';
    return;
  }
  const rest = d.t === 'h' ? renderH2H(d, list) : renderScores(d, list);
  if (rest.length) {
    restWrap.hidden = false;
    const grid = $('#shared-rest-grid');
    grid.textContent = '';
    for (const p of rest.sort((a, b) => a.name.localeCompare(b.name))) {
      const it = el('div', 'rest-item');
      it.append(photoBox(p, 'avatar'), el('span', '', p.name));
      grid.append(it);
    }
  }
  $('#shared-copy').onclick = async () => toast((await copyText(location.href)) ? 'Link copied' : 'Could not copy the link');
}

export { SPORTS };
