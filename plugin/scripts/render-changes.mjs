#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { renderChanges } from './lib/changes.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';

const [out, nameArg] = process.argv.slice(2);
if (!out) {
  console.error('usage: render-changes.mjs <output-dir> [<YYYY-MM-DD-commit7>]');
  process.exit(2);
}
assertOutputOutsideTarget(out);
const dir = path.join(out, '_data', 'changes');
const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : [];
const name = nameArg ?? names.at(-1);
if (!name || !names.includes(name)) {
  console.error(nameArg ? `no change log ${nameArg} in ${dir}` : `no change log in ${dir}: run diff-facts.mjs first`);
  process.exit(2);
}
let change;
try {
  change = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
} catch (err) {
  console.error(`cannot read ${name}.json: ${err.message}`);
  process.exit(2);
}
let moduleNames = {};
try {
  moduleNames = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(out, '_data', 'module-map.json'), 'utf8')).modules.map((m) => [m.id, m.name]));
} catch {}
fs.mkdirSync(path.join(out, 'changes'), { recursive: true });
const file = path.join(out, 'changes', `${name}.md`);
fs.writeFileSync(file, renderChanges(change, { moduleNames }));
console.log(`wrote changes/${name}.md`);
