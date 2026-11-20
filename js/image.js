// Renders the full result as a PNG table (canvas), then shares or downloads it.
import { SPORTS, COUNTRIES } from './data.js';
import { toast } from './ui.js';

const C = {
  bg: '#0d0b14', card: '#17141f', card2: '#211d2b', text: '#f4f1f8', muted: '#a39cb3',
  hot1: '#ff4d6d', hot2: '#ff9a3c', line: 'rgba(255,255,255,0.08)',
};
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function loadImg(src) {
  return new Promise((res) => {
    const i = new Image();
    const t = setTimeout(() => res(null), 4000);
    i.onload = () => { clearTimeout(t); res(i); };
    i.onerror = () => { clearTimeout(t); res(null); };
    i.src = src;
  });
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function cover(ctx, img, x, y, w, h, r) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = C.card2;
  ctx.fillRect(x, y, w, h);
  if (img) {
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) * 0.2, iw, ih);
  }
  ctx.restore();
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

const fmt = (v) => (v == null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * rows: [{ rank, tie, p, total?, vals?: [face, hot, weak] }]
 * rest: [p] (not ranked)
 */
export async function renderResultImage({ title, subtitle, rows, rest = [], footnote = '' }) {
  const W = 1080, pad = 44, gap = 16;
  const cols = rows.length > 22 ? 2 : 1;
  const colW = (W - pad * 2 - gap * (cols - 1)) / cols;
  const rowH = cols === 2 ? 62 : 74;
  const rowGap = 8;
  const perCol = Math.ceil(rows.length / cols);
  const headH = 190;
  const listH = perCol * (rowH + rowGap);
  const restCols = 3;
  const restH = rest.length ? 70 + Math.ceil(rest.length / restCols) * 34 : 0;
  const footH = 90;
  const H = Math.round(headH + listH + restH + footH);

  // preload images
  const ids = [...new Set([...rows.map((r) => r.p.id)])];
  const flagsNeeded = [...new Set(rows.flatMap((r) => r.p.flags))];
  const [photos, flags] = await Promise.all([
    Promise.all(ids.map((id) => loadImg(`photos/${id}.webp`))),
    Promise.all(flagsNeeded.map((f) => loadImg(`assets/flags/${f}.svg`))),
  ]);
  const photoOf = new Map(ids.map((id, i) => [id, photos[i]]));
  const flagOf = new Map(flagsNeeded.map((f, i) => [f, flags[i]]));

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.3, 0, 10, W * 0.3, 0, 620);
  glow.addColorStop(0, 'rgba(255,77,109,0.28)');
  glow.addColorStop(1, 'rgba(255,77,109,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 600);

  // header
  const grad = ctx.createLinearGradient(pad, 0, pad + 64, 64);
  grad.addColorStop(0, C.hot1); grad.addColorStop(1, C.hot2);
  ctx.fillStyle = grad;
  rr(ctx, pad, 44, 64, 64, 18); ctx.fill();
  ctx.font = `34px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⚡', pad + 32, 78);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.text;
  ctx.font = `800 46px ${FONT}`;
  ctx.fillText(title, pad + 84, 86);
  ctx.fillStyle = C.muted;
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(fit(ctx, subtitle, W - pad * 2 - 84), pad + 84, 122);
  ctx.strokeStyle = C.line;
  ctx.beginPath(); ctx.moveTo(pad, 160); ctx.lineTo(W - pad, 160); ctx.stroke();

  // rows
  rows.forEach((r, i) => {
    const col = Math.floor(i / perCol);
    const x = pad + col * (colW + gap);
    const y = headH + (i % perCol) * (rowH + rowGap);
    const medal = r.rank <= 3 ? ['#ffc94d', '#cfd6e3', '#d58b54'][r.rank - 1] : null;
    ctx.fillStyle = C.card;
    rr(ctx, x, y, colW, rowH, 14); ctx.fill();
    if (medal) { ctx.strokeStyle = medal; ctx.lineWidth = 2; rr(ctx, x + 1, y + 1, colW - 2, rowH - 2, 13); ctx.stroke(); }

    // rank
    ctx.fillStyle = medal || C.hot2;
    ctx.font = `800 ${cols === 2 ? 22 : 26}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(r.rank) + (r.tie ? '=' : ''), x + 30, y + rowH / 2 + 8);
    ctx.textAlign = 'left';

    // photo
    const av = rowH - 14;
    cover(ctx, photoOf.get(r.p.id), x + 58, y + 7, av, av, 10);

    const tx = x + 58 + av + 12;
    const right = x + colW - 14;
    // total
    let nameMax = right - tx;
    if (r.total != null) {
      ctx.font = `800 ${cols === 2 ? 24 : 28}px ${FONT}`;
      ctx.fillStyle = C.hot2;
      ctx.textAlign = 'right';
      ctx.fillText(r.total, right, y + (cols === 2 ? 28 : 33));
      ctx.textAlign = 'left';
      nameMax -= ctx.measureText(r.total).width + 12;
    }
    // name
    ctx.fillStyle = C.text;
    ctx.font = `700 ${cols === 2 ? 21 : 25}px ${FONT}`;
    ctx.fillText(fit(ctx, r.p.name, nameMax), tx, y + (cols === 2 ? 27 : 32));

    // second line: flags + sport (+ scores)
    let lx = tx;
    const ly = y + (cols === 2 ? 36 : 44);
    const fh = cols === 2 ? 15 : 18, fw = Math.round(fh * 4 / 3);
    for (const f of r.p.flags) {
      const im = flagOf.get(f);
      if (im) { try { ctx.save(); rr(ctx, lx, ly, fw, fh, 3); ctx.clip(); ctx.drawImage(im, lx, ly, fw, fh); ctx.restore(); } catch { ctx.restore(); } }
      lx += fw + 6;
    }
    ctx.font = `${cols === 2 ? 15 : 18}px ${FONT}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(SPORTS[r.p.sport].icon, lx, ly + fh - 2);
    lx += 26;
    if (r.vals) {
      ctx.font = `600 ${cols === 2 ? 16 : 19}px ${FONT}`;
      const parts = [['✨', r.vals[0]], ['🔥', r.vals[1]], ['🫠', r.vals[2]]];
      for (const [icon, v] of parts) {
        ctx.fillStyle = C.muted;
        ctx.fillText(icon, lx, ly + fh - 1);
        lx += cols === 2 ? 20 : 24;
        ctx.fillStyle = C.text;
        ctx.fillText(fmt(v), lx, ly + fh - 1);
        lx += ctx.measureText(fmt(v)).width + (cols === 2 ? 12 : 16);
      }
    } else if (cols === 1) {
      ctx.fillText(SPORTS[r.p.sport].label + ' · ' + r.p.flags.map((f) => COUNTRIES[f] || f).join(' / '), lx, ly + fh - 1);
    }
  });

  // not ranked
  let y = headH + listH;
  if (rest.length) {
    ctx.fillStyle = C.muted;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText('Not ranked', pad, y + 40);
    ctx.font = `500 19px ${FONT}`;
    const cw = (W - pad * 2) / restCols;
    rest.forEach((p, i) => {
      ctx.fillStyle = C.text;
      ctx.fillText(fit(ctx, p.name, cw - 16), pad + (i % restCols) * cw, y + 76 + Math.floor(i / restCols) * 34);
    });
    y += restH;
  }

  // footer
  ctx.strokeStyle = C.line;
  ctx.beginPath(); ctx.moveTo(pad, y + 24); ctx.lineTo(W - pad, y + 24); ctx.stroke();
  ctx.fillStyle = C.muted;
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText(footnote, pad, y + 62);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.hot2;
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText(location.host + location.pathname.replace(/index\.html$/, ''), W - pad, y + 62);
  ctx.textAlign = 'left';

  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

export async function saveResultImage(opts, fileName = 'hot-ranker.png') {
  if (!opts.rows.length) { toast('Nothing to share yet'); return; }
  toast('Making your image…');
  const blob = await renderResultImage(opts);
  if (!blob) { toast('Could not create the image'); return; }
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [file], title: opts.title }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Image saved');
}
