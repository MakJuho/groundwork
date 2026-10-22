#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { scoreModules } from './lib/module-score.mjs';

const [fixture, out] = process.argv.slice(2);
if (!fixture || !out) {
  console.error('usage: eval-modules.mjs <fixture-dir> <output-dir>');
  process.exit(2);
}
const { modules: expected } = JSON.parse(fs.readFileSync(path.join(fixture, 'expected-modules.json'), 'utf8'));
const { modules: actual } = JSON.parse(fs.readFileSync(path.join(out, '_data', 'module-files.json'), 'utf8'));
const s = scoreModules(expected, actual);
fs.writeFileSync(path.join(out, '_data', 'eval-modules-report.json'), JSON.stringify(s, null, 2));
console.log(`fixture=${path.basename(path.resolve(fixture))} module-accuracy=${s.accuracy} (${s.matched}/${s.expected})`);
for (const d of s.details) console.log(`${d.matched ? 'OK  ' : 'MISS'} ${d.name} -> ${d.best ?? '-'} (${d.jaccard})`);
