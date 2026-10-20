#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { diffFacts, diffFlows, diffLifecycles } from './lib/diff.mjs';
import { readJsonDir, writeJsonAtomic } from './lib/jsondir.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { validateFacts, validateFlow } from './lib/validate.mjs';

const args = process.argv.slice(2);
const out = args[0];
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const from = opt('--from');
const to = opt('--to');
if (!out || !from || !to) {
  console.error('usage: diff-facts.mjs <output-dir> --from <commit> --to <commit> [--date YYYY-MM-DD]');
  process.exit(2);
}
assertOutputOutsideTarget(out);
const data = path.join(out, '_data');
const prevDir = path.join(data, 'prev');
if (!fs.existsSync(path.join(prevDir, 'facts'))) {
  console.error(`missing ${path.join(prevDir, 'facts')}: the facts before the update (plan-update makes this snapshot)`);
  process.exit(2);
}
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const date = opt('--date') ?? today();
const short = to.slice(0, 7);
const name = `${date}-${short}`;

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const isLifecycle = (lc) => (lc && typeof lc.id === 'string' && lc.id ? [] : ['id: string required']);
const retraced =readJson(path.join(data, 'update-plan.json'), {})?.flows?.affected ?? [];

const nextFacts = readJsonDir(path.join(data, 'facts'), validateFacts);
const items = diffFacts(readJsonDir(path.join(prevDir, 'facts'), validateFacts), nextFacts);
const flows = diffFlows(readJsonDir(path.join(prevDir, 'flows'), validateFlow), readJsonDir(path.join(data, 'flows'), validateFlow), Array.isArray(retraced) ? retraced : []);
const count = (type) => items.filter((d) => d.type === type).length;
const change = {
  from,
  to,
  date,
  modules: [...new Set(items.map((d) => d.module))].sort(),
  counts: { added: count('added'), changed: count('changed'), removed: count('removed') },
  items,
  flows,
  entities: diffLifecycles(readJsonDir(path.join(prevDir, 'lifecycles'), isLifecycle), readJsonDir(path.join(data, 'lifecycles'), isLifecycle)),
  needsReview: nextFacts.flatMap((f) => f.items.filter((it) => it.verifyFailed).map((it) => ({ id: it.id, module: f.module, summary: it.summary }))),
};
fs.mkdirSync(path.join(data, 'changes'), { recursive: true });
writeJsonAtomic(path.join(data, 'changes', `${name}.json`), change);

const historyFile = path.join(data, 'policy-history.json');
const history = readJson(historyFile, {});
// A rule whose cited line only moved (another edit above it) is unchanged; render-changes lists it apart.
for (const d of items) if (!(d.type === 'changed' && d.fields.every((f) => f === 'evidence'))) history[d.id] = { date, commit: short, type: d.type };
writeJsonAtomic(historyFile, history);

console.log(`changes=${name} added=${change.counts.added} changed=${change.counts.changed} removed=${change.counts.removed} modules=${change.modules.join(',')}`);
