export interface Example { id: string; name: string; description: string; source: string; inputs: [number, number, number]; expected: number }
const arithmetic = (op: string) => `load r1 1\nload r2 2\n${op} r1 r2\nstore r1 0\nhalt`;
const sum = 'load r1 1\nbeqz r1 8\nadd r2 r1\nsubi r1 1\njump 11\nstore r2 0\nhalt';
export const examples: Example[] = [
  { id: 'add', name: 'Addition · 3 + 5', description: 'Load two inputs, add their register values, and store the result.', source: arithmetic('add'), inputs: [0, 3, 5], expected: 8 },
  { id: 'overflow', name: 'Overflow · 200 + 100', description: 'Eight-bit arithmetic wraps modulo 256: 300 becomes 44.', source: arithmetic('add'), inputs: [0, 200, 100], expected: 44 },
  { id: 'subtract', name: 'Subtraction · 9 − 4', description: 'The first register is the destination: r1 ← r1 − r2.', source: arithmetic('sub'), inputs: [0, 9, 4], expected: 5 },
  { id: 'underflow', name: 'Underflow · 3 − 5', description: 'Negative results wrap too: −2 becomes 254.', source: arithmetic('sub'), inputs: [0, 3, 5], expected: 254 },
  { id: 'same', name: 'Same register · r1 − r1', description: 'A register may be both operands. Subtracting it from itself gives zero.', source: 'load r1 1\nsub r1 r1\nstore r1 0\nhalt', inputs: [0, 42, 0], expected: 0 },
  { id: 'halt', name: 'Halt · preserve 42', description: 'Halt returns immediately; it does not overwrite the output cell.', source: 'halt', inputs: [42, 0, 0], expected: 42 },
  { id: 'byte', name: 'Data versus opcode · 255', description: 'FF is only halt when fetched as an opcode. Input data can also be 255.', source: 'load r1 1\nstore r1 0\nhalt', inputs: [0, 255, 0], expected: 255 },
  { id: 'register', name: 'Register arithmetic', description: 'Change r2 before adding it, demonstrating that arithmetic reads registers.', source: 'load r1 1\nload r2 2\nsub r2 r1\nadd r1 r2\nstore r1 0\nhalt', inputs: [0, 3, 5], expected: 5 },
  { id: 'immediate', name: 'Immediate values · +3, +5', description: 'Add values encoded directly in the instructions.', source: 'load r1 1\naddi r1 3\naddi r1 5\nstore r1 0\nhalt', inputs: [0, 20, 0], expected: 28 },
  { id: 'jump', name: 'Jump · skip a store', description: 'An absolute jump goes straight to address 16, where halt lives.', source: 'load r1 1\njump 16\nstore r1 0\nhalt', inputs: [0, 42, 0], expected: 0 },
  { id: 'branch', name: 'Branch · taken', description: 'When r2 is zero, skip the next three bytes, relative to the next instruction.', source: 'load r1 1\nload r2 2\nbeqz r2 3\nstore r1 0\nhalt', inputs: [0, 42, 0], expected: 0 },
  { id: 'fallthrough', name: 'Branch · not taken', description: 'A nonzero r2 falls through to the store.', source: 'load r1 1\nload r2 2\nbeqz r2 3\nstore r1 0\nhalt', inputs: [0, 42, 1], expected: 42 },
  { id: 'sum', name: 'Loop · sum 1 through 5', description: 'r1 counts down while r2 accumulates: 5 + 4 + 3 + 2 + 1 = 15.', source: sum, inputs: [0, 5, 0], expected: 15 },
  { id: 'sumwrap', name: 'Loop · sum 1 through 23', description: 'The accumulator wraps: 276 modulo 256 = 20.', source: sum, inputs: [0, 23, 0], expected: 20 },
  { id: 'backward', name: 'Branch · negative offset', description: 'At address 17, beqz r2 −9 returns to address 11 until r1 reaches zero.', source: 'load r1 1\nsubi r1 1\nbeqz r1 6\nbeqz r2 -9\nstore r1 0\nhalt', inputs: [0, 3, 0], expected: 0 },
];
