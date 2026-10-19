package vm

import (
	"fmt"
)

const (
	Load  = 0x01
	Store = 0x02
	Add   = 0x03
	Sub   = 0x04
	Halt  = 0xff
)

// Stretch goals
const (
	Addi = 0x05
	Subi = 0x06
	Jump = 0x07
	Beqz = 0x08
)

// compute runs the stored program in `memory` to completion, mutating it
// in place. The result of the program is left at memory[0].
//
// Memory layout (256 bytes):
//
//		00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f ... ff
//		__ __ __ __ __ __ __ __ __ __ __ __ __ __ __ __ ... __
//		XX ^==OTHER DATA======^ ^==INSTRUCTIONS=============^
//
//	  - memory[0]    : the output cell (your VM writes its result here)
//	  - memory[1..7] : input data and scratch
//	  - memory[8..]  : program instructions
func compute(memory []byte) {
	m := NewMachine(memory)
	for !m.Halted {
		m.Step()
	}
}

// Machine exposes the same interpreter one instruction at a time for the visualizer.
// Memory is the caller's slice; instructions mutate it in place.
type Machine struct {
	Memory    []byte
	Registers [3]byte
	Halted    bool
	Steps     int
}

func NewMachine(memory []byte) *Machine {
	return &Machine{Memory: memory, Registers: [3]byte{8, 0, 0}}
}

// Step executes one instruction. Stepping a halted machine is a no-op.
func (m *Machine) Step() {
	if m.Halted {
		return
	}
	opcode := m.Memory[m.Registers[0]]
	switch opcode {
	case Halt:
		m.Halted = true
	case Load:
		r := m.Memory[m.Registers[0]+1]
		a := m.Memory[m.Registers[0]+2]
		m.Registers[r] = m.Memory[a]
		m.Registers[0] += 3
	case Store:
		r := m.Memory[m.Registers[0]+1]
		a := m.Memory[m.Registers[0]+2]
		m.Memory[a] = m.Registers[r]
		m.Registers[0] += 3
	case Add:
		dst := m.Memory[m.Registers[0]+1]
		src := m.Memory[m.Registers[0]+2]
		m.Registers[dst] = m.Registers[dst] + m.Registers[src]
		m.Registers[0] += 3
	case Sub:
		dst := m.Memory[m.Registers[0]+1]
		src := m.Memory[m.Registers[0]+2]
		m.Registers[dst] = m.Registers[dst] - m.Registers[src]
		m.Registers[0] += 3
	case Addi:
		r := m.Memory[m.Registers[0]+1]
		imm := m.Memory[m.Registers[0]+2]
		m.Registers[r] = m.Registers[r] + imm
		m.Registers[0] += 3
	case Subi:
		r := m.Memory[m.Registers[0]+1]
		imm := m.Memory[m.Registers[0]+2]
		m.Registers[r] = m.Registers[r] - imm
		m.Registers[0] += 3
	case Jump:
		addr := m.Memory[m.Registers[0]+1]
		m.Registers[0] = addr
	case Beqz:
		r := m.Memory[m.Registers[0]+1]
		off := m.Memory[m.Registers[0]+2]
		if m.Registers[r] == 0 {
			m.Registers[0] += 3 + off
		} else {
			m.Registers[0] += 3
		}
	default:
		panic(fmt.Sprintf("unimplemented opcode: 0x%02x", opcode))
	}
	m.Steps++
}
