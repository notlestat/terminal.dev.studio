// Clock Tool: one line of ctime-style text, like "Mon Aug 20 07:13:00 1990".
// Its icon is a small analogue face.
import { Bitmap } from '../gfx/bitmap.js';
import { fonts } from '../gfx/font.js';
import { ctime } from '../core/time.js';
import { Frame } from '../wm/wm.js';
import { showBitmap } from '../ui/draw.js';

function drawClockIcon(bm) {
  const now = new Date();
  bm.clear();
  bm.rect(0, 0, bm.w, bm.h);
  bm.rect(2, 2, bm.w - 4, bm.h - 4);
  const cx = 32, cy = 32, r = 25;
  bm.circle(cx, cy, r);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const inner = i % 3 === 0 ? r - 5 : r - 3;
    bm.line(cx + Math.sin(a) * inner, cy - Math.cos(a) * inner, cx + Math.sin(a) * (r - 1), cy - Math.cos(a) * (r - 1));
  }
  const hand = (turns, len, thick) => {
    const a = turns * Math.PI * 2;
    const ex = cx + Math.sin(a) * len, ey = cy - Math.cos(a) * len;
    bm.line(cx, cy, ex, ey);
    if (thick) { bm.line(cx + 1, cy, ex + 1, ey); bm.line(cx, cy + 1, ex, ey + 1); }
  };
  const h = (now.getHours() % 12) + now.getMinutes() / 60;
  hand(h / 12, 12, true);
  hand(now.getMinutes() / 60, 19, true);
  bm.fillRect(cx - 1, cy - 1, 3, 3);
}

export function createClockTool({ x, y } = {}) {
  const el = document.createElement('div');
  el.setAttribute('role', 'timer');
  const canvas = document.createElement('canvas');
  el.append(canvas);
  let timer = 0;

  const tick = () => {
    const text = ctime();
    const font = fonts.regular;
    const bm = new Bitmap(font.measure(text) + 6, font.height + 2);
    bm.text(font, text, 3, 1);
    showBitmap(bm, canvas);
    el.setAttribute('aria-label', text);
    if (frame?.iconified) frame.refreshIcon();
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  };

  const frame = new Frame({ title: 'Clock Tool 1.1', iconLabel: 'clock', drawIcon: drawClockIcon, body: el, x, y });
  frame.onClose(() => clearTimeout(timer));
  tick();
  return frame;
}
