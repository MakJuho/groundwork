#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { collectCommands, fixUnverified } from './lib/commands.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';

const args = process.argv.slice(2);
const out = args[0];
if (!out) {
  console.error('usage: run-commands.mjs <output-dir> [--check]');
  process.exit(2);
}
const root = assertOutputOutsideTarget(out);
const data = path.join(out, '_data');
let manifests = [];
try {
  manifests = JSON.parse(fs.readFileSync(path.join(data, 'inventory.json'), 'utf8')).manifests ?? [];
} catch {}
const commands = collectCommands(root, Array.isArray(manifests) ? manifests : []);
fs.writeFileSync(path.join(data, 'run-commands.json'), JSON.stringify(commands, null, 2));

if (!args.includes('--check')) {
  console.log(JSON.stringify(commands, null, 2));
  process.exit(0);
}
const file = path.join(out, 'overview', 'onboarding.md');
if (!fs.existsSync(file)) {
  console.error(`missing ${file}: run groundwork:write-onboarding first`);
  process.exit(2);
}
const { markdown, removed } = fixUnverified(fs.readFileSync(file, 'utf8'), commands);
if (removed.length) fs.writeFileSync(file, markdown);
console.log(`unverified=${removed.length}`);
for (const r of removed) console.log(`moved to 확인 필요: ${r.command}`);
