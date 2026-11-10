// A 1-bit framebuffer. Every pixel is 1 (ink, black) or 0 (paper, white).
// All UI drawing goes through this class, so grey pixels cannot happen.

export const INK = 1;
export const PAPER = 0;

export class Bitmap {
  constructor(w, h, data) {
    this.w = w;
    this.h = h;
    this.data = data || new Uint8Array(w * h);
  }

  clear(v = PAPER) {
    this.data.fill(v);
    return this;
  }

  set(x, y, v = INK) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = v;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return PAPER;
    return this.data[y * this.w + x];
  }

  fillRect(x, y, w, h, v = INK) {
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) this.data.fill(v, yy * this.w + x0, yy * this.w + x1);
  }

  invertRect(x, y, w, h) {
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.data[yy * this.w + xx] ^= 1;
    }
  }

  // 50% checkerboard, the 1-bit stand-in for grey.
  fillChecker(x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, (xx + yy) & 1 ? PAPER : INK);
    }
  }

  rect(x, y, w, h, v = INK) {
    this.fillRect(x, y, w, 1, v);
    this.fillRect(x, y + h - 1, w, 1, v);
    this.fillRect(x, y, 1, h, v);
    this.fillRect(x + w - 1, y, 1, h, v);
  }

  // Bresenham line.
  line(x0, y0, x1, y1, v = INK) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, v);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Midpoint circle outline.
  circle(cx, cy, r, v = INK) {
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      for (const [px, py] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) {
        this.set(cx + px, cy + py, v);
      }
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
  }

  fillCircle(cx, cy, r, v = INK) {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      this.fillRect(cx - half, cy + y, half * 2 + 1, 1, v);
    }
  }

  // Copy another bitmap in. With `transparent`, paper pixels in the source are skipped.
  blit(src, dx, dy, { transparent = false } = {}) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const v = src.data[y * src.w + x];
        if (transparent && v === PAPER) continue;
        this.set(dx + x, dy + y, v);
      }
    }
  }

  // Draw a string with a bitmap font. (x, y) is the top-left of the text cell.
  // Bold is the classic overstrike: each glyph is drawn twice, one pixel apart.
  text(font, str, x, y, { v = INK, bold = false } = {}) {
    let cx = x;
    for (const ch of str) {
      const g = font.glyph(ch.codePointAt(0));
      const top = y + font.ascent - (g.h + g.yo);
      for (let gy = 0; gy < g.h; gy++) {
        const row = g.rows[gy];
        for (let gx = 0; gx < g.w; gx++) {
          if ((row >> (g.rowBits - 1 - gx)) & 1) {
            this.set(cx + g.xo + gx, top + gy, v);
            if (bold) this.set(cx + g.xo + gx + 1, top + gy, v);
          }
        }
      }
      cx += g.dw;
    }
    return cx - x;
  }
}

// Push a bitmap into a canvas at 1:1. CSS then scales the canvas by an integer factor.
export function paint(canvas, bm) {
  if (canvas.width !== bm.w) canvas.width = bm.w;
  if (canvas.height !== bm.h) canvas.height = bm.h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(bm.w, bm.h);
  const out = img.data;
  for (let i = 0, j = 0; i < bm.data.length; i++, j += 4) {
    const c = bm.data[i] ? 0 : 255;
    out[j] = out[j + 1] = out[j + 2] = c;
    out[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
