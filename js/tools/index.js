// Tool registry: what the root menu can open. Shell Tools can have many
// instances; the other tools are single and are raised or restored if already open.
import { createShellTool } from './shell/shell.js';
import { createGraphicsTool } from './graphics.js';
import { createParamsTool } from './params.js';
import { createClockTool } from './clock.js';

export const TOOLS = {
  shell: { label: 'Shell Tool', multi: true, create: createShellTool },
  graphics: { label: 'Graphics Tool', create: createGraphicsTool },
  params: { label: 'Parameter Tool', create: createParamsTool },
  clock: { label: 'Clock Tool', create: createClockTool },
};

const open = new Map(Object.keys(TOOLS).map((k) => [k, new Set()]));
let cascade = 0;

export function openTool(name, opts = {}) {
  const def = TOOLS[name];
  const existing = open.get(name);
  if (!def.multi && existing.size) {
    const frame = [...existing][0];
    if (frame.iconified) frame.restore();
    else { frame.raise(); frame.focus(); }
    return frame;
  }
  if (opts.x === undefined) {
    opts.x = 48 + (cascade % 8) * 24;
    opts.y = 48 + (cascade % 8) * 24;
    cascade++;
  }
  const frame = def.create(opts);
  existing.add(frame);
  frame.onClose(() => existing.delete(frame));
  return frame;
}
