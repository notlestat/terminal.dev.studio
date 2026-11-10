// Pop-up menus: the root menu, frame menus and drop-down choices.
// The highlighted item is drawn in inverse video. Keyboard: arrows, Enter, Escape.
import { Bitmap, INK, PAPER } from '../gfx/bitmap.js';
import { fonts } from '../gfx/font.js';
import { px, scale, screenSize } from '../core/scale.js';
import { showBitmap, textBitmap, textWidth, GLYPHS, stamp, stipple } from '../ui/draw.js';
import { getDesktop } from './wm.js';

let current = null;

export function closeMenu({ restoreFocus = true } = {}) {
  if (!current) return;
  const { el, outside, returnFocus } = current;
  current = null;
  document.removeEventListener('pointerdown', outside, true);
  el.remove();
  if (restoreFocus && returnFocus && document.contains(returnFocus)) returnFocus.focus();
}

export const isMenuOpen = () => current !== null;

/**
 * items: [{ label, action, checked, disabled } | '-']
 * x, y: screen-pixel position of the top-left corner.
 */
export function openMenu({ title, items, x, y, returnFocus = document.activeElement, focusFirst = false }) {
  closeMenu({ restoreFocus: false });
  const font = fonts.regular;
  const rowH = font.height + 2;
  const labelX = 18;
  const width = Math.max(
    title ? textWidth(title, { bold: true }) + 16 : 0,
    ...items.filter((it) => it !== '-').map((it) => labelX + textWidth(it.label) + 12),
  );

  const el = document.createElement('div');
  el.className = 'menu';
  el.setAttribute('role', 'menu');
  el.tabIndex = -1;
  if (title) el.setAttribute('aria-label', title);
  const inner = document.createElement('div');
  inner.className = 'menu-inner';
  el.append(inner);

  if (title) {
    const t = document.createElement('div');
    t.className = 'menu-title';
    t.setAttribute('aria-hidden', 'true');
    t.append(showBitmap(textBitmap(title, { bold: true, width, align: 'center', padY: 1 })));
    inner.append(t);
  }

  const rows = [];
  let active = -1;

  const draw = (row) => {
    const { item, canvas, index } = row;
    const bm = new Bitmap(width, rowH);
    const on = index === active;
    if (on) bm.clear(INK);
    const v = on ? PAPER : INK;
    if (item.checked) stamp(bm, GLYPHS.check, 6, 5, v);
    bm.text(font, item.label, labelX, 1, { v });
    if (item.disabled) stipple(bm, 0, 0, width, rowH);
    showBitmap(bm, canvas);
  };

  const setActive = (i) => {
    const prev = active;
    active = i;
    for (const row of rows) if (row.index === prev || row.index === i) draw(row);
    const row = rows.find((r) => r.index === i);
    if (row) el.setAttribute('aria-activedescendant', row.node.id);
    else el.removeAttribute('aria-activedescendant');
  };

  const choose = (i) => {
    const row = rows.find((r) => r.index === i);
    if (!row || row.item.disabled) return;
    closeMenu();
    row.item.action?.();
  };

  items.forEach((item, i) => {
    if (item === '-') {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      sep.setAttribute('role', 'separator');
      inner.append(sep);
      return;
    }
    const node = document.createElement('div');
    node.className = 'menu-item';
    node.id = `menu-item-${i}-${Math.random().toString(36).slice(2, 7)}`;
    node.setAttribute('role', item.checked !== undefined ? 'menuitemradio' : 'menuitem');
    if (item.checked !== undefined) node.setAttribute('aria-checked', String(!!item.checked));
    if (item.disabled) node.setAttribute('aria-disabled', 'true');
    node.setAttribute('aria-label', item.label);
    const canvas = document.createElement('canvas');
    node.append(canvas);
    inner.append(node);
    const row = { item, canvas, node, index: i };
    rows.push(row);
    draw(row);
    node.addEventListener('pointerenter', () => !item.disabled && setActive(i));
    node.addEventListener('pointerleave', () => active === i && setActive(-1));
    node.addEventListener('click', () => choose(i));
  });

  const enabled = rows.filter((r) => !r.item.disabled).map((r) => r.index);
  const step = (dir) => {
    if (!enabled.length) return;
    const pos = enabled.indexOf(active);
    const next = pos < 0 ? (dir > 0 ? 0 : enabled.length - 1) : (pos + dir + enabled.length) % enabled.length;
    setActive(enabled[next]);
  };

  el.addEventListener('keydown', (e) => {
    const keys = {
      ArrowDown: () => step(1),
      ArrowUp: () => step(-1),
      Home: () => enabled.length && setActive(enabled[0]),
      End: () => enabled.length && setActive(enabled[enabled.length - 1]),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => closeMenu(),
      Tab: () => closeMenu(),
    };
    if (keys[e.key]) {
      e.preventDefault();
      e.stopPropagation();
      keys[e.key]();
    }
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  const outside = (e) => {
    if (!el.contains(e.target)) closeMenu({ restoreFocus: false });
  };
  document.addEventListener('pointerdown', outside, true);

  getDesktop().append(el);
  const size = screenSize(el);
  el.style.left = px(Math.max(0, Math.min(x, scale.width - size.w)));
  el.style.top = px(Math.max(0, Math.min(y, scale.height - size.h)));
  current = { el, outside, returnFocus };
  el.focus();
  if (focusFirst) step(1);
  return el;
}
