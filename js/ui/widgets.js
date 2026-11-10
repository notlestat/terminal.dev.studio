// Panel items in the SunView style: sliders, a drop-down choice and buttons.
// Each widget draws itself as a 1-bit bitmap; focus is shown by inverting the label.
import { Bitmap, INK, PAPER } from '../gfx/bitmap.js';
import { fonts } from '../gfx/font.js';
import { scale, toScreen } from '../core/scale.js';
import { showBitmap, textWidth, GLYPHS, stamp } from './draw.js';
import { openMenu } from '../wm/menu.js';

const ROW_H = 18;

function drawLabel(bm, label, labelWidth, focused) {
  const w = textWidth(label, { bold: true });
  const x = labelWidth - w;
  if (focused) bm.fillRect(x - 2, 0, w + 4, ROW_H);
  bm.text(fonts.regular, label, x, 1, { bold: true, v: focused ? PAPER : INK });
}

function localX(canvas, clientX) {
  return Math.floor((clientX - canvas.getBoundingClientRect().left) / scale.css);
}

export function createSlider({ label, labelWidth, min, max, value, onInput, barWidth = 128 }) {
  const el = document.createElement('div');
  el.className = 'widget';
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', label.replace(/:$/, ''));
  el.setAttribute('aria-valuemin', min);
  el.setAttribute('aria-valuemax', max);
  const canvas = document.createElement('canvas');
  el.append(canvas);

  const digits = String(max).length;
  const font = fonts.regular;
  const valueX = labelWidth + 8;
  const minX = valueX + (digits + 2) * font.width + 8;
  const barX = minX + textWidth(String(min)) + 6;
  const maxX = barX + barWidth + 6;
  const width = maxX + textWidth(String(max));
  let focused = false;

  const draw = () => {
    const bm = new Bitmap(width, ROW_H);
    drawLabel(bm, label, labelWidth, focused);
    bm.text(font, `[${String(value).padStart(digits)}]`, valueX, 1);
    bm.text(font, String(min), minX, 1);
    bm.text(font, String(max), maxX, 1);
    bm.rect(barX, 3, barWidth, 12);
    const fill = Math.round(((value - min) / (max - min)) * (barWidth - 4));
    bm.fillRect(barX + 2, 5, fill, 8);
    showBitmap(bm, canvas);
    el.setAttribute('aria-valuenow', value);
  };

  const set = (v, notify = true) => {
    v = Math.min(max, Math.max(min, Math.round(v)));
    if (v === value) return;
    value = v;
    draw();
    if (notify) onInput(value);
  };

  const fromPointer = (clientX) => set(min + ((localX(canvas, clientX) - barX - 2) / (barWidth - 4)) * (max - min));

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const x = localX(canvas, e.clientX);
    if (x < barX - 4 || x > barX + barWidth + 4) return;
    e.preventDefault();
    el.focus();
    canvas.setPointerCapture(e.pointerId);
    fromPointer(e.clientX);
    const move = (ev) => fromPointer(ev.clientX);
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  });

  el.addEventListener('keydown', (e) => {
    const big = Math.max(1, Math.round((max - min) / 10));
    const keys = {
      ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -big, PageUp: big,
    };
    if (e.key in keys) set(value + keys[e.key]);
    else if (e.key === 'Home') set(min);
    else if (e.key === 'End') set(max);
    else return;
    e.preventDefault();
  });
  el.addEventListener('focus', () => { focused = el.matches(':focus-visible'); draw(); });
  el.addEventListener('blur', () => { focused = false; draw(); });

  draw();
  return { el, setValue: (v) => set(v, false) };
}

// A drop-down choice. Click, Enter, Space or ArrowDown opens the list;
// ArrowLeft/ArrowRight cycle through the values in place.
export function createChoice({ label, labelWidth, options, value, onChange, minWidth = 0 }) {
  const el = document.createElement('div');
  el.className = 'widget';
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-haspopup', 'menu');
  const canvas = document.createElement('canvas');
  el.append(canvas);
  let focused = false;
  const boxX = labelWidth + 8;

  const boxWidth = () => Math.max(minWidth, Math.max(...options.map((o) => textWidth(o.label))) + 34);
  const current = () => options.find((o) => o.value === value) || options[0];

  const draw = () => {
    const bw = boxWidth();
    const bm = new Bitmap(boxX + bw, ROW_H);
    drawLabel(bm, label, labelWidth, focused);
    bm.rect(boxX, 0, bw, ROW_H);
    stamp(bm, GLYPHS.cycle, boxX + 4, 3);
    bm.text(fonts.regular, current().label, boxX + 19, 1);
    stamp(bm, GLYPHS.down, boxX + bw - 13, 7);
    showBitmap(bm, canvas);
    el.setAttribute('aria-label', `${label.replace(/:$/, '')}: ${current().label}`);
  };

  const choose = (v) => {
    if (v === value) return;
    value = v;
    draw();
    onChange(v);
  };

  const open = () => {
    const r = canvas.getBoundingClientRect();
    const p = toScreen(r.left, r.bottom);
    openMenu({
      x: p.x + boxX,
      y: p.y + 1,
      returnFocus: el,
      focusFirst: true,
      items: options.map((o) => ({ label: o.label, checked: o.value === value, action: () => choose(o.value) })),
    });
  };

  canvas.addEventListener('click', open);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') open();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = options.findIndex((o) => o.value === value);
      choose(options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length].value);
    } else return;
    e.preventDefault();
  });
  el.addEventListener('focus', () => { focused = el.matches(':focus-visible'); draw(); });
  el.addEventListener('blur', () => { focused = false; draw(); });

  draw();
  return {
    el,
    setValue: (v) => { value = v; draw(); },
    setOptions: (opts) => { options = opts; draw(); },
  };
}

export function createButton({ label, onClick }) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'widget-btn';
  el.setAttribute('aria-label', label);
  const canvas = document.createElement('canvas');
  el.append(canvas);
  let pressed = false, focused = false;

  const draw = () => {
    const w = textWidth(label) + 16;
    const bm = new Bitmap(w, ROW_H + 4);
    bm.rect(0, 0, w, bm.h);
    bm.rect(2, 2, w - 4, bm.h - 4);
    const inv = pressed || focused;
    if (inv) bm.fillRect(3, 3, w - 6, bm.h - 6);
    bm.text(fonts.regular, label, 8, 3, { v: inv ? PAPER : INK });
    showBitmap(bm, canvas);
  };

  el.addEventListener('pointerdown', () => { pressed = true; draw(); });
  const release = () => { if (pressed) { pressed = false; draw(); } };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('focus', () => { focused = el.matches(':focus-visible'); draw(); });
  el.addEventListener('blur', () => { focused = false; draw(); });
  el.addEventListener('click', onClick);
  draw();
  return { el };
}
