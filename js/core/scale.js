// The display works in "screen pixels". One screen pixel is k device pixels,
// where k is a whole number, so every pixel is scaled by an integer factor.
// CSS sizes use calc(var(--px) * n) and canvases use image-rendering: pixelated.

export const scale = { k: 1, css: 1, width: 0, height: 0 };

export function computeScale() {
  const dpr = window.devicePixelRatio || 1;
  const requested = Number(new URLSearchParams(location.search).get('scale'));
  const k = Number.isInteger(requested) && requested > 0 && requested <= 8
    ? requested
    : Math.max(1, Math.round(dpr));
  scale.k = k;
  scale.css = k / dpr; // CSS pixels per screen pixel
  scale.width = Math.floor(window.innerWidth / scale.css);
  scale.height = Math.floor(window.innerHeight / scale.css);
  document.documentElement.style.setProperty('--px', `${scale.css}px`);
  return scale;
}

export const px = (n) => `calc(var(--px) * ${n})`;

export function toScreen(clientX, clientY) {
  return { x: Math.floor(clientX / scale.css), y: Math.floor(clientY / scale.css) };
}

// Size of an element in screen pixels.
export function screenSize(el) {
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width / scale.css), h: Math.round(r.height / scale.css) };
}

// Give a canvas a CSS size of w×h screen pixels, times an integer zoom.
export function sizeCanvas(canvas, w, h, zoom = 1) {
  canvas.style.width = px(w * zoom);
  canvas.style.height = px(h * zoom);
}
