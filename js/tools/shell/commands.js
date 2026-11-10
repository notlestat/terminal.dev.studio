// Shell commands and their manual pages. Generator commands (spheres, noise, ...)
// are built from the generator plugins, so a new plugin gets a command for free.
import { state, setSource, setParams, setDither } from '../../core/store.js';
import { generators, getGenerator } from '../../generators/index.js';
import { ALGORITHMS, resolveAlgorithm } from '../../dither.js';
import { getOutput } from '../../pipeline.js';
import { exportPNG } from '../../export-png.js';
import { ctime } from '../../core/time.js';
import { INVERSE } from './terminal.js';

export const CLEAR = Symbol('clear');
export const EXIT = Symbol('exit');

const ALGO_NAMES = Object.keys(ALGORITHMS);
const EXPORT_SCALE = { flag: 'scale', key: 'scale', arg: 'N', min: 1, max: 16, default: 2 };
const THRESHOLD = { flag: 'threshold', key: 'threshold', arg: 'N', min: 0, max: 255 };

// ---- helpers ----

function fail(message) {
  const err = new Error(message);
  err.isUsage = true;
  throw err;
}

// Parse "-flag value" pairs. Values must be whole numbers inside the spec's range.
function parseFlags(cmd, args, specs) {
  const values = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const tok = args[i];
    if (!tok.startsWith('-') || /^-\d/.test(tok)) {
      rest.push(tok);
      continue;
    }
    const spec = specs.find((s) => `-${s.flag}` === tok || (s.alias && `-${s.alias}` === tok));
    if (!spec) fail(`${cmd}: unknown option ${tok}`);
    const raw = args[++i];
    const n = Number(raw);
    if (raw === undefined || !Number.isInteger(n) || n < spec.min || n > spec.max) {
      fail(`${cmd}: ${tok} needs a whole number from ${spec.min} to ${spec.max}`);
    }
    values[spec.key] = n;
  }
  return { values, rest };
}

function wrapWords(text, width) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

// Lay words out in columns, top to bottom, like ls.
function columns(words, cols) {
  if (!words.length) return [];
  const w = Math.max(...words.map((s) => s.length)) + 2;
  const ncols = Math.max(1, Math.floor(cols / w));
  const nrows = Math.ceil(words.length / ncols);
  const lines = [];
  for (let r = 0; r < nrows; r++) {
    let line = '';
    for (let c = 0; c < ncols; c++) {
      const word = words[c * nrows + r];
      if (word !== undefined) line += word.padEnd(w);
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// Emphasis is inverse video, as the reference shell tool shows man pages:
// headings stay plain, the command name and option flags are reversed.
function emphasise(line, words) {
  const segs = [];
  for (const part of line.split(/(\s+|[,.;:()[\]|])/)) {
    if (!part) continue;
    segs.push(words.includes(part) ? [part, INVERSE] : [part]);
  }
  return segs;
}

function manPage(name, { summary, synopsis, description = [], options = [], examples = [], seeAlso = [] }, cols) {
  const title = `${name.toUpperCase()}(1)`;
  const center = 'STUDIO COMMANDS';
  const gap = Math.max(1, cols - 1 - title.length * 2 - center.length);
  const left = Math.floor(gap / 2);
  const width = Math.max(20, cols - 6);
  const lines = [
    `${title}${' '.repeat(left)}${center}${' '.repeat(gap - left)}${title}`,
    '',
    'NAME',
    `     ${name} - ${summary}`,
    '',
    'SYNOPSIS',
    ...[].concat(synopsis).map((s) => emphasise(`     ${s}`, [name])),
    '',
  ];
  if (description.length) {
    lines.push('DESCRIPTION');
    for (const para of description) {
      lines.push(...wrapWords(para, width - 5).map((l) => emphasise(`     ${l}`, [name])), '');
    }
  }
  if (options.length) {
    lines.push('OPTIONS');
    for (const [flag, doc] of options) {
      lines.push(emphasise(`     ${flag}`, [flag.split(' ')[0]]), ...wrapWords(doc, width - 10).map((l) => `          ${l}`), '');
    }
  }
  if (examples.length) {
    lines.push('EXAMPLES');
    for (const ex of examples) lines.push(`     studio% ${ex}`);
    lines.push('');
  }
  if (seeAlso.length) {
    lines.push('SEE ALSO', `     ${seeAlso.map((s) => `${s}(1)`).join(', ')}`, '');
  }
  return lines;
}

const describeParams = (gen) => gen.params.map((p) => `${p.key} ${state.params[gen.name][p.key]}`).join(', ');

// ---- generator commands, one per plugin ----

function generatorCommand(gen) {
  const synopsis = `${gen.name} ${gen.params.map((p) => `[-${p.flag} ${p.arg}]`).join(' ')}`;
  return {
    summary: gen.summary,
    synopsis,
    man: {
      summary: gen.summary,
      synopsis,
      description: [
        ...gen.description,
        `With no options, ${gen.name} re-renders with the current settings. Options change only the settings you name, and the Parameter Tool updates to match.`,
      ],
      options: gen.params.map((p) => [`-${p.flag} ${p.arg}`, `${p.doc} ${p.min} to ${p.max}, default ${p.default}.`]),
      examples: [gen.name, `${gen.name} ${gen.params.map((p) => `-${p.flag} ${Math.round((p.min + p.max) / 3)}`).join(' ')}`, 'export -scale 4'],
      seeAlso: ['dither', 'export', ...generators.filter((g) => g !== gen).map((g) => g.name)],
    },
    run(args) {
      const { values, rest } = parseFlags(gen.name, args, gen.params);
      if (rest.length) fail(`${gen.name}: unexpected argument '${rest[0]}'\nusage: ${synopsis}`);
      setSource(gen.name);
      setParams(gen.name, values);
      return [`${gen.name}: ${describeParams(gen)}; ${state.dither.algorithm} dither`];
    },
  };
}

// ---- built-in commands ----

const builtins = {
  help: {
    summary: 'list the available commands',
    synopsis: 'help',
    man: {
      summary: 'list the available commands',
      synopsis: 'help',
      description: ['Prints each command with a one-line summary. Use man for the full page.'],
      seeAlso: ['man', 'ls'],
    },
    run(args, ctx) {
      const names = Object.keys(ctx.commands).sort();
      const w = Math.max(...names.map((n) => n.length)) + 2;
      return [
        'Studio commands:',
        '',
        ...names.map((n) => `  ${n.padEnd(w)}${ctx.commands[n].summary}`),
        '',
        'Type man <command> for details. Right-click the desktop for tools.',
      ];
    },
  },

  ls: {
    summary: 'list the studio directory',
    synopsis: 'ls',
    man: {
      summary: 'list the studio directory',
      synopsis: 'ls',
      description: ['Lists the commands and generators in the studio, plus any image dropped on the Graphics Tool. Generators are marked with *.'],
      seeAlso: ['help'],
    },
    run(args, ctx) {
      const names = Object.keys(ctx.commands).filter((n) => !getGenerator(n));
      const entries = [...names, ...generators.map((g) => `${g.name}*`)];
      if (state.image) entries.push(state.image.name);
      return columns(entries.sort(), ctx.cols);
    },
  },

  clear: {
    summary: 'clear the screen',
    synopsis: 'clear',
    man: { summary: 'clear the screen', synopsis: 'clear', description: ['Clears the window and its scrollback. Control-L does the same.'] },
    run: () => CLEAR,
  },

  man: {
    summary: 'show the manual page for a command',
    synopsis: 'man command',
    man: {
      summary: 'show the manual page for a command',
      synopsis: 'man command',
      description: [
        'Shows the manual page for command. Pages longer than the window stop at --More--. Press Space for the next page, Return for the next line, or q to stop.',
      ],
      examples: ['man spheres', 'man dither'],
      seeAlso: ['help'],
    },
    run(args, ctx) {
      if (!args.length) return ['What manual page do you want?'];
      const cmd = ctx.commands[args[0]];
      if (!cmd) return [`No manual entry for ${args[0]}.`];
      return { lines: manPage(args[0], cmd.man, ctx.cols), page: true };
    },
  },

  dither: {
    summary: 'choose the dithering algorithm',
    synopsis: 'dither [atkinson|floyd|bayer|threshold] [-threshold N]',
    man: {
      summary: 'choose the dithering algorithm',
      synopsis: 'dither [atkinson|floyd|bayer|threshold] [-threshold N]',
      description: [
        'Sets the algorithm that turns the grey image into black and white pixels, then re-renders. With no arguments, dither prints the current setting.',
        ...ALGO_NAMES.map((n) => `${n}: ${ALGORITHMS[n].summary}.`),
      ],
      options: [['-threshold N', 'The grey level, 0 to 255, that falls on the black/white split. Higher values give a darker image. Default 128.']],
      examples: ['dither floyd', 'dither bayer -threshold 100', 'dither'],
      seeAlso: ['spheres', 'noise', 'export'],
    },
    run(args) {
      const { values, rest } = parseFlags('dither', args, [THRESHOLD]);
      if (rest.length > 1) fail(`dither: too many arguments\nusage: ${builtins.dither.synopsis}`);
      if (rest.length) {
        const algo = resolveAlgorithm(rest[0]);
        if (!algo) fail(`dither: unknown algorithm '${rest[0]}'. Choose ${ALGO_NAMES.join(', ')}.`);
        values.algorithm = algo;
      }
      if (!rest.length && values.threshold === undefined) {
        return [
          `dither: ${state.dither.algorithm}, threshold ${state.dither.threshold}`,
          ...ALGO_NAMES.map((n) => `  ${n === state.dither.algorithm ? '*' : ' '} ${n.padEnd(10)} ${ALGORITHMS[n].label}`),
        ];
      }
      setDither(values);
      return [`dither: ${state.dither.algorithm}, threshold ${state.dither.threshold}`];
    },
  },

  export: {
    summary: 'download the picture as a 1-bit PNG',
    synopsis: 'export [-scale N]',
    man: {
      summary: 'download the picture as a 1-bit PNG',
      synopsis: 'export [-scale N]',
      description: [
        'Downloads the Graphics Tool picture as a PNG with a bit depth of 1, so the file holds exactly two colours. Each pixel becomes an N by N block of identical pixels: integer scaling with no smoothing.',
      ],
      options: [['-scale N', 'Whole-number enlargement, 1 to 16. Default 2, giving 640 by 480.']],
      examples: ['export', 'export -scale 1', 'export -scale 8'],
      seeAlso: ['spheres', 'noise', 'dither'],
    },
    async run(args) {
      const { values, rest } = parseFlags('export', args, [EXPORT_SCALE]);
      if (rest.length) fail(`export: unexpected argument '${rest[0]}'\nusage: export [-scale N]`);
      const s = values.scale ?? EXPORT_SCALE.default;
      const { bits, w, h } = getOutput();
      const src = state.source === 'image' ? state.image.name.replace(/\.\w+$/, '') : `${state.source}-${state.params[state.source].seed}`;
      const filename = `studio-${src}-${state.dither.algorithm}-${s}x.png`;
      const res = await exportPNG(bits, w, h, s, filename);
      return [`export: ${filename} (${res.width}x${res.height}, 1-bit, ${res.bytes} bytes)`];
    },
  },

  image: {
    summary: 'show the image dropped on the Graphics Tool',
    synopsis: 'image',
    man: {
      summary: 'show the image dropped on the Graphics Tool',
      synopsis: 'image',
      description: ['Drop an image file on the Graphics Tool to load it. It is fitted into 320 by 240, converted to grey and dithered with the active algorithm. After running a generator, image switches back to the dropped picture.'],
      seeAlso: ['dither', 'export'],
    },
    run() {
      if (!state.image) return ['image: no image yet. Drop one on the Graphics Tool.'];
      setSource('image');
      return [`image: ${state.image.name} (${state.image.original})`];
    },
  },

  history: {
    summary: 'list previous commands',
    synopsis: 'history',
    man: { summary: 'list previous commands', synopsis: 'history', description: ['Lists the commands typed in this window. Up and down arrows step through them.'] },
    run: (args, ctx) => ctx.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`),
  },

  date: {
    summary: 'print the date and time',
    synopsis: 'date',
    man: { summary: 'print the date and time', synopsis: 'date', description: ['Prints the current local date and time.'] },
    run: () => [ctime()],
  },

  echo: {
    summary: 'print its arguments',
    synopsis: 'echo [text ...]',
    man: { summary: 'print its arguments', synopsis: 'echo [text ...]' },
    run: (args) => [args.join(' ')],
  },

  exit: {
    summary: 'close this Shell Tool',
    synopsis: 'exit',
    man: { summary: 'close this Shell Tool', synopsis: 'exit', description: ['Closes the window. Open another from the desktop menu.'] },
    run: () => EXIT,
  },
};

export function buildCommands() {
  const cmds = { ...builtins };
  for (const gen of generators) cmds[gen.name] = generatorCommand(gen);
  return cmds;
}

// Tab completion: command names first, then arguments for man and dither.
export function completions(words, commands) {
  if (words.length <= 1) return Object.keys(commands).filter((n) => n.startsWith(words[0] || '')).sort();
  const last = words[words.length - 1];
  if (words[0] === 'man' && words.length === 2) return Object.keys(commands).filter((n) => n.startsWith(last)).sort();
  if (words[0] === 'dither' && words.length === 2) return ALGO_NAMES.filter((n) => n.startsWith(last));
  return [];
}
