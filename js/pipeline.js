// Render pipeline: store state -> grey buffer (generator or image) -> 1-bit pixels.
// The grey buffer is cached, so moving the threshold slider only re-dithers.
import { state, subscribe, setImage } from './core/store.js';
import { getGenerator } from './generators/index.js';
import { dither } from './dither.js';

export const WIDTH = 320;
export const HEIGHT = 240;

let gray = null;
let grayKey = '';
let bits = null;
let bitsKey = '';
let queued = false;
const listeners = new Set();

function sourceKey() {
  if (state.source === 'image') return `image:${state.image.id}`;
  return `${state.source}:${JSON.stringify(state.params[state.source])}`;
}

function update() {
  const sk = sourceKey();
  if (sk !== grayKey) {
    gray = state.source === 'image'
      ? state.image.gray
      : getGenerator(state.source).render(state.params[state.source], WIDTH, HEIGHT);
    grayKey = sk;
  }
  const bk = `${sk}|${state.dither.algorithm}|${state.dither.threshold}`;
  if (bk !== bitsKey) {
    bits = dither(gray, WIDTH, HEIGHT, state.dither.algorithm, state.dither.threshold);
    bitsKey = bk;
    return true;
  }
  return false;
}

function flush() {
  queued = false;
  if (update()) for (const fn of listeners) fn(getOutput());
}

export function getOutput() {
  if (queued) flush();
  else if (!bits) update();
  return { bits, gray, w: WIDTH, h: HEIGHT };
}

export function onOutput(fn) {
  listeners.add(fn);
  fn(getOutput());
  return () => listeners.delete(fn);
}

export function initPipeline() {
  subscribe(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(flush);
  });
}

let imageCounter = 0;

export async function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('not an image file');
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Fit the whole picture inside the frame (letterboxed on white).
  const s = Math.min(WIDTH / bmp.width, HEIGHT / bmp.height);
  const dw = Math.round(bmp.width * s), dh = Math.round(bmp.height * s);
  ctx.drawImage(bmp, Math.floor((WIDTH - dw) / 2), Math.floor((HEIGHT - dh) / 2), dw, dh);
  const original = `${bmp.width}x${bmp.height}`;
  bmp.close();
  const px = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const g = new Float32Array(WIDTH * HEIGHT);
  // Rec. 601 luma on the sRGB values. Dithering these perceptual greys keeps
  // shadow detail that linear-light values would crush to solid black.
  for (let i = 0; i < g.length; i++) g[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  const name = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 40) || 'image';
  setImage({ id: ++imageCounter, name, gray: g, w: WIDTH, h: HEIGHT, original });
  return { name, original };
}
