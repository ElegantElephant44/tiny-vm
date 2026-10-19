import { assemble, decode, hex, OPS, type Program } from './assembler.js';
import { examples, type Example } from './examples.js';
import { instructionListing } from './listing.js';
import { visibleMemoryRows } from './memory-view.js';
import { ExecutionTrace } from './execution-trace.js';
interface State {
  memory: number[]; registers: [number, number, number]; halted: boolean; steps: number;
  historyDepth: number; historyLimit: number;
}
interface GoRuntime { importObject: WebAssembly.Imports; run(instance: WebAssembly.Instance): Promise<void> }
declare global { interface Window { Go: new () => GoRuntime; vmCall: (command: string, memory?: Uint8Array) => string } }
const $ = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};
const source = $<HTMLTextAreaElement>('source');
const select = $<HTMLSelectElement>('example');
const runButton = $<HTMLButtonElement>('run');
const stepButton = $<HTMLButtonElement>('step');
const backButton = $<HTMLButtonElement>('back');
const resetButton = $<HTMLButtonElement>('reset');
const assembleButton = $<HTMLButtonElement>('assemble');
const inputs = [0, 1, 2].map(i => $<HTMLInputElement>(`input-${i}`));
let ready = false;
let state: State | undefined;
let program: Program | undefined;
let baseline: Uint8Array | undefined;
let chosen: Example | undefined = examples[0]!;
let expected: number | undefined;
let selected = 0;
let dirty = false;
let fault = false;
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let runStart = 0;
let memoryExpanded = false;
let trace = new ExecutionTrace(0);
const memoryButtons: HTMLButtonElement[] = [];
const memoryRowLabels: HTMLElement[] = [];
const memoryRoot = $('memory');
for (let row = -1; row < 16; row++) {
  for (let column = -1; column < 16; column++) {
    if (row < 0 || column < 0) {
      const label = document.createElement('span');
      label.className = row < 0 ? 'col-label' : 'row-label';
      label.textContent = row < 0 ? (column < 0 ? '' : column.toString(16).toUpperCase()) : hex(row * 16);
      memoryRoot.append(label);
      if (row >= 0) memoryRowLabels.push(label);
    } else {
      const address = row * 16 + column;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'byte'; button.textContent = '00';
      button.addEventListener('click', () => { selected = address; renderMemory(); });
      memoryButtons.push(button); memoryRoot.append(button);
    }
  }
}
for (const example of examples) {
  const option = document.createElement('option');
  option.value = example.id; option.textContent = example.name; select.append(option);
}
const customOption = document.createElement('option');
customOption.value = 'custom'; customOption.textContent = 'Custom program'; select.append(customOption);
function selectCustom() {
  chosen = undefined;
  expected = undefined;
  select.value = 'custom';
  $('example-description').textContent = 'Your assembly and initial memory. Assemble & load to apply changes.';
}
function engine(command: string, memory?: Uint8Array): State {
  const result = JSON.parse(window.vmCall(command, memory)) as State & { error?: string };
  if (result.error) throw new Error(result.error);
  return result;
}
function error(message?: string, runtime = false) {
  for (const id of ['error', 'runtime-error']) {
    const target = runtime ? 'runtime-error' : 'error';
    $(id).hidden = id !== target || !message;
    $(id).textContent = id === target ? message || '' : '';
  }
}
function controls() {
  runButton.textContent = running ? 'Ⅱ Pause' : '▶ Run';
  runButton.disabled = !ready || !state || state.halted || dirty || fault;
  stepButton.disabled = runButton.disabled || running;
  backButton.disabled = !ready || !state || dirty || state.historyDepth === 0;
  backButton.title = `Step back one instruction. Keeps up to ${state?.historyLimit ?? 0} steps.`;
  resetButton.disabled = !ready || !baseline;
  assembleButton.disabled = !ready;
}
function setStatus(text: string, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error-status', isError);
}
function stop() { running = false; clearTimeout(timer); timer = undefined; controls(); }
function markDirty() {
  stop(); selectCustom(); dirty = true; error(); setStatus('Changes to load'); controls();
}
function load() {
  stop(); error();
  try {
    // Validate everything before replacing the currently loaded machine.
    const parsed = assemble(source.value);
    const initial = inputs.map(input => {
      if (input.value.trim() === '') throw new Error('Initial memory values cannot be blank.');
      const n = Number(input.value);
      if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error('Initial memory values must be whole bytes (0–255).');
      return n;
    });
    const memory = new Uint8Array(256);
    memory.set(initial); memory.set(parsed.bytes, 8);
    const loaded = engine('reset', memory);
    baseline = memory; program = parsed; state = loaded;
    const example = chosen;
    expected = example && source.value.trim() === example.source.trim() && initial.every((v, i) => v === example.inputs[i]) ? example.expected : undefined;
    dirty = false; fault = false;
    trace = new ExecutionTrace(state.historyLimit);
    source.scrollTop = 0;
    renderTrace();
    $('explanation').textContent = 'Ready. Step through the program or run it at your own pace.';
    $('program-size').textContent = `${parsed.bytes.length} BYTES`;
    setStatus('Ready'); render();
  } catch (err) {
    dirty = true; error(String(err instanceof Error ? err.message : err)); setStatus('Check assembly', true); controls();
  }
}
function populate() {
  stop();
  const example = examples.find(e => e.id === select.value);
  chosen = example;
  if (!example) {
    selectCustom();
    setStatus(dirty ? 'Changes to load' : fault ? 'Execution stopped' : state?.halted ? 'Halted' : state?.steps ? 'Paused' : 'Ready', fault);
    return;
  }
  source.value = example.source;
  inputs.forEach((input, i) => { input.value = String(example.inputs[i]); });
  $('example-description').textContent = example.description;
  if (ready) load();
}
function renderMemory() {
  if (!state) return;
  const pc = state.registers[0];
  const opcode = state.memory[pc];
  const op = Object.values(OPS).find(op => op.code === opcode);
  const length = op ? 1 + op.kinds.length : 1;
  const lastRead = trace.latest?.read;
  const lastWrite = trace.latest?.write;
  const rows = visibleMemoryRows({ memory: state.memory, programLength: program?.bytes.length || 0,
    pc, instructionLength: length, selected, accessed: trace.accessedMemory }, memoryExpanded);
  memoryRowLabels.forEach((label, row) => { label.hidden = !rows.has(row); });
  memoryButtons.forEach((button, address) => {
    button.hidden = !rows.has(Math.floor(address / 16));
    button.textContent = hex(state!.memory[address]!);
    const classes = ['byte'];
    if (address < 8) classes.push('data');
    else if (program && address < 8 + program.bytes.length) classes.push('code');
    if (address > pc && address < pc + length) classes.push('operand');
    if (address === lastRead) classes.push('read');
    if (address === lastWrite) classes.push('written');
    if (address === pc) classes.push('pc');
    if (address === selected) classes.push('selected');
    button.className = classes.join(' ');
    button.setAttribute('aria-label', `Address ${hex(address)}, hexadecimal ${hex(state!.memory[address]!)}, decimal ${state!.memory[address]}${address === pc ? ', program counter' : ''}`);
    button.setAttribute('aria-pressed', String(address === selected));
  });
  const toggle = $('memory-toggle');
  toggle.textContent = memoryExpanded ? 'Show compact view' : 'Show all 256 bytes';
  toggle.setAttribute('aria-expanded', String(memoryExpanded));
  const summary = `${rows.size * 16} / 256 bytes${memoryExpanded ? '' : ' · unused rows hidden'}`;
  if ($('memory-summary').textContent !== summary) $('memory-summary').textContent = summary;
  const value = state.memory[selected]!;
  $('inspector').replaceChildren();
  for (const [label, val] of [['ADDRESS', `0x${hex(selected)}`], ['HEX', hex(value)], ['DEC', value], ['BIN', value.toString(2).padStart(8, '0')]]) {
    const span = document.createElement('span'); span.append(`${label} `);
    const strong = document.createElement('b'); strong.textContent = String(val); span.append(strong); $('inspector').append(span);
  }
}
function render(previous?: State) {
  if (!state || !program) return;
  ['pc', 'r1', 'r2'].forEach((id, i) => {
    const value = state!.registers[i]!;
    $(id).textContent = hex(value);
    $(`${id}-sub`).textContent = i === 0 ? `address ${value}` : `${value} decimal`;
    $(`reg-${i}`).classList.toggle('changed', !!previous && previous.registers[i] !== value);
  });
  $('out').textContent = hex(state.memory[0]!);
  $('out-sub').textContent = `${state.memory[0]} decimal`;
  $('output-register').classList.toggle('changed', trace.latest?.write === 0);
  $('step-count').textContent = String(state.steps);
  $('execution-label').textContent = state.halted ? 'MACHINE HALTED' : 'NEXT INSTRUCTION';
  $('next-instruction').textContent = `${hex(state.registers[0])}  ${decode(state.memory, state.registers[0])}`;
  $('listing').replaceChildren();
  for (const instruction of instructionListing(program, state.memory, state.registers[0])) {
    const row = document.createElement('div');
    row.className = 'instruction' + (instruction.address === state.registers[0] ? ' current' : '');
    if (instruction.address === state.registers[0]) row.setAttribute('aria-current', 'step');
    if (instruction.outsideSource) row.title = 'Current instruction outside the assembled source';
    for (const [className, content] of [
      ['addr', hex(instruction.address)],
      ['bytes', instruction.bytes.map(hex).join(' ')],
      ['asm', instruction.text],
    ]) {
      const span = document.createElement('span'); span.className = className!; span.textContent = content!; row.append(span);
    }
    $('listing').append(row);
  }
  const listing = $('listing');
  const current = listing.querySelector<HTMLElement>('.current');
  if (current) {
    if (current.offsetTop < listing.scrollTop) listing.scrollTop = current.offsetTop;
    else if (current.offsetTop + current.offsetHeight > listing.scrollTop + listing.clientHeight) {
      listing.scrollTop = current.offsetTop + current.offsetHeight - listing.clientHeight;
    }
  }
  renderMemory(); controls();
}
function validateStep(before: State) {
  const pc = before.registers[0];
  const entry = Object.entries(OPS).find(([, op]) => op.code === before.memory[pc]);
  if (!entry) throw new Error(`Unknown opcode 0x${hex(before.memory[pc]!)} at address 0x${hex(pc)}.`);
  const op = entry[1];
  if (pc + op.kinds.length > 255) throw new Error(`Instruction at 0x${hex(pc)} straddles the end of memory.`);
  op.kinds.forEach((kind, i) => {
    const operand = before.memory[pc + 1 + i];
    if (kind === 'reg' && operand !== 1 && operand !== 2) throw new Error(`Invalid register ${operand} at address 0x${hex(pc + i + 1)}.`);
  });
}
function describe(before: State, after: State): string {
  const p = before.registers[0];
  const [op, a, b] = [before.memory[p]!, before.memory[p + 1]!, before.memory[p + 2]!];
  switch (op) {
    case 1: return `Read M[${hex(b)}] = ${before.memory[b]}; r${a} ← ${after.registers[a]}. PC ${hex(p)} → ${hex(after.registers[0])}.`;
    case 2: return `Write r${a} = ${before.registers[a]} to M[${hex(b)}]. PC ${hex(p)} → ${hex(after.registers[0])}.`;
    case 3: case 4: case 5: case 6: {
      const right = op === 3 || op === 4 ? before.registers[b] : b;
      return `r${a} ← ${before.registers[a]} ${op === 3 || op === 5 ? '+' : '−'} ${right} = ${after.registers[a]} (mod 256). PC → ${hex(after.registers[0])}.`;
    }
    case 7: return `Jump to absolute address ${a} (0x${hex(a)}).`;
    case 8: return before.registers[a] === 0
      ? `Taken: r${a} = 0. PC ← (${p} + 3 + ${b > 127 ? b - 256 : b}) mod 256 = ${after.registers[0]}.`
      : `Not taken: r${a} = ${before.registers[a]}. PC ← ${p} + 3 = ${after.registers[0]}.`;
    case 255: return `Halt. M[00] = ${after.memory[0]}.${expected === undefined ? '' : ` ${after.memory[0] === expected ? '✓ Matches' : '✗ Does not match'} expected result ${expected}.`}`;
    default: return '';
  }
}
function renderTrace() {
  const root = $('trace');
  root.replaceChildren();
  if (!trace.latest) {
    const empty = document.createElement('p');
    empty.className = 'trace-empty'; empty.textContent = 'Each step leaves a trail here.';
    root.append(empty);
    return;
  }
  for (const entry of trace.visible) {
    const row = document.createElement('div'); row.className = 'trace-entry';
    for (const [tag, content, className] of [
      ['span', String(entry.step).padStart(2, '0'), ''],
      ['span', hex(entry.pc), ''], ['code', entry.instruction, ''], ['span', entry.changes, 'diff'],
    ]) {
      const element = document.createElement(tag!);
      element.textContent = content!; element.className = className!; row.append(element);
    }
    row.title = entry.description; root.append(row);
  }
}
function stepBack() {
  if (!ready || !state || dirty || state.historyDepth === 0) return;
  stop();
  const before = state;
  try {
    state = engine('back');
    trace.back();
    fault = false; error();
    $('explanation').textContent = trace.latest?.description || 'Ready. Rewound to the initial machine state.';
    setStatus(state.steps ? 'Paused' : 'Ready');
    renderTrace(); render(before); scrollToState();
  } catch (err) {
    fault = true; error(err instanceof Error ? err.message : String(err), true);
    setStatus('Execution stopped', true); controls(); scrollToState(true);
  }
}
function step() {
  if (!state || state.halted || dirty || fault) return;
  const before = state;
  try {
    validateStep(before);
    state = engine('step');
    const pc = before.registers[0];
    const read = before.memory[pc] === 1 ? before.memory[pc + 2] : undefined;
    const write = before.memory[pc] === 2 ? before.memory[pc + 2] : undefined;
    const description = describe(before, state);
    $('explanation').textContent = description;
    const differences: string[] = [];
    for (const i of [1, 2]) if (before.registers[i] !== state.registers[i]) differences.push(`r${i}: ${before.registers[i]} → ${state.registers[i]}`);
    if (write !== undefined) differences.push(`M[${hex(write)}]: ${before.memory[write]} → ${state.memory[write]}`);
    if (before.memory[pc] === 255) differences.push(`halt · output ${state.memory[0]}`);
    if (!differences.length) differences.push(`PC → ${hex(state.registers[0])}`);
    trace.push({ step: state.steps, pc, instruction: decode(before.memory, pc),
      changes: differences.join(' · '), description, read, write });
    renderTrace();
    if (state.halted) {
      stop();
      const passed = expected === undefined || state.memory[0] === expected;
      setStatus(expected === undefined ? 'Halted' : passed ? 'Halted · passed' : 'Halted · mismatch', !passed);
    } else setStatus(running ? 'Running' : 'Paused');
    render(before);
  } catch (err) {
    stop(); fault = true;
    error(err instanceof Error ? err.message : String(err), true);
    setStatus('Execution stopped', true); controls();
    scrollToState(true);
  }
}
function tick() {
  if (!running || !state) return;
  step();
  if (!running) return;
  if (state.steps - runStart >= 10000) {
    stop(); setStatus('Paused · 10,000 steps');
    $('explanation').textContent = 'Paused after 10,000 steps. Check for an infinite loop, or press Run to continue.';
    return;
  }
  timer = setTimeout(tick, 1000 / Number($<HTMLInputElement>('speed').value));
}
function scrollToState(showFault = false) {
  if (!matchMedia('(max-width: 1150px)').matches || (fault && !showFault)) return;
  const panel = document.querySelector<HTMLElement>('.machine-panel')!;
  const toolbar = document.querySelector<HTMLElement>('.toolbar')!;
  const top = panel.getBoundingClientRect().top;
  const offset = toolbar.getBoundingClientRect().height + 16;
  // Keep the state near the controls, rather than barely visible at the bottom.
  if (top >= offset - 1 && top <= offset + 48) return;
  window.scrollTo({
    top: window.scrollY + top - offset,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}
select.addEventListener('change', populate);
$('memory-toggle').addEventListener('click', () => { memoryExpanded = !memoryExpanded; renderMemory(); });
source.addEventListener('input', markDirty);
inputs.forEach(input => input.addEventListener('input', markDirty));
assembleButton.addEventListener('click', load);
stepButton.addEventListener('click', () => { step(); scrollToState(); });
backButton.addEventListener('click', stepBack);
runButton.addEventListener('click', () => {
  if (running) { stop(); setStatus('Paused'); }
  else { running = true; runStart = state?.steps || 0; setStatus('Running'); controls(); tick(); scrollToState(); }
});
resetButton.addEventListener('click', () => {
  if (!baseline) return;
  // Reset uses the loaded image; unassembled edits stay in the editor.
  stop(); state = engine('reset', baseline); fault = false;
  trace = new ExecutionTrace(state.historyLimit);
  error(); renderTrace(); $('explanation').textContent = dirty ? 'Loaded program reset. Assemble to apply your editor changes.' : 'Reset to the loaded program and initial memory.';
  setStatus(dirty ? 'Changes to load' : 'Ready'); render();
});
$<HTMLInputElement>('speed').addEventListener('input', event => { $('speed-value').textContent = `${(event.target as HTMLInputElement).value} steps/s`; });
window.addEventListener('pagehide', stop);
populate();
async function boot() {
  try {
    const go = new window.Go();
    const response = await fetch('./vm.wasm');
    if (!response.ok) throw new Error(`Could not load vm.wasm (${response.status})`);
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
    void go.run(instance).catch(err => { stop(); ready = false; error(`Go engine stopped: ${err}`); setStatus('Engine unavailable', true); controls(); });
    ready = true; load();
  } catch (err) { error(`Could not start the Go engine: ${err}`); setStatus('Engine unavailable', true); }
}
void boot();
