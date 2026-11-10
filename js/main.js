// Boot: load fonts, set the pixel scale, draw the desktop and open the tools
// in the same arrangement as the reference screen.
import { computeScale, scale, toScreen, screenSize } from './core/scale.js';
import { loadFonts } from './gfx/font.js';
import { applyDesktopPattern, applyCursor } from './gfx/desktop.js';
import { initWM, relayout, allFrames } from './wm/wm.js';
import { openMenu, closeMenu } from './wm/menu.js';
import { initPipeline } from './pipeline.js';
import { generators } from './generators/index.js';
import { ALGORITHMS } from './dither.js';
import { ctime } from './core/time.js';
import { TOOLS, openTool } from './tools/index.js';

function openRootMenu(x, y) {
  openMenu({
    title: 'Studio',
    x, y,
    focusFirst: false,
    items: [
      ...Object.entries(TOOLS).map(([name, t]) => ({ label: t.label, action: () => openTool(name) })),
      '-',
      { label: 'Open All', action: () => allFrames().forEach((f) => f.restore()) },
      { label: 'Iconify All', action: () => allFrames().forEach((f) => f.iconify()) },
    ],
  });
}

function bootBanner() {
  return [
    `Studio 1.1 (1-BIT) #1: ${ctime()}`,
    'Generative graphics workstation, plain JavaScript edition',
    `display: ${scale.width}x${scale.height} monochrome, ${scale.k} device px per pixel`,
    'font: Spleen 8x16, 6x12, 5x8 (BSD 2-Clause)',
    `generators: ${generators.map((g) => g.name).join(' ')}`,
    `dither: ${Object.keys(ALGORITHMS).join(' ')}`,
    'graphics: 320x240, integer zoom, nearest neighbour',
    '',
    'Type help for commands. Right-click the desktop for tools.',
    'Double-click a title bar or an icon to iconify or open it.',
    '',
  ];
}

function openingScene() {
  const W = scale.width, H = scale.height;
  const zoom = W >= 1100 && H >= 680 ? 2 : 1;
  const rowsA = Math.max(10, Math.min(22, Math.floor((H - 160) / 16 / 2) + 6));

  const shellA = openTool('shell', { x: 20, y: 16, cols: 64, rows: rowsA, label: 'console', banner: bootBanner() });
  const shellB = openTool('shell', {
    x: Math.round(W * 0.2), y: Math.round(H * 0.3), cols: 62, rows: Math.max(10, Math.min(24, Math.floor((H * 0.7 - 120) / 16))),
    label: 'shell', script: ['man spheres'],
  });

  const graphics = openTool('graphics', { x: 0, y: 0, zoom });
  const g = screenSize(graphics.el);
  graphics.moveTo(Math.max(8, Math.min(Math.round(W * 0.41), W - g.w - 12)), Math.round(H * 0.11));

  const clock = openTool('clock', { x: 0, y: 0 });
  clock.moveTo(W - screenSize(clock.el).w - 32, 16);

  const params = openTool('params', { x: 0, y: 0 });
  const p = screenSize(params.el);
  params.moveTo(W - p.w - 24, H - p.h - 24);
  params.iconify();

  shellB.raise();
  graphics.raise();
  shellA.focus();
}

async function boot() {
  computeScale();
  await loadFonts();
  const desktop = document.getElementById('desktop');
  applyDesktopPattern(desktop);
  applyCursor();
  initWM(desktop);
  initPipeline();

  // The browser's own menu and file drops would break the illusion.
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  desktop.addEventListener('contextmenu', (e) => {
    if (e.target !== desktop) return;
    const p = toScreen(e.clientX, e.clientY);
    openRootMenu(p.x, p.y);
  });
  desktop.addEventListener('keydown', (e) => {
    if (e.target !== desktop) return;
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      openRootMenu(16, 16);
    }
  });

  let lastK = scale.k;
  window.addEventListener('resize', () => {
    closeMenu({ restoreFocus: false });
    computeScale();
    if (scale.k !== lastK) {
      lastK = scale.k;
      applyCursor();
    }
    relayout();
  });

  openingScene();
}

boot().catch((err) => {
  console.error(err);
  const msg = document.createElement('pre');
  msg.className = 'boot-error';
  msg.textContent = `Studio could not start: ${err.message}\n\nServe this folder over HTTP, for example:\n  python3 -m http.server 8000\nthen open http://localhost:8000`;
  document.body.append(msg);
});
