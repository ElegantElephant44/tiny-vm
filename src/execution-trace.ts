export const TRACE_LIMIT = 100;

export interface TraceEntry {
  step: number;
  pc: number;
  instruction: string;
  changes: string;
  description: string;
  read?: number;
  write?: number;
}

interface RecordedEntry extends TraceEntry { newAccesses: number[] }

// Only presentation metadata lives here. Machine snapshots stay in Go.
export class ExecutionTrace {
  private entries: RecordedEntry[] = [];
  readonly accessedMemory = new Set<number>();

  constructor(private readonly historyLimit: number) {}

  get latest(): TraceEntry | undefined { return this.entries.at(-1); }
  get visible(): TraceEntry[] { return this.entries.slice(-TRACE_LIMIT).reverse(); }

  push(entry: TraceEntry) {
    const newAccesses: number[] = [];
    for (const address of [entry.read, entry.write]) {
      if (address !== undefined && !this.accessedMemory.has(address)) {
        this.accessedMemory.add(address);
        newAccesses.push(address);
      }
    }
    this.entries.push({ ...entry, newAccesses });
    // Retain the trace preceding the oldest reversible state, too.
    if (this.entries.length > this.historyLimit + TRACE_LIMIT) this.entries.shift();
  }

  back() {
    const entry = this.entries.pop();
    if (!entry) return;
    for (const address of entry.newAccesses) this.accessedMemory.delete(address);
  }
}
