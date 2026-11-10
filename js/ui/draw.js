// Helpers that turn 1-bit bitmaps and bitmap-font text into pixel-scaled canvases.
import { Bitmap, paint, INK, PAPER } from '../gfx/bitmap.js';
import { fonts } from '../gfx/font.js';
import { sizeCanvas } from '../core/scale.js';

export function showBitmap(bm, canvas = document.createElement('canvas'), zoom = 1) {
  paint(canvas, bm);
  sizeCanvas(canvas, bm.w, bm.h, zoom);
  return canvas;
}

export function textWidth(str, { font = fonts.regular, bold = false } = {}) {
  return font.measure(str) + (bold ? 1 : 0);
}

// Text on its own bitmap. `invert` gives white-on-black (reverse video).
export function textBitmap(str, { font = fonts.regular, bold = false, invert = false, padX = 0, padY = 0, width = 0, align = 'left' } = {}) {
  const tw = textWidth(str, { font, bold });
  const w = Math.max(width, tw + padX * 2);
  const bm = new Bitmap(w, font.height + padY * 2);
  if (invert) bm.clear(INK);
  const x = align === 'center' ? Math.floor((w - tw) / 2) : align === 'right' ? w - padX - tw : padX;
  bm.text(font, str, x, padY, { v: invert ? PAPER : INK, bold });
  return bm;
}

export function textCanvas(str, opts, canvas) {
  return showBitmap(textBitmap(str, opts), canvas);
}

// Small pixel-art glyphs written as strings: 'X' = ink, anything else = paper.
export function fromPattern(rows) {
  const bm = new Bitmap(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((c, x) => c === 'X' && bm.set(x, y)));
  return bm;
}

export const GLYPHS = {
  check: fromPattern([
    '.......X',
    '......XX',
    '.....XX.',
    'X...XX..',
    'XX.XX...',
    '.XXX....',
    '..X.....',
  ]),
  // Down-pointing triangle for drop-down choices.
  down: fromPattern([
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
  ]),
  // Two arrows chasing each other: the classic "cycle" item marker.
  cycle: fromPattern([
    '...XXXXX...',
    '..X.....X..',
    '.X.......XX',
    'X.......XXX',
    'X......XXXX',
    'X..........',
    '..........X',
    'XXXX......X',
    'XXX.......X',
    'XX.......X.',
    '..X.....X..',
    '...XXXXX...',
  ]),
};

// Copy the ink of `glyph` into `bm` at (x, y) using colour v.
export function stamp(bm, glyph, x, y, v = INK) {
  for (let gy = 0; gy < glyph.h; gy++) {
    for (let gx = 0; gx < glyph.w; gx++) if (glyph.data[gy * glyph.w + gx]) bm.set(x + gx, y + gy, v);
  }
}

// Make text look "inactive" in 1-bit by knocking out every other ink pixel.
export function stipple(bm, x, y, w, h) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) if ((xx + yy) & 1) bm.set(xx, yy, PAPER);
  }
}
