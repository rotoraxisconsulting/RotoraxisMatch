import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader for standalone scripts run via plain `node` — `expo`
// auto-loads .env itself, but these scripts are compiled with tsc and run
// directly with node (see package.json), so they need to do it themselves.
// Never overwrites a variable already present in the environment (so CI
// secrets / shell exports always win over the .env file).
//
// Path note: the npm scripts compile with `--outDir .tmp-<script-name>`
// (never in place), so at runtime this file lives at
// <repo>/.tmp-<script-name>/scripts/lib/loadEnv.js — three levels below the
// repo root (lib -> scripts -> .tmp-<script-name> -> repo root), not two.
export function loadEnvFile(fileName = '.env'): void {
  const filePath = path.join(__dirname, '..', '..', '..', fileName);
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
