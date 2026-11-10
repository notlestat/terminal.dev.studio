// Generator plugin: seeded Perlin-style gradient noise, summed over octaves (fBm).
import { mulberry32 } from '../core/rng.js';

const GRADIENTS = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)]);
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function makeNoise(seed) {
  const rand = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad = (ix, iy, x, y) => {
    const g = GRADIENTS[perm[perm[ix & 255] + (iy & 255)] & 7];
    return g[0] * (x - ix) + g[1] * (y - iy);
  };

  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const u = fade(x - x0), v = fade(y - y0);
    const a = lerp(grad(x0, y0, x, y), grad(x0 + 1, y0, x, y), u);
    const b = lerp(grad(x0, y0 + 1, x, y), grad(x0 + 1, y0 + 1, x, y), u);
    return lerp(a, b, v);
  };
}

export default {
  name: 'noise',
  summary: 'render a seeded noise field',
  description: [
    'Fills the frame with Perlin-style gradient noise. Several octaves are summed, each at twice the frequency and half the strength of the last, then the result is stretched to the full grey range and dithered.',
  ],
  params: [
    { key: 'seed', flag: 'seed', label: 'Seed', arg: 'N', min: 0, max: 9999, default: 7, doc: 'Random seed for the noise field.' },
    { key: 'scale', flag: 'scale', label: 'Scale', arg: 'N', min: 4, max: 160, default: 48, doc: 'Size of the largest features, in pixels.' },
    { key: 'octaves', flag: 'oct', label: 'Octaves', arg: 'N', min: 1, max: 6, default: 4, doc: 'Number of noise layers summed together.' },
  ],

  render({ seed, scale, octaves }, w, h) {
    const noise = makeNoise(seed);
    const gray = new Float32Array(w * h);
    let min = Infinity, max = -Infinity;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, amp = 1, freq = 1 / scale;
        for (let o = 0; o < octaves; o++) {
          sum += amp * noise(x * freq, y * freq);
          amp *= 0.5;
          freq *= 2;
        }
        gray[y * w + x] = sum;
        if (sum < min) min = sum;
        if (sum > max) max = sum;
      }
    }
    const range = max - min || 1;
    for (let i = 0; i < gray.length; i++) gray[i] = (gray[i] - min) / range;
    return gray;
  },
};
