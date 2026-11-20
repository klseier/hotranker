# Hot Ranker · Sports Edition

Pick your favorite in head-to-head matchups and get your personal ranking of athletes.

**Live:** https://klseier.github.io/hotranker/

- Categories: football, tennis, volleyball, Formula 1, basketball — choose which ones to rank
- Real ties, undo, randomized pairs, accurate progress
- Progress is saved in the browser (localStorage)
- Keyboard: ← / → pick · ↓ tie · Backspace undo
- Plain HTML/CSS/JS, no build step

## Editing the list
Participants live in `js/data.js`. Each entry is `[id, 'Name', 'flag codes']`;
the photo must be `photos/<id>.webp` (4:5, ~560×700). Flags are in `assets/flags/`.
