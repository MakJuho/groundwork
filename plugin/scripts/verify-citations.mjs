#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadJsonDir, writeJsonAtomic } from './lib/jsondir.mjs';
import { assertOutside, assertOutputOutsideTarget } from './lib/paths.mjs';
import { validateConflicts, validateFacts, validateFlow } from './lib/validate.mjs';
import { verifyConflicts, verifyFacts, verifyFlow } from './lib/verify.mjs';

const [target, outDir] = process.argv.slice(2);
if (!target || !outDir) {
  console.error('usage: verify-citations.mjs <target-dir> <output-dir>');
  process.exit(2);
}
if (!fs.statSync(target, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`not a directory: ${target}`);
  process.exit(2);
}
assertOutside(target, outDir);

const dataDir = path.join(outDir, '_data');
const root = assertOutputOutsideTarget(outDir);
const same = (a, b) => {
  const [x, y] = [path.resolve(a), path.resolve(b)];
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
};
if (!same(root, target)) {
  console.error(`target ${target} is not module-map project.root (${root}); pass project.root or fix module-map.json`);
  process.exit(2);
}
const factsDir = path.join(dataDir, 'facts');
fs.mkdirSync(factsDir, { recursive: true });

// Verify everything first and write afterwards, so a run that has to stop leaves every file as it was.
function verifyDir(sub, validate, verify, key) {
  const { entries, skipped } = loadJsonDir(path.join(dataDir, sub), validate);
  const results = entries.map((e) => ({ file: e.file, ...verify(target, e.data) }));
  const list = (d) => (key === 'facts' ? d.items : d.steps);
  return {
    evidence: entries.reduce((sum, e) => sum + list(e.data).reduce((n, x) => n + x.evidence.length, 0), 0),
    writes: results.map((r) => ({ file: r.file, data: r[key] })),
    reports: results.map((r) => r.report),
    skipped: skipped.map((s) => ({ file: `${sub}/${s.name}`, reason: s.reason })),
  };
}

const facts = verifyDir('facts', validateFacts, verifyFacts, 'facts');
const flows = verifyDir('flows', validateFlow, verifyFlow, 'flow');

// Conflicts are optional (outputs from before the conflict finder have none); a bad file is skipped, not fatal.
function verifyConflictFile() {
  const file = path.join(dataDir, 'conflicts.json');
  const none = { evidence: 0, writes: [], report: { total: 0, failed: [] }, skipped: [] };
  if (!fs.existsSync(file)) return none;
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { ...none, skipped: [{ file: 'conflicts.json', reason: `unreadable JSON: ${err.message}` }] };
  }
  const errors = validateConflicts(doc);
  if (errors.length) {
    return { ...none, skipped: [{ file: 'conflicts.json', reason: `invalid: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ' ...' : ''}` }] };
  }
  const { conflicts, report } = verifyConflicts(target, doc);
  return {
    evidence: doc.conflicts.reduce((sum, c) => sum + c.sides.reduce((n, s) => n + s.evidence.length, 0), 0),
    writes: [{ file, data: conflicts }],
    report,
    skipped: [],
  };
}
const conflicts = verifyConflictFile();

// If not one cited file exists, the target is almost certainly the wrong folder (moved repo, stale root):
// downgrading everything would only bury every policy under "확인 필요".
const evidenceTotal = facts.evidence + flows.evidence + conflicts.evidence;
const notFound = [...facts.reports, ...flows.reports, conflicts.report].flatMap((r) => r.failed).filter((f) => f.reason === 'file-not-found').length;
if (evidenceTotal > 0 && notFound === evidenceTotal) {
  console.error(`no cited file exists under ${target} (${notFound} citations); is this the analyzed folder? nothing was changed`);
  process.exit(2);
}

for (const w of [...facts.writes, ...flows.writes, ...conflicts.writes]) writeJsonAtomic(w.file, w.data);

const skipped = [...facts.skipped, ...flows.skipped, ...conflicts.skipped];
const summary = {
  generatedAt: new Date().toISOString(),
  modules: facts.reports,
  flows: flows.reports,
  conflicts: conflicts.report,
  failedTotal: [...facts.reports, ...flows.reports, conflicts.report].reduce((sum, r) => sum + r.failed.length, 0),
  skipped,
};
writeJsonAtomic(path.join(dataDir, 'verify-report.json'), summary);
console.log(`modules=${facts.reports.length} flows=${flows.reports.length} failed=${summary.failedTotal} skipped=${skipped.length} conflicts=${conflicts.report.total}`);
for (const s of skipped) console.log(`skipped ${s.file}: ${s.reason}`);
