package vm

// HistoryLimit bounds debugger memory independently of how long a program runs.
const HistoryLimit = 1000

type snapshot struct {
	memory    [256]byte
	registers [3]byte
	halted    bool
	steps     int
}

// Debugger adds bounded undo to the interpreter. compute uses Machine directly
// and keeps its constant-space behavior without recording history.
type Debugger struct {
	*Machine
	history []snapshot
	next    int
	depth   int
}

func NewDebugger(memory []byte) *Debugger {
	if len(memory) != 256 {
		panic("debugger expects exactly 256 memory bytes")
	}
	return &Debugger{Machine: NewMachine(memory)}
}

func (d *Debugger) HistoryDepth() int { return d.depth }

// Step records only successful instructions, including halt. A halted step is
// a no-op; an instruction that panics does not consume an undo slot.
func (d *Debugger) Step() {
	if d.Halted {
		return
	}
	before := snapshot{registers: d.Registers, halted: d.Halted, steps: d.Steps}
	copy(before.memory[:], d.Memory)
	d.Machine.Step()
	if d.history == nil {
		d.history = make([]snapshot, HistoryLimit)
	}
	d.history[d.next] = before
	d.next = (d.next + 1) % HistoryLimit
	if d.depth < HistoryLimit {
		d.depth++
	}
}

// Back restores memory in place so the caller's slice remains the same object.
func (d *Debugger) Back() bool {
	if d.depth == 0 {
		return false
	}
	d.next = (d.next + HistoryLimit - 1) % HistoryLimit
	before := d.history[d.next]
	copy(d.Memory, before.memory[:])
	d.Registers, d.Halted, d.Steps = before.registers, before.halted, before.steps
	d.depth--
	return true
}
