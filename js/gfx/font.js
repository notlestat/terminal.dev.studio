// Loads BDF bitmap fonts (Spleen) and exposes them as glyph tables.

class BitmapFont {
  constructor({ name, width, height, ascent, descent, glyphs }) {
    Object.assign(this, { name, width, height, ascent, descent, glyphs });
    this.fallback = glyphs.get(63); // '?'
  }

  glyph(code) {
    return this.glyphs.get(code) || this.fallback;
  }

  measure(str) {
    let w = 0;
    for (const ch of str) w += this.glyph(ch.codePointAt(0)).dw;
    return w;
  }
}

export function parseBDF(text) {
  const lines = text.split(/\r?\n/);
  const glyphs = new Map();
  let name = '', width = 0, height = 0, ascent = 0, descent = 0;
  let g = null;
  let inBitmap = false;

  for (const line of lines) {
    const [key, ...rest] = line.trim().split(/\s+/);
    if (inBitmap) {
      if (key === 'ENDCHAR') {
        inBitmap = false;
        if (g.code >= 0) glyphs.set(g.code, g);
        g = null;
      } else {
        g.rows.push(parseInt(key, 16));
      }
      continue;
    }
    switch (key) {
      case 'FONT': name = rest.join(' '); break;
      case 'FONTBOUNDINGBOX': width = +rest[0]; height = +rest[1]; break;
      case 'FONT_ASCENT': ascent = +rest[0]; break;
      case 'FONT_DESCENT': descent = +rest[0]; break;
      case 'STARTCHAR': g = { code: -1, dw: width, w: 0, h: 0, xo: 0, yo: 0, rows: [], rowBits: 8 }; break;
      case 'ENCODING': g.code = +rest[0]; break;
      case 'DWIDTH': g.dw = +rest[0]; break;
      case 'BBX':
        [g.w, g.h, g.xo, g.yo] = rest.map(Number);
        g.rowBits = Math.ceil(g.w / 8) * 8;
        break;
      case 'BITMAP': inBitmap = true; break;
    }
  }
  return new BitmapFont({ name, width, height, ascent, descent, glyphs });
}

export const fonts = {};

export async function loadFonts() {
  const files = { tiny: 'fonts/spleen-5x8.bdf', small: 'fonts/spleen-6x12.bdf', regular: 'fonts/spleen-8x16.bdf' };
  await Promise.all(Object.entries(files).map(async ([key, url]) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
    fonts[key] = parseBDF(await res.text());
  }));
  return fonts;
}
