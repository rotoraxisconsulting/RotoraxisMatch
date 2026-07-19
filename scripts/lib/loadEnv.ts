import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader for standalone scripts run via plain `node` — `expo`
// auto-loads .env itself, but these scripts are compiled with tsc and run
// directly with node (see package.json), so they need to do it themselves.
// Never overwrites a variable already present in the environment (so CI
// secrets / shell exports always win over the .env file).
//
// Path note: the npm scripts compile with `--outDir .tmp-<script-name>`
// (never in place). tsc infers its rootDir from the common ancestor of every
// .ts file actually reachable from the entry point — which is `scripts/` for
// a script that only imports other scripts/ files, but the repo root for one
// that also imports from src/ — so this file's compiled depth under
// .tmp-<script-name>/ is NOT constant across scripts. A fixed count of '..'
// broke the very first time a script with a different import graph used it.
// Walking up to the nearest package.json is robust to that.
export function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not locate repo root (package.json) above ${startDir}`);
    dir = parent;
  }
  return dir;
}

export function loadEnvFile(fileName = '.env'): void {
  const filePath = path.join(findRepoRoot(__dirname), fileName);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) value = value.slice(1, -1);

    if (process.env[key] === undefined) process.env[key] = value;
  }
}
