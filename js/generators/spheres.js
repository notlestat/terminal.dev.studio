// Generator plugin: Lambert-shaded spheres on a white field.
import { mulberry32 } from '../core/rng.js';

export default {
  name: 'spheres',
  summary: 'render Lambert-shaded spheres',
  description: [
    'Places count spheres at seeded random positions and shades each one with the Lambert model: brightness is the cosine of the angle between the surface normal and the light. The grey image is then dithered with the active algorithm.',
    'The same seed always gives the same arrangement.',
  ],
  params: [
    { key: 'count', flag: 'n', label: 'Count', arg: 'count', min: 1, max: 24, default: 5, doc: 'Number of spheres.' },
    { key: 'seed', flag: 'seed', label: 'Seed', arg: 'N', min: 0, max: 9999, default: 1990, doc: 'Random seed for placement and size.' },
    { key: 'light', flag: 'light', label: 'Light', arg: 'angle', min: 0, max: 359, default: 135, doc: 'Light direction in degrees, counter-clockwise from 3 o\'clock. 135 lights from the upper left.' },
  ],

  render({ count, seed, light }, w, h) {
    const rand = mulberry32(seed);
    const az = (light * Math.PI) / 180;
    const el = (55 * Math.PI) / 180;
    // Light vector in screen space (y points down, z points at the viewer).
    const L = [Math.cos(az) * Math.cos(el), -Math.sin(az) * Math.cos(el), Math.sin(el)];

    const spheres = [];
    const minDim = Math.min(w, h);
    for (let i = 0; i < count; i++) {
      let s;
      for (let tries = 0; tries < 40; tries++) {
        const r = minDim * (0.05 + 0.3 * Math.pow(rand(), 1.4));
        s = { r, x: r + rand() * (w - 2 * r), y: r + rand() * (h - 2 * r), z: rand() };
        const crowded = spheres.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < (o.r + s.r) * 0.6);
        if (!crowded) break;
      }
      spheres.push(s);
    }

    // White field, like the stippled spheres on a SunView graphics window.
    const gray = new Float32Array(w * h).fill(1);

    // Painter's order: furthest (lowest z) first.
    spheres.sort((a, b) => a.z - b.z);
    for (const s of spheres) {
      for (let y = Math.max(0, Math.floor(s.y - s.r)); y < Math.min(h, Math.ceil(s.y + s.r)); y++) {
        for (let x = Math.max(0, Math.floor(s.x - s.r)); x < Math.min(w, Math.ceil(s.x + s.r)); x++) {
          const nx = (x + 0.5 - s.x) / s.r, ny = (y + 0.5 - s.y) / s.r;
          const d2 = nx * nx + ny * ny;
          if (d2 > 1) continue;
          const nz = Math.sqrt(1 - d2);
          const lambert = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          gray[y * w + x] = 0.02 + 0.86 * lambert;
        }
      }
    }
    return gray;
  },
};
