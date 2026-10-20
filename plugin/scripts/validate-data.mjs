#!/usr/bin/env node
import fs from 'node:fs';
import { validateConflicts, validateFacts, validateFlow, validateModuleMap } from './lib/validate.mjs';

const validators = { 'module-map': validateModuleMap, facts: validateFacts, flow: validateFlow, conflicts: validateConflicts };
const [kind, file] = process.argv.slice(2);
if (!validators[kind] || !file) {
  console.error('usage: validate-data.mjs <module-map|facts|flow|conflicts> <file>');
  process.exit(2);
}
let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`invalid JSON: ${err.message}`);
  process.exit(1);
}
const errors = validators[kind](data);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('OK');
