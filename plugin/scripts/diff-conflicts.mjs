#!/usr/bin/env node
// Adds the policy conflict comparison (before → after this update) to a change log, as its `conflicts`
// field. Run after diff-facts and match-conflicts; render-changes then writes the 정책 충돌 section.
import fs from 'node:fs';
import path from 'node:path';
import { diffConflicts } from './lib/diff.mjs';
import { writeJsonAtomic } from './lib/jsondir.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { validateConflicts } from './lib/validate.mjs';

const [out, name] = process.argv.slice(2);
if (!out || !name) {
  console.error('usage: diff-conflicts.mjs <output-dir> <YYYY-MM-DD-commit7>');
  process.exit(2);
}
assertOutputOutsideTarget(out);
const data = path.join(out, '_data');
const changeFile = path.join(data, 'changes', `${name}.json`);
let change;
try {
  change = JSON.parse(fs.readFileSync(changeFile, 'utf8'));
} catch (err) {
  console.error(`cannot read ${changeFile}: ${err.message} (run diff-facts.mjs first)`);
  process.exit(2);
}

// A missing or invalid conflicts file counts as no conflicts: the conflict step never fails an update.
function readConflicts(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const errors = validateConflicts(doc);
    if (!errors.length) return doc;
    console.error(`WARN ignored ${file}: invalid: ${errors.slice(0, 3).join('; ')}`);
  } catch (err) {
    console.error(`WARN ignored ${file}: unreadable JSON: ${err.message}`);
  }
  return { conflicts: [] };
}

const prev = readConflicts(path.join(data, 'prev', 'conflicts.json'));
const next = readConflicts(path.join(data, 'conflicts.json'));
const diff = diffConflicts(prev, next);
if (prev || next) {
  // `at` ties this comparison to the conflicts.json it saw: the report shows it only while that file is current.
  change.conflicts = { ...diff, at: next?.generatedAt ?? null };
  writeJsonAtomic(changeFile, change);
}
console.log(`added=${diff.added.length} resolved=${diff.resolved.length} changed=${diff.changed.length} needsReview=${diff.needsReview.length}`);
