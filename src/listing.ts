import { decode, OPS, type Program } from './assembler.js';

export interface ListingRow {
  address: number;
  bytes: number[];
  text: string;
  outsideSource: boolean;
}

// The source provides useful landmarks, but the PC and bytes come from live memory.
export function instructionListing(program: Program, memory: number[], pc: number): ListingRow[] {
  const sourceAddresses = new Set(program.instructions.map(instruction => instruction.address));
  const addresses = new Set([...sourceAddresses, pc]);
  return [...addresses].sort((a, b) => a - b).map(address => {
    const op = Object.values(OPS).find(op => op.code === memory[address]);
    const length = op ? op.kinds.length + 1 : 1;
    return {
      address,
      bytes: memory.slice(address, Math.min(256, address + length)),
      text: decode(memory, address),
      outsideSource: !sourceAddresses.has(address),
    };
  });
}
