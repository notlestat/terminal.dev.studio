// Graphics Tool: a small tty pane that logs what was rendered, above the
// 320×240 picture shown at an integer zoom. Drop an image file to dither it.
import { Bitmap, INK, PAPER } from '../gfx/bitmap.js';
import { fonts } from '../gfx/font.js';
import { state, subscribe, describeState } from '../core/store.js';
import { onOutput, getOutput, loadImageFile, WIDTH, HEIGHT } from '../pipeline.js';
import { Frame, iconShell } from '../wm/wm.js';
import { showBitmap } from '../ui/draw.js';
import { dither } from '../dither.js';

const TTY_ROWS = 4;

// Icon: a live thumbnail of the picture, re-dithered at icon size.
function drawGraphicsIcon(bm) {
  const area = iconShell(bm, 'graphics', fonts.small);
  const { gray } = getOutput();
  const tw = area.w, th = area.h;
  const thumb = new Float32Array(tw * th);
  const sx = WIDTH / tw, sy = HEIGHT / th;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let sum = 0, n = 0;
      for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++) {
        for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) { sum += gray[yy * WIDTH + xx]; n++; }
      }
      thumb[y * tw + x] = sum / n;
    }
  }
  bm.blit(new Bitmap(tw, th, dither(thumb, tw, th, 'atkinson', 128)), area.x, area.y);
}

export function createGraphicsTool({ x, y, zoom = 2 } = {}) {
  const el = document.createElement('div');
  const tty = document.createElement('canvas');
  tty.className = 'graphics-tty';
  tty.setAttribute('aria-hidden', 'true');
  const picture = document.createElement('canvas');
  picture.setAttribute('role', 'img');
  el.append(tty, picture);

  let frame = null;
  const log = [];
  let message = null; // a transient line shown in inverse video
  let lastCommand = '';

  function drawTty() {
    const font = fonts.regular;
    const bm = new Bitmap(WIDTH * zoom, TTY_ROWS * font.height + 4);
    const lines = log.slice(-(message ? TTY_ROWS - 1 : TTY_ROWS));
    lines.forEach((line, i) => bm.text(font, line, 3, 2 + i * font.height));
    if (message) {
      const row = lines.length;
      const w = font.measure(message) + 4;
      bm.fillRect(1, 2 + row * font.height, w, font.height, INK);
      bm.text(font, message, 3, 2 + row * font.height, { v: PAPER });
    }
    showBitmap(bm, tty);
  }

  // Log whichever half of the state changed: the source or the dither.
  function logCommand() {
    const parts = describeState().split('; ');
    const prev = lastCommand.split('; ');
    const changed = parts.filter((p, i) => p !== prev[i]);
    if (!changed.length) return;
    lastCommand = parts.join('; ');
    for (const cmd of changed) log.push(`studio% ${cmd}`);
    while (log.length > 20) log.shift();
    drawTty();
  }

  let messageTimer = 0;
  function flash(text, ms = 4000) {
    message = text;
    drawTty();
    clearTimeout(messageTimer);
    if (ms) messageTimer = setTimeout(() => { message = null; drawTty(); }, ms);
  }

  function setZoom(z) {
    zoom = z;
    const { bits } = getOutput();
    showBitmap(new Bitmap(WIDTH, HEIGHT, bits), picture, zoom);
    drawTty();
  }

  const unsubOutput = onOutput(({ bits }) => {
    showBitmap(new Bitmap(WIDTH, HEIGHT, bits), picture, zoom);
    picture.setAttribute('aria-label', `Rendered picture: ${describeState()}`);
    if (frame && frame.iconified) frame.refreshIcon();
  });
  const unsubState = subscribe(() => requestAnimationFrame(logCommand));

  // Drag and drop
  let dragDepth = 0;
  el.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (dragDepth++ === 0) flash(`Drop an image to dither it (${state.dither.algorithm})`, 0);
  });
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  el.addEventListener('dragleave', () => {
    if (--dragDepth === 0) { message = null; drawTty(); }
  });
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
    if (!file) {
      flash('Not an image file. Try PNG, JPEG, GIF or WebP.');
      return;
    }
    try {
      const info = await loadImageFile(file);
      flash(`Loaded ${info.name} (${info.original})`);
    } catch {
      flash(`Could not read ${file.name}`);
    }
  });

  frame = new Frame({
    title: 'Graphics Tool 1.1',
    iconLabel: 'graphics',
    drawIcon: drawGraphicsIcon,
    body: el,
    x, y,
    menuItems: () => [1, 2, 3].map((z) => ({ label: `Zoom ${z}x`, checked: z === zoom, action: () => setZoom(z) })),
  });
  frame.onClose(() => { unsubOutput(); unsubState(); clearTimeout(messageTimer); });

  logCommand();
  setZoom(zoom);
  return frame;
}
