import { SPORTS, COUNTRIES } from './data.js';

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
export function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
export function photoBox(p, cls) {
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
export function metaLine(p, withLabel = true) {
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
const $t = () => document.querySelector('#toast');
let toastTimer;
export function toast(msg) {
  const t = $t();
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
