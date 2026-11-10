// Generator registry. To add a generator, write one file that exports
// { name, summary, description, params, render(params, w, h) } and add it here.
// The shell command, man page and Parameter Tool controls are built from it.
import spheres from './spheres.js';
import noise from './noise.js';

export const generators = [spheres, noise];

export const getGenerator = (name) => generators.find((g) => g.name === name) || null;
