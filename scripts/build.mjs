import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
process.chdir(root);
mkdirSync('dist', { recursive: true });
const localTsc = join(root, 'node_modules/typescript/bin/tsc');
if (existsSync(localTsc)) execFileSync(process.execPath, [localTsc, '-p', '.'], { stdio: 'inherit' });
else execFileSync('tsc', ['-p', '.'], { stdio: 'inherit' });
const goroot = execFileSync('go', ['env', 'GOROOT'], { encoding: 'utf8' }).trim();
execFileSync('go', ['build', '-o', resolve('dist/vm.wasm'), './cmd/wasm'], {
  cwd: resolve('go'), env: { ...process.env, GOOS: 'js', GOARCH: 'wasm' }, stdio: 'inherit'
});
copyFileSync(join(goroot, 'lib/wasm/wasm_exec.js'), 'dist/wasm_exec.js');
for (const file of ['index.html', 'style.css']) copyFileSync(file, `dist/${file}`);
console.log('Built TypeScript UI and Go WebAssembly → dist/');
