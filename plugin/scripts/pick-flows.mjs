#!/usr/bin/env node
import path from 'node:path';
import { pickFlows } from './lib/flows.mjs';
import { readJsonDir } from './lib/jsondir.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { validateFacts, validateFlow } from './lib/validate.mjs';

const args = process.argv.slice(2);
const out = args[0];
if (!out) {
  console.error('usage: pick-flows.mjs <output-dir> [--max N] [--all]');
  process.exit(2);
}
assertOutputOutsideTarget(out);
const maxAt = args.indexOf('--max');
const max = maxAt >= 0 ? Number(args[maxAt + 1]) : 3;
const exclude = args.includes('--all') ? [] : readJsonDir(path.join(out, '_data', 'flows'), validateFlow).map((f) => f.id);
const picked = pickFlows(readJsonDir(path.join(out, '_data', 'facts'), validateFacts), { max, exclude });
console.log(JSON.stringify(picked, null, 2));
