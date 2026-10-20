#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildLifecycles } from './lib/flows.mjs';
import { readJsonDir } from './lib/jsondir.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { validateFacts, validateFlow } from './lib/validate.mjs';

const [out] = process.argv.slice(2);
if (!out) {
  console.error('usage: build-lifecycles.mjs <output-dir>');
  process.exit(2);
}
assertOutputOutsideTarget(out);
const data = path.join(out, '_data');
const lifecycles = buildLifecycles(readJsonDir(path.join(data, 'facts'), validateFacts), readJsonDir(path.join(data, 'flows'), validateFlow));
const dir = path.join(data, 'lifecycles');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (const lc of lifecycles) fs.writeFileSync(path.join(dir, `${lc.id}.json`), JSON.stringify(lc, null, 2));
console.log(`entities=${lifecycles.length} documented=${lifecycles.filter((lc) => lc.documented).length}`);
