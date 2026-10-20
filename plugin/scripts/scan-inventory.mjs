#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertOutside } from './lib/paths.mjs';
import { buildInventory } from './lib/inventory.mjs';

const [target, outFile] = process.argv.slice(2);
if (!target || !outFile) {
  console.error('usage: scan-inventory.mjs <target-dir> <out-file>');
  process.exit(2);
}
if (!fs.statSync(target, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`not a directory: ${target}`);
  process.exit(2);
}
assertOutside(target, outFile);

const inv = buildInventory(target);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(inv, null, 2));
console.log(`files=${inv.totals.files} skipped=${inv.skipped.count} stacks=${inv.stacks.join(',')} layout=${inv.layout.type}`);
