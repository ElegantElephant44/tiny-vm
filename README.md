# Tiny VM visualizer

A TypeScript interface to the course's Go VM, compiled to WebAssembly. The browser calls the **same `Machine.Step()`** used by `compute`; there is no second interpreter in JavaScript.

## Run locally

Requires Go 1.26.1 or newer and Node.js 22 or newer.

```sh
cd tiny-vm
npm install
npm run dev
```

Open http://127.0.0.1:4173. To use another port: `PORT=4174 npm run dev`.

The build invokes TypeScript, builds `go/cmd/wasm` with `GOOS=js GOARCH=wasm`, and copies the matching Go `wasm_exec.js`. Build output goes into ignored `dist/`. No bundler or backend service is needed. The local server binds only to loopback. Rebuild and reload after source changes.

## Explore

- Choose one of 15 examples to populate the editor and initial data, or write your own assembly.
- Editing assembly or initial inputs switches the picker to **Custom program**. Choosing Custom program manually preserves your current code and inputs.
- **Assemble & load** applies editor and initial-memory changes. The assembler accepts decimal or `0x` hexadecimal numbers, commas, blank lines, and `;` comments. Branch offsets accept signed decimal values or raw bytes.
- **Step** executes exactly one instruction. **Run** animates execution at 1–12 instructions per second; **Pause** stops between instructions.
- **Back** pauses animation and restores the previous machine state, including registers, memory, PC, halt status, trace, and memory-access highlights. It can undo stores (including writes to code) and halt. The Go debugger keeps the latest 1,000 successful instructions; stepping forward after Back executes normally from the restored state.
- The display shows PC, r1, r2, output, all 256 memory bytes, the assembled listing, and the latest 100 trace entries. Memory and register values are hexadecimal, with decimal values beneath registers. Click a memory byte to inspect decimal, hex, and binary values.
- Memory starts compact: data, program, PC, selected, nonzero, and previously accessed rows stay visible. **Show all 256 bytes** expands the grid; **Show compact view** collapses it again without resetting execution.
- Inverse video marks the next opcode and changed registers. Gray marks operands; dashed borders mark the last data read; an underlined border marks the last memory write. Halt leaves the PC at the halt opcode.
- **Reset** restores the last loaded memory image and register state, preserving any unassembled editor changes. Choose an example again to restore its source and inputs.
- **Reset** and **Assemble & load** clear undo history. Back is disabled when history is empty or editor/input changes have not been loaded. After an execution error, Back undoes the last successful instruction and clears the error.
- A matching unedited example reports whether the halted output matches its expected result. Custom programs simply show their output.
- The instruction listing reads live memory and includes the current PC even when execution moves outside the original source.
- Invalid instructions stop execution with an error displayed inside machine state. Animated runs pause after 10,000 instructions; Run continues from there.

## Validate

```sh
npm test
cd go
STRETCH=true go test ./...
```

The Node tests execute the compiled Go WASM engine against every example and additionally check negative offsets, PC wraparound, halt behavior, and assembler errors.

## Files

- `src/main.ts`: browser controls, state rendering, animation, and trace.
- `src/assembler.ts`: assembler and instruction decoding for display.
- `src/listing.ts`: live instruction listing, including execution outside the source program.
- `src/execution-trace.ts`: bounded trace entries and reversible memory-access bookkeeping; machine snapshots remain in Go.
- `src/examples.ts`: editable example programs and expected outputs.
- `go/vm.go`: shared Go engine (`Machine`, `NewMachine`, `Step`) and the original `compute` entry point.
- `go/debugger.go`: bounded snapshots and Step Back around `Machine`. The original `compute` does not record history.
- `go/cmd/wasm/main.go`: browser bridge, restricted to the `js/wasm` build target.

## GitHub Pages

The [hosted visualizer](https://elegantelephant44.github.io/tiny-vm/) is deployed by `.github/workflows/pages.yml` on pushes to `main`. The workflow installs Node and Go, runs the tests, builds the WebAssembly and TypeScript, and publishes only `dist/`.

In the repository's **Settings → Pages**, the source must be **GitHub Actions**. You can also redeploy from the workflow's **Run workflow** button. All asset paths are relative, so the site works under the `/tiny-vm/` project path.

The generated `dist/` folder can also be served by another static host. VM execution and assembly stay in the browser. The UI optionally loads Google Fonts; system fonts are used when unavailable.
