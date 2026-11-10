// Window manager: frames with a black title stripe, outline dragging (as SunView
// did), click to raise, iconify to a 64×64 icon at the bottom left, close.
import { Bitmap, INK, PAPER } from '../gfx/bitmap.js';
import { px, scale, screenSize, toScreen } from '../core/scale.js';
import { showBitmap, textBitmap } from '../ui/draw.js';
import { openMenu } from './menu.js';

const ICON = 64;
const ICON_GAP = 4;

let desktop = null;
let zTop = 1000;
let zBottom = 1000;
const frames = new Set();

export function initWM(el) {
  desktop = el;
}

export const getDesktop = () => desktop;
export const allFrames = () => [...frames];

// Title-bar controls, drawn white on black.
function titleButtonBitmap(kind) {
  const bm = new Bitmap(13, 13).clear(INK);
  bm.rect(0, 0, 13, 13, PAPER);
  if (kind === 'close') {
    bm.line(3, 3, 9, 9, PAPER);
    bm.line(9, 3, 3, 9, PAPER);
  } else {
    // A small box sinking to the bottom: "shrink to an icon".
    bm.fillRect(3, 7, 7, 3, PAPER);
  }
  return bm;
}

// Drag with pointer capture. onMove gets the offset from the start in screen pixels.
function trackDrag(e, { onMove, onEnd, threshold = 3 }) {
  const target = e.currentTarget;
  const start = toScreen(e.clientX, e.clientY);
  let moved = false;
  target.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const p = toScreen(ev.clientX, ev.clientY);
    const dx = p.x - start.x, dy = p.y - start.y;
    if (!moved && Math.abs(dx) + Math.abs(dy) < threshold) return;
    moved = true;
    onMove(dx, dy);
  };
  const up = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
    onEnd?.(moved);
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}

export class Frame {
  constructor({ title, iconLabel, drawIcon, body, x = 40, y = 40, menuItems = () => [], focusTarget = null }) {
    this.title = title;
    this.iconLabel = iconLabel;
    this.drawIcon = drawIcon;
    this.menuItems = menuItems;
    this.focusTarget = focusTarget;
    this.iconified = false;
    this.iconSlot = null; // auto-placed slot index, or null if the user moved the icon
    this.iconPos = null;
    this.closeHandlers = [];
    this.restoreHandlers = [];

    const el = (this.el = document.createElement('section'));
    el.className = 'frame';
    el.setAttribute('aria-label', title);

    const bar = (this.titleBar = document.createElement('div'));
    bar.className = 'frame-title';
    const text = document.createElement('div');
    text.className = 'title-text';
    text.append(showBitmap(textBitmap(title, { invert: true, padY: 1 })));
    const iconBtn = this.makeTitleButton('iconify', `Iconify ${title}`, () => this.iconify());
    const closeBtn = this.makeTitleButton('close', `Close ${title}`, () => this.close());
    bar.append(text, iconBtn, closeBtn);

    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'frame-body';
    const content = document.createElement('div');
    content.className = 'frame-content';
    content.append(body);
    bodyWrap.append(content);
    el.append(bar, bodyWrap);

    // Icon
    const icon = (this.icon = document.createElement('button'));
    icon.className = 'icon';
    icon.type = 'button';
    icon.hidden = true;
    icon.setAttribute('aria-label', `${title}, iconified. Double-click or press Enter to open.`);
    this.iconCanvas = document.createElement('canvas');
    icon.append(this.iconCanvas);

    this.bindEvents();
    desktop.append(el, icon);
    frames.add(this);
    this.moveTo(x, y);
    this.raise();
  }

  makeTitleButton(kind, label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'frame-btn';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.append(showBitmap(titleButtonBitmap(kind)));
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', onClick);
    return b;
  }

  bindEvents() {
    const { el, titleBar, icon } = this;
    el.addEventListener('pointerdown', () => this.raise(), true);

    titleBar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.dragOutline(e);
    });
    titleBar.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.frame-btn')) this.iconify();
    });
    titleBar.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = toScreen(e.clientX, e.clientY);
      this.openFrameMenu(p.x, p.y);
    });

    icon.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.raiseIcon();
      const origin = { ...this.iconPos };
      trackDrag(e, {
        onMove: (dx, dy) => {
          this.iconSlot = null;
          this.placeIcon(origin.x + dx, origin.y + dy);
        },
      });
    });
    icon.addEventListener('dblclick', () => this.restore());
    icon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.restore();
      }
    });
    icon.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const p = toScreen(e.clientX, e.clientY);
      openMenu({
        title: this.iconLabel,
        x: p.x, y: p.y,
        items: [{ label: 'Open', action: () => this.restore() }, '-', { label: 'Quit', action: () => this.close() }],
      });
    });
  }

  openFrameMenu(x, y) {
    openMenu({
      title: this.title.replace(/ [\d.]+$/, ''),
      x, y,
      items: [
        { label: 'Iconify', action: () => this.iconify() },
        { label: 'Front', action: () => this.raise() },
        { label: 'Back', action: () => this.lower() },
        ...this.menuItems(),
        '-',
        { label: 'Quit', action: () => this.close() },
      ],
    });
  }

  // While dragging, only a double-ruled outline moves. The frame jumps on release.
  dragOutline(e) {
    const { w, h } = screenSize(this.el);
    const origin = { x: this.x, y: this.y };
    let outline = null;
    let pos = origin;
    trackDrag(e, {
      onMove: (dx, dy) => {
        pos = this.clampPosition(origin.x + dx, origin.y + dy, w);
        if (!outline) {
          outline = document.createElement('div');
          outline.className = 'drag-outline';
          outline.style.width = px(w);
          outline.style.height = px(h);
          desktop.append(outline);
        }
        outline.style.left = px(pos.x);
        outline.style.top = px(pos.y);
      },
      onEnd: (moved) => {
        outline?.remove();
        if (moved) this.moveTo(pos.x, pos.y);
      },
    });
  }

  clampPosition(x, y, w = screenSize(this.el).w) {
    return {
      x: Math.max(-(w - 48), Math.min(x, scale.width - 48)),
      y: Math.max(0, Math.min(y, scale.height - 24)),
    };
  }

  moveTo(x, y) {
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.el.style.left = px(this.x);
    this.el.style.top = px(this.y);
  }

  raise() {
    this.el.style.zIndex = ++zTop;
  }

  lower() {
    this.el.style.zIndex = --zBottom;
  }

  raiseIcon() {
    this.icon.style.zIndex = ++zTop;
  }

  placeIcon(x, y) {
    this.iconPos = {
      x: Math.max(0, Math.min(x, scale.width - ICON)),
      y: Math.max(0, Math.min(y, scale.height - ICON)),
    };
    this.icon.style.left = px(this.iconPos.x);
    this.icon.style.top = px(this.iconPos.y);
  }

  // Icons line up along the bottom edge from the left, like SunView.
  autoPlaceIcon() {
    if (this.iconSlot === null && this.iconPos) return;
    const taken = new Set([...frames].filter((f) => f !== this && f.iconified && f.iconSlot !== null).map((f) => f.iconSlot));
    if (this.iconSlot === null || taken.has(this.iconSlot)) {
      let slot = 0;
      while (taken.has(slot)) slot++;
      this.iconSlot = slot;
    }
    const perRow = Math.max(1, Math.floor((scale.width - ICON_GAP) / (ICON + ICON_GAP)));
    const col = this.iconSlot % perRow, row = Math.floor(this.iconSlot / perRow);
    this.placeIcon(ICON_GAP + col * (ICON + ICON_GAP), scale.height - (row + 1) * (ICON + ICON_GAP));
  }

  refreshIcon() {
    const bm = new Bitmap(ICON, ICON);
    this.drawIcon(bm);
    showBitmap(bm, this.iconCanvas);
  }

  iconify() {
    if (this.iconified) return;
    const hadFocus = this.el.contains(document.activeElement);
    this.iconified = true;
    this.el.hidden = true;
    this.autoPlaceIcon();
    this.refreshIcon();
    this.icon.hidden = false;
    this.raiseIcon();
    if (hadFocus) this.icon.focus();
  }

  restore() {
    if (!this.iconified) return;
    this.iconified = false;
    this.icon.hidden = true;
    this.el.hidden = false;
    this.raise();
    this.restoreHandlers.forEach((fn) => fn());
    this.focus();
  }

  focus() {
    (this.focusTarget || this.el.querySelector('[tabindex="0"], button'))?.focus();
  }

  close() {
    this.el.remove();
    this.icon.remove();
    frames.delete(this);
    this.closeHandlers.forEach((fn) => fn());
    document.getElementById('desktop')?.focus();
  }

  onClose(fn) {
    this.closeHandlers.push(fn);
  }

  onRestore(fn) {
    this.restoreHandlers.push(fn);
  }
}

// After the browser window changes size: keep icons on the bottom edge and frames reachable.
export function relayout() {
  for (const f of frames) {
    if (f.iconified) {
      if (f.iconSlot !== null) f.autoPlaceIcon();
      else f.placeIcon(f.iconPos.x, f.iconPos.y);
    }
    if (!f.iconified) {
      const p = f.clampPosition(f.x, f.y);
      f.moveTo(p.x, p.y);
    }
  }
}

// The frame of an icon: a double-ruled box with the label along the top.
// Returns the area left for artwork.
export function iconShell(bm, label, font) {
  bm.clear(PAPER);
  bm.rect(0, 0, bm.w, bm.h);
  bm.rect(2, 2, bm.w - 4, bm.h - 4);
  let top = 4;
  if (label) {
    const w = font.measure(label);
    bm.text(font, label, Math.floor((bm.w - w) / 2), 4);
    top = 4 + font.height + 1;
  }
  return { x: 4, y: top, w: bm.w - 8, h: bm.h - 4 - top };
}
