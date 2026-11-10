// Shell Tool: a line-editing command line with history, a --More-- pager,
// mouse selection in inverse video, and copy/paste.
import { fonts } from '../../gfx/font.js';
import { scale } from '../../core/scale.js';
import { Frame, iconShell } from '../../wm/wm.js';
import { showBitmap } from '../../ui/draw.js';
import { Terminal, toLine, wrapLine, INVERSE } from './terminal.js';
import { buildCommands, completions, CLEAR, EXIT } from './commands.js';

const PROMPT = 'studio% ';
let instances = 0;

function drawShellIcon(label) {
  return (bm) => {
    const area = iconShell(bm, label, fonts.small);
    const t = fonts.tiny;
    const x = area.x + 3;
    bm.text(t, '% ls', x, area.y + 2);
    bm.text(t, 'spheres*', x, area.y + 11);
    bm.text(t, '% man', x, area.y + 20);
    bm.text(t, '%', x, area.y + 29);
    bm.fillRect(x + 7, area.y + 29, 5, 8);
  };
}

// Split a command line into words. Single or double quotes group words.
function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export function createShellTool({ x, y, cols = 80, rows = 24, label = 'shell', banner = [], script = [] } = {}) {
  instances++;
  const commands = buildCommands();
  const term = new Terminal(cols, rows, fonts.regular);

  const el = document.createElement('div');
  el.className = 'shell';
  el.tabIndex = 0;
  el.setAttribute('role', 'application');
  el.setAttribute('aria-roledescription', 'terminal');
  el.setAttribute('aria-label', `Shell Tool terminal. Type help and press Return.`);
  const canvas = document.createElement('canvas');
  el.append(canvas);
  const live = document.createElement('div');
  live.className = 'visually-hidden';
  live.setAttribute('aria-live', 'polite');
  el.append(live);

  // Editing state
  let input = '';
  let caret = 0;
  const history = [];
  let histIndex = 0;
  let draft = '';
  let mode = 'prompt'; // 'prompt' | 'more' | 'busy'
  let pager = null; // { queue, total, shown }
  let scrollOffset = 0; // rows scrolled back from the bottom
  let selection = null; // { a: {row, col}, b: {row, col} } in absolute rows
  let focused = false;

  // ---- composition: scrollback rows + the live input row(s) ----

  function inputRows() {
    if (mode === 'busy') return [];
    if (mode === 'more') {
      const pct = Math.round((pager.shown / pager.total) * 100);
      return [toLine([[`--More--(${pct}%)`, INVERSE]])];
    }
    const text = PROMPT + input;
    const rowsNeeded = Math.max(Math.ceil(text.length / cols), Math.floor((PROMPT.length + caret) / cols) + 1);
    const out = wrapLine({ text, attr: null }, cols);
    while (out.length < rowsNeeded) out.push({ text: '', attr: null });
    return out;
  }

  function allRows() {
    return term.lines.concat(inputRows());
  }

  function viewStart(total) {
    const maxOffset = Math.max(0, total - rows);
    scrollOffset = Math.min(scrollOffset, maxOffset);
    return Math.max(0, total - rows - scrollOffset);
  }

  function render() {
    const all = allRows();
    const start = viewStart(all.length);
    const visible = all.slice(start, start + rows);

    let sel = null;
    if (selection) {
      let [a, b] = [selection.a, selection.b];
      if (a.row > b.row || (a.row === b.row && a.col > b.col)) [a, b] = [b, a];
      if (a.row !== b.row || a.col !== b.col) sel = [{ row: a.row - start, col: a.col }, { row: b.row - start, col: b.col }];
    }

    let cursor = null;
    if (mode === 'prompt') {
      const idx = PROMPT.length + caret;
      const first = term.lines.length;
      cursor = { row: first + Math.floor(idx / cols) - start, col: idx % cols, solid: focused };
    }
    showBitmap(term.render(visible, sel, cursor), canvas);
  }

  // ---- output ----

  function normalize(result) {
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.lines)) return result.lines;
    return [];
  }

  function pushRows(rowsToAdd) {
    const dropped = term.push(rowsToAdd);
    if (dropped && selection) {
      selection.a.row -= dropped;
      selection.b.row -= dropped;
      if (selection.a.row < 0 || selection.b.row < 0) selection = null;
    }
  }

  function print(lines) {
    const wrapped = lines.flatMap((l) => wrapLine(toLine(l), cols));
    const page = rows - 1;
    if (wrapped.length <= page) {
      pushRows(wrapped);
    } else {
      pushRows(wrapped.slice(0, page));
      pager = { queue: wrapped.slice(page), total: wrapped.length, shown: page };
      mode = 'more';
    }
    live.textContent = lines.map((l) => toLine(l).text).join('\n').slice(0, 2000);
  }

  function advancePager(n) {
    const next = pager.queue.splice(0, n);
    pushRows(next);
    pager.shown += next.length;
    if (!pager.queue.length) {
      pager = null;
      mode = 'prompt';
    }
  }

  async function execute(line) {
    pushRows(wrapLine({ text: PROMPT + line, attr: null }, cols));
    const words = tokenize(line);
    input = '';
    caret = 0;
    if (line.trim() && history[history.length - 1] !== line) history.push(line);
    histIndex = history.length;
    if (!words.length) return;

    const [name, ...args] = words;
    const cmd = commands[name];
    if (!cmd) {
      print([`${name}: Command not found.`]);
      return;
    }
    mode = 'busy';
    render();
    try {
      const result = await cmd.run(args, { cols, history, commands });
      mode = 'prompt';
      if (result === CLEAR) {
        term.clear();
        selection = null;
      } else if (result === EXIT) {
        frame.close();
        return;
      } else print(normalize(result));
    } catch (err) {
      mode = 'prompt';
      print(String(err.message).split('\n'));
      if (!err.isUsage) console.warn(err);
    }
  }

  // Run commands as if typed, used for the opening scene.
  async function runScript(lines) {
    for (const line of lines) await execute(line);
    render();
  }

  // ---- line editing ----

  function insert(text) {
    const clean = text.replace(/[\r\n\t]+/g, ' ').replace(/[\x00-\x1f\x7f]/g, '');
    input = input.slice(0, caret) + clean + input.slice(caret);
    caret += clean.length;
  }

  function complete() {
    const before = input.slice(0, caret);
    const words = before.split(/\s+/);
    const matches = completions(words, commands);
    const last = words[words.length - 1];
    if (matches.length === 1) {
      insert(matches[0].slice(last.length) + ' ');
    } else if (matches.length > 1) {
      let common = matches[0];
      for (const m of matches) while (!m.startsWith(common)) common = common.slice(0, -1);
      if (common.length > last.length) insert(common.slice(last.length));
      else {
        pushRows(wrapLine({ text: PROMPT + input, attr: null }, cols));
        print([matches.join('  ')]);
      }
    }
  }

  function historyStep(dir) {
    if (!history.length) return;
    if (histIndex === history.length) draft = input;
    histIndex = Math.min(history.length, Math.max(0, histIndex + dir));
    input = histIndex === history.length ? draft : history[histIndex];
    caret = input.length;
  }

  function selectedText() {
    if (!selection) return '';
    let [a, b] = [selection.a, selection.b];
    if (a.row > b.row || (a.row === b.row && a.col > b.col)) [a, b] = [b, a];
    const all = allRows();
    const out = [];
    for (let r = a.row; r <= b.row; r++) {
      const text = all[r]?.text || '';
      out.push(text.slice(r === a.row ? a.col : 0, r === b.row ? b.col : cols).trimEnd());
    }
    return out.join('\n');
  }

  function onKeyDown(e) {
    if (e.isComposing) return;
    const key = e.key;
    const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;

    // Copy: leave it to the browser so the copy event fires.
    if ((e.metaKey || e.ctrlKey) && key.toLowerCase() === 'c' && selection) return;
    // Other Command-key shortcuts belong to the browser, except Cmd+K (clear).
    if (e.metaKey) {
      if (key.toLowerCase() === 'k') {
        e.preventDefault();
        term.clear();
        selection = null;
        render();
      }
      return;
    }
    if (ctrl && key.toLowerCase() === 'v') return; // paste event handles it
    // Tab with an empty line moves focus on, so the terminal is not a keyboard trap.
    if (key === 'Tab' && (e.shiftKey || (mode === 'prompt' && !input))) return;

    e.preventDefault();
    scrollOffset = key === 'PageUp' || key === 'PageDown' ? scrollOffset : 0;

    if (key === 'PageUp') scrollOffset += rows - 1;
    else if (key === 'PageDown') scrollOffset = Math.max(0, scrollOffset - (rows - 1));
    else if (mode === 'busy') return;
    else if (mode === 'more') {
      if (key === ' ' || key === 'PageDown') advancePager(rows - 1);
      else if (key === 'Enter' || key === 'ArrowDown' || key === 'j') advancePager(1);
      else if (key === 'q' || key === 'Q' || key === 'Escape' || (ctrl && key === 'c')) {
        pager = null;
        mode = 'prompt';
      }
    } else if (ctrl) {
      switch (key.toLowerCase()) {
        case 'a': caret = 0; break;
        case 'e': caret = input.length; break;
        case 'u': input = input.slice(caret); caret = 0; break;
        case 'k': input = input.slice(0, caret); break;
        case 'w': {
          const head = input.slice(0, caret).replace(/\S+\s*$/, '');
          input = head + input.slice(caret);
          caret = head.length;
          break;
        }
        case 'l': term.clear(); selection = null; break;
        case 'c':
          pushRows(wrapLine({ text: `${PROMPT}${input}^C`, attr: null }, cols));
          input = '';
          caret = 0;
          histIndex = history.length;
          break;
        default: return;
      }
    } else {
      switch (key) {
        case 'Enter': {
          const line = input;
          selection = null;
          execute(line).then(render);
          break;
        }
        case 'Backspace':
          if (caret > 0) {
            input = input.slice(0, caret - 1) + input.slice(caret);
            caret--;
          }
          break;
        case 'Delete': input = input.slice(0, caret) + input.slice(caret + 1); break;
        case 'ArrowLeft': caret = Math.max(0, caret - 1); break;
        case 'ArrowRight': caret = Math.min(input.length, caret + 1); break;
        case 'Home': caret = 0; break;
        case 'End': caret = input.length; break;
        case 'ArrowUp': historyStep(-1); break;
        case 'ArrowDown': historyStep(1); break;
        case 'Tab': complete(); break;
        case 'Escape': selection = null; break;
        default:
          if (key.length === 1) insert(key);
          else return;
      }
    }
    render();
  }

  // ---- mouse: focus, selection, wheel scrollback ----

  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    const lx = (e.clientX - r.left) / scale.css - term.pad;
    const ly = (e.clientY - r.top) / scale.css - term.pad;
    const all = allRows();
    const start = viewStart(all.length);
    return {
      row: start + Math.max(0, Math.min(rows - 1, Math.floor(ly / term.font.height))),
      col: Math.max(0, Math.min(cols, Math.round(lx / term.font.width))),
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.focus();
    const anchor = cellAt(e);
    selection = { a: anchor, b: { ...anchor } };
    canvas.setPointerCapture(e.pointerId);
    const move = (ev) => {
      selection.b = cellAt(ev);
      render();
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      if (selection && selection.a.row === selection.b.row && selection.a.col === selection.b.col) selection = null;
      render();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    render();
  });

  canvas.addEventListener('dblclick', (e) => {
    const c = cellAt(e);
    const text = allRows()[c.row]?.text || '';
    let s = Math.min(c.col, text.length - 1), t = s;
    if (s < 0 || /\s/.test(text[s])) return;
    while (s > 0 && /\S/.test(text[s - 1])) s--;
    while (t < text.length && /\S/.test(text[t])) t++;
    selection = { a: { row: c.row, col: s }, b: { row: c.row, col: t } };
    render();
  });

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    scrollOffset = Math.max(0, scrollOffset + (e.deltaY < 0 ? 3 : -3));
    render();
  }, { passive: false });

  el.addEventListener('keydown', onKeyDown);
  el.addEventListener('focus', () => { focused = true; render(); });
  el.addEventListener('blur', () => { focused = false; render(); });
  el.addEventListener('copy', (e) => {
    const text = selectedText();
    if (!text) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
  });
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    if (mode !== 'prompt') return;
    insert(e.clipboardData.getData('text/plain'));
    render();
  });

  const frame = new Frame({
    title: 'Shell Tool 1.1',
    iconLabel: label,
    drawIcon: drawShellIcon(label),
    body: el,
    x, y,
    focusTarget: el,
    menuItems: () => [{ label: 'Clear', action: () => { term.clear(); selection = null; render(); } }],
  });

  print(banner);
  render();
  if (script.length) runScript(script);
  return frame;
}

export const shellCount = () => instances;
