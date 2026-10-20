#!/usr/bin/env node
// Writes OUT/_data/rule-digest.json: every verified rule with its evidence layers, plus candidate
// conflict signals for the conflict-finder agent.
import fs from 'node:fs';
import path from 'node:path';
import { buildRuleDigest } from './lib/conflicts.mjs';
import { readJsonDir, writeJsonAtomic } from './lib/jsondir.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { validateFacts } from './lib/validate.mjs';

const [out] = process.argv.slice(2);
if (!out) {
  console.error('usage: build-rule-digest.mjs <output-dir>');
  process.exit(2);
}
const root = assertOutputOutsideTarget(out);
const data = path.join(out, '_data');
let moduleMap = null;
try { moduleMap = JSON.parse(fs.readFileSync(path.join(data, 'module-map.json'), 'utf8')); } catch { /* checked above */ }
const readText = (rel) => {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; }
};
const { rules, signals } = buildRuleDigest({ facts: readJsonDir(path.join(data, 'facts'), validateFacts), moduleMap, readText });
writeJsonAtomic(path.join(data, 'rule-digest.json'), { generatedAt: new Date().toISOString(), rules, signals });
console.log(`rules=${rules.length} signals=${signals.length}`);
