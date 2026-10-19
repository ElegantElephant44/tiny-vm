export interface MemoryView {
  memory: number[];
  programLength: number;
  pc: number;
  instructionLength: number;
  selected: number;
  accessed: Iterable<number>;
}

// Keep whole hex rows, including zero-valued cells that the program has accessed.
export function visibleMemoryRows(view: MemoryView, expanded: boolean): Set<number> {
  if (expanded) return new Set(Array.from({ length: 16 }, (_, row) => row));
  const rows = new Set<number>([0]);
  const include = (address: number) => {
    if (address >= 0 && address < 256) rows.add(Math.floor(address / 16));
  };
  for (let address = 8; address < 8 + view.programLength; address++) include(address);
  view.memory.forEach((value, address) => { if (value !== 0) include(address); });
  for (let i = 0; i < view.instructionLength; i++) include(view.pc + i);
  include(view.selected);
  for (const address of view.accessed) include(address);
  return rows;
}
