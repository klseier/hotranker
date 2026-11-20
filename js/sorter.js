// Interactive ranking with real ties, undo and resumable state.
//
// The whole ranking is a pure function of (items, seed, mode, answers):
// we replay the algorithm from scratch on every step, reading previous
// answers from a map. When it needs a comparison nobody has answered yet,
// it stops and reports that pair. Undo = drop the last answer and replay.
//
// Two modes:
//  • full  (top = null) — merge sort, every athlete gets an exact place.
//  • top K (top = k)    — knockout bracket: the winner is found in n−1 picks,
//                         every next place costs only ~log2(n) more picks,
//                         because all earlier results are reused.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, seed) {
  const a = arr.slice();
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const NEED = Symbol('need');

/* ---------- full ranking: merge sort over groups of tied items ---------- */
// cmp(a, b) -> -1 (a ranks higher), 1 (b ranks higher), 0 (tie)
function sortGroups(groups, cmp) {
  if (groups.length <= 1) return groups;
  const mid = groups.length >> 1;
  const left = sortGroups(groups.slice(0, mid), cmp);
  const right = sortGroups(groups.slice(mid), cmp);
  const out = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    const r = cmp(left[i][0], right[j][0]);
    if (r < 0) out.push(left[i++]);
    else if (r > 0) out.push(right[j++]);
    else out.push(left[i++].concat(right[j++])); // tie: merge into one group
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}

/* ---------- top K: repeated knockout over a fixed bracket ---------- */
function topK(order, k, cmp) {
  const removed = new Set();
  const winner = (lo, hi) => {
    if (hi - lo === 1) return removed.has(order[lo]) ? null : order[lo];
    const mid = (lo + hi) >> 1;
    const a = winner(lo, mid);
    const b = winner(mid, hi);
    if (a === null) return b;
    if (b === null) return a;
    return cmp(a, b) <= 0 ? a : b; // a tie keeps the left one for now
  };
  const picked = [];
  const limit = Math.min(k, order.length);
  while (picked.length < limit) {
    const c = winner(0, order.length);
    if (c === null) break;
    picked.push(c);
    removed.add(c);
  }
  // consecutive places that were declared a tie share the place
  const groups = [];
  for (const id of picked) {
    const last = groups[groups.length - 1];
    if (last && cmp.peek(last[0], id) === 0) last.push(id);
    else groups.push([id]);
  }
  const rest = order.filter((id) => !removed.has(id));
  return { groups, rest };
}

/* ---------- shared plumbing ---------- */
function answerMap(answers) {
  const m = new Map();
  for (const { a, b, r } of answers) m.set(a + '|' + b, r);
  return m;
}
function lookup(m, a, b) {
  if (m.has(a + '|' + b)) return m.get(a + '|' + b);
  if (m.has(b + '|' + a)) return -m.get(b + '|' + a);
  return undefined;
}

function run(ids, seed, top, cmp) {
  const order = shuffle(ids, seed);
  if (top && top < ids.length) return topK(order, top, cmp);
  return { groups: sortGroups(order.map((id) => [id]), cmp), rest: [] };
}

/**
 * Replays the ranking.
 * Returns { done: true, groups, rest } when finished,
 * or { done: false, pair: [a, b] } with the next question.
 */
export function step(ids, seed, answers, top = null) {
  const m = answerMap(answers);
  let pending = null;
  const cmp = (a, b) => {
    const r = lookup(m, a, b);
    if (r === undefined) { pending = [a, b]; throw NEED; }
    return r;
  };
  cmp.peek = (a, b) => lookup(m, a, b);
  try {
    return { done: true, ...run(ids, seed, top, cmp) };
  } catch (e) {
    if (e !== NEED) throw e;
    return { done: false, pair: pending };
  }
}

/** Estimates how many questions are left by finishing with random answers. */
export function estimateRemaining(ids, seed, answers, top = null, runs = 4) {
  const m = answerMap(answers);
  let total = 0;
  for (let k = 0; k < runs; k++) {
    const rnd = mulberry32(seed + 7919 * (k + 1) + answers.length);
    const extra = new Map();
    let asked = 0;
    const cmp = (a, b) => {
      let r = lookup(m, a, b);
      if (r === undefined) r = lookup(extra, a, b);
      if (r === undefined) {
        r = rnd() < 0.5 ? -1 : 1;
        extra.set(a + '|' + b, r);
        asked++;
      }
      return r;
    };
    cmp.peek = (a, b) => lookup(m, a, b) ?? lookup(extra, a, b);
    run(ids, seed, top, cmp);
    total += asked;
  }
  return Math.round(total / runs);
}

/** Rough estimate before starting, for the setup screen. */
export function estimateTotal(n, top = null) {
  if (n < 2) return 0;
  if (top && top < n) return Math.round(n - 1 + (top - 1) * (Math.log2(n) - 0.5));
  return Math.round(n * Math.log2(n) - 1.2 * n + 1);
}
