package vm

import (
	"fmt"
	"testing"
)

func debuggerState(d *Debugger) snapshot {
	s := snapshot{registers: d.Registers, halted: d.Halted, steps: d.Steps}
	copy(s.memory[:], d.Memory)
	return s
}

func TestDebuggerRoundTrip(t *testing.T) {
	for _, program := range append(append([]vmTest{}, mainTests...), stretchGoalTests...) {
		for _, input := range program.cases {
			t.Run(fmt.Sprintf("%s/%d/%d", program.name, input.x, input.y), func(t *testing.T) {
				memory := make([]byte, 256)
				memory[1], memory[2] = input.x, input.y
				copy(memory[8:], assemble(program.asm))
				d := NewDebugger(memory)
				if d.Back() || d.HistoryDepth() != 0 {
					t.Fatal("new debugger must have no undo history")
				}
				var states []snapshot
				for !d.Halted && len(states) < HistoryLimit {
					states = append(states, debuggerState(d))
					d.Step()
				}
				if !d.Halted || memory[0] != input.out {
					t.Fatalf("forward execution: halted=%v output=%d want=%d", d.Halted, memory[0], input.out)
				}
				halted := debuggerState(d)
				d.Step()
				if debuggerState(d) != halted || d.HistoryDepth() != len(states) {
					t.Fatal("stepping halt changed state or added history")
				}
				for i := len(states) - 1; i >= 0; i-- {
					if !d.Back() || debuggerState(d) != states[i] || d.HistoryDepth() != i {
						t.Fatalf("undo did not restore state before instruction %d", i+1)
					}
					if &d.Memory[0] != &memory[0] {
						t.Fatal("undo replaced the caller's memory slice")
					}
				}
				if d.Back() {
					t.Fatal("undo must stop at initial state")
				}
				// Forward execution after rewind must replay the same program.
				for !d.Halted {
					d.Step()
				}
				if debuggerState(d) != halted {
					t.Fatal("replaying after rewind changed the result")
				}
			})
		}
	}
}

func TestDebuggerRestoresSelfModifiedCode(t *testing.T) {
	memory := make([]byte, 256)
	memory[1] = Halt
	copy(memory[8:], assemble("load r1 1\nstore r1 14\naddi r1 1\nhalt"))
	d := NewDebugger(memory)
	d.Step()
	beforeStore := debuggerState(d)
	d.Step()
	if memory[14] != Halt {
		t.Fatal("store did not overwrite instruction")
	}
	d.Step()
	if !d.Halted {
		t.Fatal("modified instruction did not halt")
	}
	d.Back()
	d.Back()
	if debuggerState(d) != beforeStore || memory[14] != Addi {
		t.Fatal("undo did not restore original instruction bytes")
	}
}

func TestDebuggerHistoryLimit(t *testing.T) {
	memory := make([]byte, 256)
	copy(memory[8:], assemble("addi r1 1\njump 8"))
	d := NewDebugger(memory)
	var oldest snapshot
	for i := 0; i < HistoryLimit+25; i++ {
		if i == 25 {
			oldest = debuggerState(d)
		}
		d.Step()
	}
	if d.HistoryDepth() != HistoryLimit {
		t.Fatal("history exceeded its bound")
	}
	for i := 0; i < HistoryLimit; i++ {
		if !d.Back() {
			t.Fatalf("undo stopped early at %d", i)
		}
	}
	if d.Back() || debuggerState(d) != oldest {
		t.Fatal("undo must stop at the oldest retained state")
	}
	d.Step()
	if !d.Back() || debuggerState(d) != oldest {
		t.Fatal("history ring did not support stepping after rewind")
	}
}

func TestDebuggerFailedStepPreservesHistory(t *testing.T) {
	memory := make([]byte, 256)
	copy(memory[8:], assemble("jump 8"))
	d := NewDebugger(memory)
	for i := 0; i < HistoryLimit; i++ {
		d.Step()
	}
	memory[8] = 0
	before := debuggerState(d)
	func() {
		defer func() {
			if recover() == nil {
				t.Fatal("expected invalid opcode to panic")
			}
		}()
		d.Step()
	}()
	if debuggerState(d) != before || d.HistoryDepth() != HistoryLimit {
		t.Fatal("failed step changed machine state or history")
	}
	if !d.Back() || memory[8] != Jump || d.Steps != HistoryLimit-1 {
		t.Fatal("failed step overwrote a valid undo snapshot")
	}
}
