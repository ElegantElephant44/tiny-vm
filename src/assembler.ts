export const OPS = {
  load: { code: 1, kinds: ['reg', 'byte'] },
  store: { code: 2, kinds: ['reg', 'byte'] },
  add: { code: 3, kinds: ['reg', 'reg'] },
  sub: { code: 4, kinds: ['reg', 'reg'] },
  addi: { code: 5, kinds: ['reg', 'byte'] },
  subi: { code: 6, kinds: ['reg', 'byte'] },
  jump: { code: 7, kinds: ['byte'] },
  beqz: { code: 8, kinds: ['reg', 'offset'] },
  halt: { code: 255, kinds: [] },
} as const;
export interface Instruction { address: number; bytes: number[]; text: string; line: number }
export interface Program { bytes: number[]; instructions: Instruction[] }
export const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
export function assemble(source: string): Program {
  const bytes: number[] = [];
  const instructions: Instruction[] = [];
  for (const [index, raw] of source.split('\n').entries()) {
    const text = raw.replace(/;.*/, '').trim();
    if (!text) continue;
    const [mnemonic, ...args] = text.toLowerCase().replaceAll(',', ' ').split(/\s+/);
    const fail = (message: string): never => { throw new Error(`Line ${index + 1}: ${message}`); };
    if (!Object.hasOwn(OPS, mnemonic!)) fail(`unknown instruction “${mnemonic}”`);
    const op = OPS[mnemonic as keyof typeof OPS];
    if (args.length !== op.kinds.length) fail(`${mnemonic} expects ${op.kinds.length} operand(s)`);
    const operands = op.kinds.map((kind, i) => {
      const token = args[i]!;
      if (kind === 'reg') {
        if (!/^r[12]$/.test(token)) fail('register must be r1 or r2');
        return Number(token.slice(1));
      }
      if (!/^(?:-?\d+|0x[\da-f]+)$/.test(token)) fail(`invalid number “${token}”`);
      const n = Number(token);
      // Raw bytes 128–255 are also accepted as two's-complement offsets.
      if (!Number.isInteger(n) || n < (kind === 'offset' ? -128 : 0) || n > 255) fail(`${kind === 'offset' ? 'offset must be -128–127 or a raw byte 0–255' : 'value must be 0–255'}`);
      return n & 255;
    });
    const encoded = [op.code, ...operands];
    if (bytes.length + encoded.length > 248) fail('program exceeds the 248-byte instruction area');
    instructions.push({ address: 8 + bytes.length, bytes: encoded, text, line: index + 1 });
    bytes.push(...encoded);
  }
  if (!bytes.length) throw new Error('Enter at least one instruction.');
  return { bytes, instructions };
}
export function decode(memory: number[], pc: number): string {
  const a = memory[(pc + 1) & 255]!;
  const b = memory[(pc + 2) & 255]!;
  const name = Object.entries(OPS).find(([, op]) => op.code === memory[pc])?.[0];
  switch (name) {
    case 'halt': return 'halt';
    case 'jump': return `jump ${a}`;
    case 'beqz': return `beqz r${a} ${b > 127 ? b - 256 : b}`;
    case 'add': case 'sub': return `${name} r${a} r${b}`;
    case undefined: return `unknown 0x${hex(memory[pc]!)}`;
    default: return `${name} r${a} ${b}`;
  }
}
