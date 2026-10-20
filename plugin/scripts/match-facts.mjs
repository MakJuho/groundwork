#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './lib/jsondir.mjs';
import { matchFacts } from './lib/match.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { validateFacts } from './lib/validate.mjs';

const args = process.argv.slice(2);
const [out, moduleId] = args;
if (!out || !moduleId) {
  console.error('usage: match-facts.mjs <output-dir> <module-id> [--snapshot]');
  process.exit(2);
}
assertOutputOutsideTarget(out);
const data = path.join(out, '_data');
const prevFile = path.join(data, 'prev', 'facts', `${moduleId}.json`);
const nextFile = path.join(data, 'facts', `${moduleId}.json`);

// Before re-analysis: keep the facts the ids come from. Always fresh: an older snapshot would renumber
// rules added since. (The update skill snapshots every module itself in plan-update and skips this.)
if (args.includes('--snapshot')) {
  if (fs.existsSync(nextFile)) {
    fs.mkdirSync(path.dirname(prevFile), { recursive: true });
    fs.copyFileSync(nextFile, prevFile);
    console.log('snapshot=created');
  } else {
    fs.rmSync(prevFile, { force: true });
    console.log('snapshot=none');
  }
  process.exit(0);
}

function load(file) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`cannot read ${file}: ${err.message}`);
    process.exit(2);
  }
  const errors = validateFacts(doc);
  if (errors.length) {
    console.error(`${file}: ${errors.slice(0, 3).join('; ')}`);
    process.exit(2);
  }
  if (doc.module !== moduleId) {
    console.error(`${file}: module is "${doc.module}", expected "${moduleId}"`);
    process.exit(2);
  }
  return doc;
}

if (!fs.existsSync(prevFile)) {
  console.log('prev=none');
  process.exit(0);
}
const prev = load(prevFile);
const next = load(nextFile);

const retiredFile = path.join(data, 'retired-ids.json');
let retiredDoc = { retired: [] };
if (fs.existsSync(retiredFile)) {
  try {
    retiredDoc = JSON.parse(fs.readFileSync(retiredFile, 'utf8'));
    if (!Array.isArray(retiredDoc?.retired)) throw new Error('retired: array required');
  } catch (err) {
    console.error(`cannot read ${retiredFile}: ${err.message}`);
    process.exit(2);
  }
}
const moduleMap = JSON.parse(fs.readFileSync(path.join(data, 'module-map.json'), 'utf8'));
const abbrev = moduleMap.modules?.find((m) => m.id === moduleId)?.abbrev;

const { facts, report } = matchFacts(prev, next, { retired: retiredDoc.retired.map((r) => r.id), abbrev });
writeJsonAtomic(nextFile, facts);
// An id that was in the previous facts and is live again (a retry after a bad first pass) is not retired.
const live = new Set(facts.items.map((it) => it.id).filter((id) => prev.items.some((p) => p.id === id)));
retiredDoc.retired = retiredDoc.retired.filter((r) => !(r.module === moduleId && live.has(r.id)));
const known = new Set(retiredDoc.retired.map((r) => r.id));
const now = new Date().toISOString();
for (const r of report.retired) if (!known.has(r.id)) retiredDoc.retired.push({ ...r, module: moduleId, retiredAt: now });
if (report.retired.length || fs.existsSync(retiredFile)) writeJsonAtomic(retiredFile, retiredDoc);

for (const w of report.warnings) console.error(`WARN ${w}`);
console.log(`kept=${report.kept.length} restored=${report.restored.length} renumbered=${report.renumbered.length} added=${report.added.length} retired=${report.retired.length}`);
for (const r of report.restored) console.log(`restored ${r.from} -> ${r.to}`);
for (const r of report.renumbered) console.log(`renumbered ${r.from} -> ${r.to}`);
for (const r of report.retired) console.log(`retired ${r.id}: ${r.summary}`);
