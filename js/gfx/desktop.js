// The desktop's 50% checkerboard and the 1-bit arrow cursor.
import { Bitmap, paint } from './bitmap.js';
import { scale } from '../core/scale.js';

export function applyDesktopPattern(el) {
  const bm = new Bitmap(2, 2);
  bm.set(0, 0);
  bm.set(1, 1);
  const c = document.createElement('canvas');
  paint(c, bm);
  el.style.backgroundImage = `url(${c.toDataURL('image/png')})`;
}

// A diagonal arrow pointing up-left: a solid head and a shaft, black with a
// white rim so it stays visible on black areas. Hotspot at the tip.
function arrowRows() {
  const N = 16;
  const ink = (x, y) => (x + y <= 9 && x >= 0 && y >= 0) || (Math.abs(x - y) <= 1 && x + y >= 7 && x <= 12 && y <= 12);
  const rows = [];
  for (let y = -1; y < N; y++) {
    let row = '';
    for (let x = -1; x < N; x++) {
      if (ink(x, y)) row += 'X';
      else {
        let edge = false;
        for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (ink(x + dx, y + dy)) edge = true;
        row += edge ? 'o' : ' ';
      }
    }
    rows.push(row);
  }
  return rows;
}

export function applyCursor() {
  const rows = arrowRows();
  const k = scale.k;
  const c = document.createElement('canvas');
  c.width = rows[0].length * k;
  c.height = rows.length * k;
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ' ') return;
    ctx.fillStyle = ch === 'X' ? '#000' : '#fff';
    ctx.fillRect(x * k, y * k, k, k);
  }));
  const url = c.toDataURL('image/png');
  const dpr = window.devicePixelRatio || 1;
  const hot = Math.round(scale.css); // the tip is one pixel in from the corner
  const candidates = [
    `image-set(url("${url}") ${dpr}x) ${hot} ${hot}, default`,
    `-webkit-image-set(url("${url}") ${dpr}x) ${hot} ${hot}, default`,
    `url("${url}") ${hot} ${hot}, default`,
  ];
  const value = candidates.find((v) => CSS.supports('cursor', v)) || 'default';
  document.documentElement.style.cursor = value;
}
