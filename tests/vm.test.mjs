import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { assemble } from '../dist/assembler.js';
import { examples } from '../dist/examples.js';
import { instructionListing } from '../dist/listing.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
await import('../dist/wasm_exec.js');
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(await readFile(new URL('../dist/vm.wasm', import.meta.url)), go.importObject);
void go.run(instance);
const call = (command, memory) => {
  const result = JSON.parse(globalThis.vmCall(command, memory));
  assert.equal(result.error, undefined);
  return result;
};
for (const example of examples) {
  test(`Go WASM: ${example.name}`, () => {
    const program = assemble(example.source);
    const memory = new Uint8Array(256);
    memory.set(example.inputs); memory.set(program.bytes, 8);
    let state = call('reset', memory);
    assert.deepEqual(state.registers, [8, 0, 0]);
    let steps = 0;
    while (!state.halted && steps++ < 1000) state = call('step');
    assert.ok(state.halted, 'program must halt within 1000 instructions');
    assert.equal(state.memory[0], example.expected);
    assert.deepEqual(call('step'), state, 'halted step must be a no-op');
  });
}
test('Go WASM: taken negative branch and PC wraparound', () => {
  const memory = new Uint8Array(256);
  memory.set([7, 32], 8); // jump 32
  memory.set([8, 1, 250], 32); // beqz r1 -6 → 29
  memory[29] = 255;
  call('reset', memory); call('step');
  assert.equal(call('step').registers[0], 29);
  assert.equal(call('step').halted, true);
  // PC + instruction length wraps to 0 after a valid instruction at 253.
  memory.set([7, 253], 8);
  memory.set([5, 1, 1], 253);
  memory[0] = 255;
  call('reset', memory); call('step');
  const wrapped = call('step');
  assert.deepEqual(wrapped.registers, [0, 1, 0]);
  assert.equal(call('step').halted, true);
});
test('assembler: strict operands, capacity and signed offsets', () => {
  assert.deepEqual(assemble('beqz r1 -6').bytes, [8, 1, 250]);
  assert.deepEqual(assemble('load r1, 0xFF ; data\n\nhalt').bytes, [1, 1, 255, 255]);
  for (const source of ['load r0 1', 'load r1 256', 'beqz r1 -129', 'add r1', 'jump 1.2', 'wat', '']) {
    assert.throws(() => assemble(source));
  }
  assert.throws(() => assemble('halt\n'.repeat(249)), /exceeds/);
});

test('assembler: inherited property names are unknown instructions', () => {
  for (const mnemonic of ['constructor', '__proto__', 'hasOwnProperty']) {
    assert.throws(() => assemble(`; comment\n${mnemonic}`), {
      message: `Line 2: unknown instruction “${mnemonic.toLowerCase()}”`,
    });
  }
});

test('listing: include a live PC in data memory before and after halt', () => {
  const program = assemble('jump 1\nhalt');
  const memory = new Uint8Array(256);
  memory[1] = 255;
  memory.set(program.bytes, 8);
  call('reset', memory);
  for (const state of [call('step'), call('step')]) {
    const rows = instructionListing(program, state.memory, state.registers[0]);
    assert.deepEqual(rows.map(row => row.address), [1, 8, 10]);
    assert.deepEqual(rows[0], { address: 1, bytes: [255], text: 'halt', outsideSource: true });
  }
});

test('listing: show instructions written outside the original program', () => {
  const program = assemble('load r1 1\nstore r1 100\njump 100\nhalt');
  const memory = new Uint8Array(256);
  memory[1] = 255;
  memory.set(program.bytes, 8);
  call('reset', memory); call('step'); call('step');
  const state = call('step');
  const rows = instructionListing(program, state.memory, state.registers[0]);
  assert.deepEqual(rows.find(row => row.address === 100), {
    address: 100, bytes: [255], text: 'halt', outsideSource: true,
  });
  assert.equal(call('step').halted, true);
});

test('listing: decode changed instruction lengths and malformed end-of-memory bytes', () => {
  const program = assemble('load r1 1\nhalt');
  const memory = new Array(256).fill(0);
  memory[8] = 255;
  assert.deepEqual(instructionListing(program, memory, 8)[0].bytes, [255]);
  memory[8] = 5;
  memory[9] = 2;
  memory[10] = 7;
  const row = instructionListing(program, memory, 8)[0];
  assert.deepEqual(row.bytes, [5, 2, 7]);
  assert.equal(row.text, 'addi r2 7');
  assert.equal(instructionListing(program, memory, 255).at(-1).text, 'unknown 0x00');
  memory[255] = 1;
  assert.deepEqual(instructionListing(program, memory, 255).at(-1).bytes, [1]);
});
