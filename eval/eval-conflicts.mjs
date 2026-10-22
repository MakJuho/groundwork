#!/usr/bin/env node
// Conflict recall against an answer file, and the open conflicts no answer explains (false positives).
// usage: eval-conflicts.mjs <fixture-dir> <output-dir> [--answers <file>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorLine } from './lib/score.mjs';
import { scoreConflicts } from './lib/conflict-score.mjs';

const args = process.argv.slice(2);
const ai = args.indexOf('--answers');
const answersArg = ai >= 0 ? args[ai + 1] : null;
if (ai >= 0) args.splice(ai, 2);
const [fixture, out] = args;
if (!fixture || !out || (ai >= 0 && !answersArg)) {
  console.error('usage: eval-conflicts.mjs <fixture-dir> <output-dir> [--answers <file>]');
  process.exit(2);
}
const name = path.basename(path.resolve(fixture));
const answersFile = answersArg ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'answers', `${name}-conflicts.json`);
const answers = fs.existsSync(answersFile) ? JSON.parse(fs.readFileSync(answersFile, 'utf8')) : { conflicts: [] };

const expected = (answers.conflicts ?? []).map((c) => ({
  id: c.id,
  title: c.title,
  sides: c.sides.map((s) => {
    const abs = path.join(fixture, s.file);
    const line = fs.existsSync(abs) ? anchorLine(fs.readFileSync(abs, 'utf8'), s.anchor) : -1;
    if (line < 0) console.error(`WARN ${c.id}: anchor not found in ${s.file}: ${s.anchor}`);
    return { file: s.file, line };
  }),
}));

const conflictsFile = path.join(out, '_data', 'conflicts.json');
let actual = [];
try { actual = JSON.parse(fs.readFileSync(conflictsFile, 'utf8')).conflicts ?? []; } catch { /* no conflicts written */ }

const result = scoreConflicts(expected, actual);
fs.mkdirSync(path.join(out, '_data'), { recursive: true });
fs.writeFileSync(path.join(out, '_data', 'eval-conflicts-report.json'), JSON.stringify({ fixture: name, answers: answersFile, expected: expected.length, ...result }, null, 2));
console.log(`fixture=${name} conflict-recall=${result.recall} (${result.hits.length}/${expected.length}) extra=${result.extra.length}`);
if (result.missed.length) console.log(`missed: ${result.missed.join(', ')}`);
if (result.extra.length) console.log(`extra: ${result.extra.map((c) => `${c.id} ${c.title}`).join(', ')}`);
