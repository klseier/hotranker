// Interactive merge sort with real ties, undo and resumable state.
//
// The whole ranking is a pure function of (items, seed, answers):
// we replay the sort from scratch on every step, reading previous answers
// from a map. When the sort needs a comparison nobody has answered yet,
// it stops and reports that pair. Undo = drop the last answer and replay.
// Replaying costs a few hundred cheap operations, so this is instant.

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

/**
 * Replays the sort.
 * Returns { done: true, groups } when finished,
 * or { done: false, pair: [a, b] } with the next question.
 */
export function step(ids, seed, answers) {
  const m = answerMap(answers);
  const start = shuffle(ids, seed).map((id) => [id]);
  let pending = null;
  try {
    const groups = sortGroups(start, (a, b) => {
      const r = lookup(m, a, b);
      if (r === undefined) { pending = [a, b]; throw NEED; }
      return r;
    });
    return { done: true, groups };
  } catch (e) {
    if (e !== NEED) throw e;
    return { done: false, pair: pending };
  }
}

/**
 * Estimates how many more questions are left by finishing the sort
 * with random answers (averaged over a few runs).
 */
export function estimateRemaining(ids, seed, answers, runs = 4) {
  const m = answerMap(answers);
  const start = shuffle(ids, seed).map((id) => [id]);
  let total = 0;
  for (let k = 0; k < runs; k++) {
    const rnd = mulberry32(seed + 7919 * (k + 1) + answers.length);
    const extra = new Map();
    let asked = 0;
    sortGroups(start, (a, b) => {
      let r = lookup(m, a, b);
      if (r === undefined) r = lookup(extra, a, b);
      if (r === undefined) {
        r = rnd() < 0.5 ? -1 : 1;
        extra.set(a + '|' + b, r);
        asked++;
      }
      return r;
    });
    total += asked;
  }
  return Math.round(total / runs);
}

/** Rough upper estimate before starting, for the setup screen. */
export function estimateTotal(n) {
  if (n < 2) return 0;
  return Math.round(n * Math.log2(n) - 1.2 * n + 1);
}
