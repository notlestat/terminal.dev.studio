// Parameter Tool: sliders and drop-downs for the same settings the shell commands
// change. It writes to the store and redraws itself from the store, so both stay in sync.
import { fonts } from '../gfx/font.js';
import { state, subscribe, setSource, setParams, setDither } from '../core/store.js';
import { generators, getGenerator } from '../generators/index.js';
import { ALGORITHMS } from '../dither.js';
import { getOutput } from '../pipeline.js';
import { exportPNG } from '../export-png.js';
import { Frame, iconShell } from '../wm/wm.js';
import { textWidth } from '../ui/draw.js';
import { createSlider, createChoice, createButton } from '../ui/widgets.js';

function drawParamsIcon(bm) {
  const area = iconShell(bm, 'params', fonts.small);
  [0.3, 0.75, 0.5].forEach((t, i) => {
    const y = area.y + 7 + i * 12;
    const x0 = area.x + 4, w = area.w - 8;
    bm.rect(x0, y - 2, w, 5);
    bm.fillRect(x0 + 1, y - 1, Math.round((w - 2) * t), 3);
  });
}

export function createParamsTool({ x, y } = {}) {
  const el = document.createElement('div');
  el.className = 'panel';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Render parameters');

  const labels = ['Generator:', 'Dither:', 'Threshold:', ...generators.flatMap((g) => g.params.map((p) => `${p.label}:`))];
  const labelWidth = Math.max(...labels.map((l) => textWidth(l, { bold: true })));

  // Both drop-downs share one box width so they line up.
  const choiceWidth = Math.max(...[...Object.values(ALGORITHMS).map((a) => a.label), ...generators.map((g) => g.name), 'image']
    .map((l) => textWidth(l))) + 34;

  const sourceOptions = () => [
    ...generators.map((g) => ({ value: g.name, label: g.name })),
    ...(state.image ? [{ value: 'image', label: 'image' }] : []),
  ];

  const sourceChoice = createChoice({
    label: 'Generator:', labelWidth, minWidth: choiceWidth, options: sourceOptions(), value: state.source,
    onChange: (v) => setSource(v),
  });

  const paramRows = document.createElement('div');
  paramRows.className = 'panel';
  paramRows.style.padding = '0';
  let sliders = {};
  let shownSource = null;

  function buildParamRows() {
    shownSource = state.source;
    paramRows.replaceChildren();
    sliders = {};
    const gen = getGenerator(state.source);
    if (!gen) return;
    for (const p of gen.params) {
      const s = createSlider({
        label: `${p.label}:`, labelWidth, min: p.min, max: p.max, value: state.params[gen.name][p.key],
        onInput: (v) => setParams(gen.name, { [p.key]: v }),
      });
      sliders[p.key] = s;
      paramRows.append(s.el);
    }
  }

  const ditherChoice = createChoice({
    label: 'Dither:', labelWidth, minWidth: choiceWidth,
    options: Object.entries(ALGORITHMS).map(([value, a]) => ({ value, label: a.label })),
    value: state.dither.algorithm,
    onChange: (v) => setDither({ algorithm: v }),
  });
  const threshold = createSlider({
    label: 'Threshold:', labelWidth, min: 0, max: 255, value: state.dither.threshold,
    onInput: (v) => setDither({ threshold: v }),
  });

  const buttons = document.createElement('div');
  buttons.className = 'panel-row';
  buttons.append(
    createButton({
      label: 'New Seed',
      onClick: () => {
        const gen = getGenerator(state.source);
        if (gen && gen.params.some((p) => p.key === 'seed')) setParams(gen.name, { seed: Math.floor(Math.random() * 10000) });
      },
    }).el,
    createButton({
      label: 'Export PNG',
      onClick: () => {
        const { bits, w, h } = getOutput();
        const src = state.source === 'image' ? 'image' : `${state.source}-${state.params[state.source].seed}`;
        exportPNG(bits, w, h, 2, `studio-${src}-${state.dither.algorithm}-2x.png`);
      },
    }).el,
  );

  el.append(sourceChoice.el, paramRows, ditherChoice.el, threshold.el, buttons);
  buildParamRows();

  // Store -> controls. Setting a value here does not call back into the store.
  const unsub = subscribe(() => {
    sourceChoice.setOptions(sourceOptions());
    sourceChoice.setValue(state.source);
    if (state.source !== shownSource) buildParamRows();
    const gen = getGenerator(state.source);
    if (gen) for (const p of gen.params) sliders[p.key]?.setValue(state.params[gen.name][p.key]);
    ditherChoice.setValue(state.dither.algorithm);
    threshold.setValue(state.dither.threshold);
  });

  const frame = new Frame({ title: 'Parameter Tool 1.1', iconLabel: 'params', drawIcon: drawParamsIcon, body: el, x, y });
  frame.onClose(unsub);
  return frame;
}
