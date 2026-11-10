// Dithering: turn a grey buffer (Float32Array, 0 = black, 1 = white) into
// 1-bit pixels (Uint8Array, 1 = black ink, 0 = white paper).
//
// `threshold` (0-255, default 128) is applied the same way to every algorithm:
// it is the grey level that lands on the 50% split, so raising it darkens the image.

export const ALGORITHMS = {
  atkinson: { label: 'Atkinson', summary: 'error diffusion to 6 neighbours, 3/4 of the error kept (Bill Atkinson, 1984)' },
  floyd: { label: 'Floyd-Steinberg', summary: 'error diffusion 7/16, 3/16, 5/16, 1/16 (Floyd and Steinberg, 1976)' },
  bayer: { label: 'Bayer 8x8', summary: 'ordered dither with an 8x8 Bayer threshold matrix' },
  threshold: { label: 'Threshold', summary: 'plain cut-off, no dithering' },
};

export const ALIASES = { 'floyd-steinberg': 'floyd', fs: 'floyd', ordered: 'bayer' };

export function resolveAlgorithm(name) {
  const key = String(name || '').toLowerCase();
  if (ALGORITHMS[key]) return key;
  return ALIASES[key] || null;
}

// Error-diffusion kernels: [dx, dy, weight].
const KERNELS = {
  floyd: [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]],
  atkinson: [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]],
};

// Build the 8x8 Bayer matrix by recursive doubling, normalised to (0, 1).
const BAYER8 = (() => {
  let m = [[0]];
  while (m.length < 8) {
    const n = m.length;
    const next = Array.from({ length: n * 2 }, () => new Array(n * 2));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = m[y][x] * 4;
        next[y][x] = v;
        next[y][x + n] = v + 2;
        next[y + n][x] = v + 3;
        next[y + n][x + n] = v + 1;
      }
    }
    m = next;
  }
  return m.map((row) => row.map((v) => (v + 0.5) / 64));
})();

function diffuse(gray, w, h, kernel, bias) {
  const buf = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) buf[i] = Math.min(1, Math.max(0, gray[i] + bias));
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = buf[i];
      const white = old >= 0.5 ? 1 : 0;
      out[i] = white ? 0 : 1;
      const err = old - white;
      for (const [dx, dy, wgt] of kernel) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny < h) buf[ny * w + nx] += err * wgt;
      }
    }
  }
  return out;
}

export function dither(gray, w, h, algorithm = 'atkinson', threshold = 128) {
  const bias = 0.5 - threshold / 255;
  const out = new Uint8Array(w * h);
  switch (algorithm) {
    case 'floyd':
    case 'atkinson':
      return diffuse(gray, w, h, KERNELS[algorithm], bias);
    case 'bayer':
      for (let y = 0; y < h; y++) {
        const row = BAYER8[y & 7];
        for (let x = 0; x < w; x++) out[y * w + x] = gray[y * w + x] + bias < row[x & 7] ? 1 : 0;
      }
      return out;
    case 'threshold':
    default:
      for (let i = 0; i < gray.length; i++) out[i] = gray[i] + bias < 0.5 ? 1 : 0;
      return out;
  }
}
