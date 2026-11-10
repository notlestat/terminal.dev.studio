// The single source of truth for render settings. The shell and the
// Parameter Tool both write here and both subscribe, which keeps them in sync.
import { generators, getGenerator } from '../generators/index.js';
import { ALGORITHMS } from '../dither.js';

export const state = {
  source: 'spheres', // a generator name, or 'image' after a file is dropped
  params: Object.fromEntries(generators.map((g) => [g.name, Object.fromEntries(g.params.map((p) => [p.key, p.default]))])),
  dither: { algorithm: 'atkinson', threshold: 128 },
  image: null, // { name, gray, w, h }
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(change) {
  for (const fn of listeners) fn(change);
}

export function clampParam(spec, value) {
  return Math.min(spec.max, Math.max(spec.min, Math.round(value)));
}

export function setSource(name) {
  if (name !== 'image' && !getGenerator(name)) return;
  if (name === 'image' && !state.image) return;
  state.source = name;
  emit({ kind: 'source' });
}

export function setParams(genName, values) {
  const gen = getGenerator(genName);
  if (!gen) return;
  for (const [key, value] of Object.entries(values)) {
    const spec = gen.params.find((p) => p.key === key);
    if (spec && Number.isFinite(value)) state.params[genName][key] = clampParam(spec, value);
  }
  emit({ kind: 'params', generator: genName });
}

export function setDither({ algorithm, threshold }) {
  if (algorithm && ALGORITHMS[algorithm]) state.dither.algorithm = algorithm;
  if (Number.isFinite(threshold)) state.dither.threshold = Math.min(255, Math.max(0, Math.round(threshold)));
  emit({ kind: 'dither' });
}

export function setImage(image) {
  state.image = image;
  state.source = 'image';
  emit({ kind: 'source' });
}

// The shell command that reproduces the current picture.
export function describeState() {
  const d = `dither ${state.dither.algorithm} -threshold ${state.dither.threshold}`;
  if (state.source === 'image') return `image ${state.image.name}; ${d}`;
  const gen = getGenerator(state.source);
  const flags = gen.params.map((p) => `-${p.flag} ${state.params[gen.name][p.key]}`).join(' ');
  return `${gen.name} ${flags}; ${d}`;
}
