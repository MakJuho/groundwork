#!/usr/bin/env node
// Keeps CFL ids across runs (spec §4.7): matches _data/conflicts.json against the _data/prev snapshot.
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './lib/jsondir.mjs';
import { matchConflicts, numberTemporary } from './lib/match.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { validateConflicts } from './lib/validate.mjs';

const args = process.argv.slice(2);
const seenAt = args.indexOf('--seen');
const seen = seenAt >= 0 ? args[seenAt + 1] : new Date().toISOString();
const out = args.find((a, i) => !a.startsWith('--') && !(seenAt >= 0 && i === seenAt + 1));
if (!out || (seenAt >= 0 && !seen)) {
  console.error('usage: match-conflicts.mjs <output-dir> [--snapshot] [--seen <label>]');
  process.exit(2);
}
assertOutputOutsideTarget(out);
const data = path.join(out, '_data');
const prevFile = path.join(data, 'prev', 'conflicts.json');
const nextFile = path.join(data, 'conflicts.json');

// A conflicts file that is not there, unreadable or invalid, as { doc } or { error }.
function read(file) {
  if (!fs.existsSync(file)) return { error: 'missing' };
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { error: `unreadable JSON: ${err.message}` };
  }
  const errors = validateConflicts(doc);
  return errors.length ? { error: `invalid: ${errors.slice(0, 3).join('; ')}` } : { doc };
}

// Before the conflict finder runs again: keep the conflicts the ids come from. A broken file is no base.
if (args.includes('--snapshot')) {
  if (read(nextFile).doc) {
    fs.mkdirSync(path.dirname(prevFile), { recursive: true });
    fs.copyFileSync(nextFile, prevFile);
    console.log('snapshot=created');
  } else {
    fs.rmSync(prevFile, { force: true });
    console.log('snapshot=none');
  }
  process.exit(0);
}

// Only the conflicts just written can stop this step; a bad snapshot or retired list is a warning.
const current = read(nextFile);
if (!current.doc) {
  console.error(`cannot read ${nextFile}: ${current.error}`);
  process.exit(2);
}
const next = current.doc;
const generatedAt = new Date().toISOString();

const retiredFile = path.join(data, 'retired-conflicts.json');
let retiredDoc = { retired: [] };
if (fs.existsSync(retiredFile)) {
  try {
    retiredDoc = JSON.parse(fs.readFileSync(retiredFile, 'utf8'));
    if (!Array.isArray(retiredDoc?.retired)) throw new Error('retired: array required');
  } catch (err) {
    console.error(`WARN ignored ${retiredFile}: ${err.message}`);
    retiredDoc = { retired: [] };
  }
}
const retiredIds = retiredDoc.retired.map((r) => r?.id);

const previous = read(prevFile);
if (!previous.doc) {
  if (previous.error !== 'missing') console.error(`WARN ignored ${prevFile}: ${previous.error}`);
  const conflicts = numberTemporary(next.conflicts, retiredIds).map((c) => ({ ...c, firstSeen: seen }));
  writeJsonAtomic(nextFile, { ...next, generatedAt, conflicts });
  console.log('prev=none');
  process.exit(0);
}
const prev = previous.doc;

const { doc, report } = matchConflicts(prev, next, { retired: retiredIds, seen });
writeJsonAtomic(nextFile, { ...doc, generatedAt });
// An id from the snapshot that is live again (a retry after a bad first pass) is not retired.
const live = new Set(doc.conflicts.map((c) => c.id).filter((id) => prev.conflicts.some((p) => p.id === id)));
retiredDoc.retired = retiredDoc.retired.filter((r) => !live.has(r.id));
const known = new Set(retiredDoc.retired.map((r) => r.id));
for (const r of report.retired) if (!known.has(r.id)) retiredDoc.retired.push({ ...r, retiredAt: generatedAt });
if (report.retired.length || fs.existsSync(retiredFile)) writeJsonAtomic(retiredFile, retiredDoc);

console.log(`kept=${report.kept.length} restored=${report.restored.length} added=${report.added.length} retired=${report.retired.length}`);
for (const r of report.restored) console.log(`restored ${r.from} -> ${r.to}`);
for (const id of report.added) console.log(`added ${id}`);
for (const r of report.retired) console.log(`retired ${r.id}: ${r.title}`);
