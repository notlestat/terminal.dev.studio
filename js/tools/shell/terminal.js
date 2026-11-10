// A character-cell screen: scrollback lines plus a renderer that draws them
// with the bitmap font. Attributes per cell: 1 = inverse video, 2 = bold.
import { Bitmap, INK, PAPER } from '../../gfx/bitmap.js';

export const INVERSE = 1;
export const BOLD = 2;

// Output lines can be plain strings or arrays of [text, attr] segments.
export function toLine(line) {
  if (typeof line === 'string') return { text: line, attr: null };
  let text = '';
  const attrs = [];
  for (const [seg, a = 0] of line) {
    text += seg;
    for (let i = 0; i < seg.length; i++) attrs.push(a);
  }
  return { text, attr: attrs.some(Boolean) ? Uint8Array.from(attrs) : null };
}

export function wrapLine(line, cols) {
  const out = [];
  for (let i = 0; i === 0 || i < line.text.length; i += cols) {
    out.push({ text: line.text.slice(i, i + cols), attr: line.attr ? line.attr.slice(i, i + cols) : null });
  }
  return out;
}

export class Terminal {
  constructor(cols, rows, font, maxLines = 1000) {
    Object.assign(this, { cols, rows, font, maxLines });
    this.pad = 3;
    this.lines = [];
    this.bm = new Bitmap(this.pixelWidth, this.pixelHeight);
  }

  get pixelWidth() {
    return this.cols * this.font.width + this.pad * 2;
  }

  get pixelHeight() {
    return this.rows * this.font.height + this.pad * 2;
  }

  // Append already-wrapped rows. Returns how many old rows fell off the top.
  push(rows) {
    this.lines.push(...rows);
    const extra = this.lines.length - this.maxLines;
    if (extra > 0) this.lines.splice(0, extra);
    return Math.max(0, extra);
  }

  clear() {
    this.lines = [];
  }

  // rows: the visible {text, attr} rows. selection: [{row, col}, {row, col}] in
  // visible coordinates, already ordered. cursor: {row, col, solid}.
  render(rows, selection, cursor) {
    const { bm, font, pad } = this;
    const cw = font.width, ch = font.height;
    bm.clear(PAPER);
    rows.forEach((line, r) => {
      if (!line) return;
      const y = pad + r * ch;
      for (let c = 0; c < line.text.length && c < this.cols; c++) {
        const a = line.attr ? line.attr[c] : 0;
        const x = pad + c * cw;
        if (a & INVERSE) bm.fillRect(x, y, cw, ch, INK);
        const s = line.text[c];
        if (s !== ' ') bm.text(font, s, x, y, { v: a & INVERSE ? PAPER : INK, bold: !!(a & BOLD) });
      }
    });
    if (selection) {
      const [a, b] = selection;
      for (let r = Math.max(0, a.row); r <= Math.min(this.rows - 1, b.row); r++) {
        const c0 = r === a.row ? a.col : 0;
        const c1 = r === b.row ? b.col : this.cols;
        bm.invertRect(pad + c0 * cw, pad + r * ch, (c1 - c0) * cw, ch);
      }
    }
    if (cursor && cursor.row >= 0 && cursor.row < this.rows) {
      const x = pad + cursor.col * cw, y = pad + cursor.row * ch;
      if (cursor.solid) bm.invertRect(x, y, cw, ch);
      else {
        bm.rect(x, y, cw, ch);
      }
    }
    return bm;
  }
}
