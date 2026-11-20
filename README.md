# Hot Ranker · Sports Edition

Pick your favorite in head-to-head matchups and get your personal ranking of athletes.

**Live:** https://klseier.github.io/hotranker/

- Categories: football, tennis, volleyball, Formula 1, basketball — choose which ones to rank
- Full ranking (merge sort with galloping) or fast Top 20 / Top 10 (knockout bracket)
- Pair order: Quick (list order — fewer picks when your taste matches it) or Random pairs
- Real ties, undo, randomized pairs, accurate progress
- Progress is saved in the browser (localStorage)
- Keyboard: ← / → pick · ↓ tie · Backspace undo
- Plain HTML/CSS/JS, no build step

## Editing the list
Participants live in `js/data.js`. Each entry is `[id, 'Name', 'flag codes']`;
the photo must be `photos/<id>.webp` (4:5, ~560×700). Flags are in `assets/flags/`.

## Scores tab
A second way to rank (`#scores`): rate each athlete 0–10 (step 0.5) for
✨ Facecard, 🔥 Hotness and 🫠 Weakness / Obsession. The ranking is a weighted average
(default weights 33% / 33% / 34%, adjustable; on equal totals the higher Weakness / Obsession ranks higher), updates live and is saved in the browser. Two layouts: Cards (one athlete at a time) and List (many rows, sortable by total or any category).

## Sharing
Both result screens have a "Copy link" button. The whole result is packed into
the URL hash (`#r=…`, compressed), so anyone opening the link sees the full
ranking with photos — no server needed.
