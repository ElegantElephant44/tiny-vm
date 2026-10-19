//go:build js && wasm

package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"

	"vm"
)

var machine *vm.Debugger

// JSON keeps the Go/browser boundary explicit and avoids shared mutable views.
func call(_ js.Value, args []js.Value) (result any) {
	defer func() {
		if err := recover(); err != nil {
			data, _ := json.Marshal(map[string]any{"error": fmt.Sprint(err)})
			result = string(data)
		}
	}()
	switch args[0].String() {
	case "reset":
		input := args[1]
		if input.Length() != 256 {
			panic("expected exactly 256 memory bytes")
		}
		memory := make([]byte, 256)
		js.CopyBytesToGo(memory, input)
		machine = vm.NewDebugger(memory)
	case "step":
		if machine == nil {
			panic("load a program first")
		}
		machine.Step()
	case "back":
		if machine == nil {
			panic("load a program first")
		}
		machine.Back()
	default:
		panic("unknown VM command")
	}
	// Convert bytes to integers so JSON contains arrays rather than base64.
	memory := make([]int, 256)
	for i, b := range machine.Memory {
		memory[i] = int(b)
	}
	data, _ := json.Marshal(map[string]any{
		"memory": memory, "registers": machine.Registers,
		"halted": machine.Halted, "steps": machine.Steps,
		"historyDepth": machine.HistoryDepth(), "historyLimit": vm.HistoryLimit,
	})
	return string(data)
}

func main() {
	js.Global().Set("vmCall", js.FuncOf(call))
	select {}
}
