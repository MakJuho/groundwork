#!/usr/bin/env node
// Partial update, step 1 (design §3 "부분 갱신"): which modules and flows the commits between the last
// analysis and now touch. Reads Git only; on "ready" it re-resolves module files and snapshots _data/prev.
import fs from 'node:fs';
import path from 'node:path';
import { changedFiles, dirtyFiles, filesAt, head, isRepo, revParse } from './lib/git.mjs';
import { readJsonDir, writeJsonAtomic } from './lib/jsondir.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { isBusinessSource, listTargetFiles, moduleFilesDoc, planModuleShards, resolveModules } from './lib/resolve.mjs';
import { validateFlow, validateModuleMap } from './lib/validate.mjs';

const THRESHOLD = 0.3;
const MAP_REVIEW_FILES = 20;

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const [out, fromArg, toArg] = positional;
if (!out) {
  console.error('usage: plan-update.mjs <output-dir> [<from-commit>] [<to-commit>] [--yes]');
  process.exit(2);
}
const fail = (code, msg) => {
  console.error(msg);
  process.exit(code);
};
const root = assertOutputOutsideTarget(out);
const data = path.join(out, '_data');
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const map = readJson(path.join(data, 'module-map.json'));
const mapErrors = validateModuleMap(map);
if (mapErrors.length) fail(2, `module-map.json: ${mapErrors.slice(0, 3).join('; ')}`);
if (!isRepo(root)) fail(2, `${root} is not inside a Git repository; partial update needs Git history (run a full /groundwork:analyze instead)`);

const state = readJson(path.join(data, 'source-state.json'));
const fromRev = fromArg ?? state?.commit;
if (!fromRev) fail(2, 'no previous commit: pass <from-commit> or record one with source-state.mjs --record after a full analysis');
const from = revParse(root, fromRev) ?? fail(2, `unknown commit: ${fromRev}`);
const current = head(root);
const to = revParse(root, toArg ?? 'HEAD') ?? fail(2, `unknown commit: ${toArg}`);
// The analyzers read the working tree, so it has to be the new commit.
if (current !== to) fail(3, `the target is checked out at ${current?.slice(0, 7)}, not ${to.slice(0, 7)}; check out ${to.slice(0, 7)} and run again`);
const dirty = dirtyFiles(root);
if (dirty.length) fail(3, `the target has uncommitted edits (${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? ', ...' : ''}); commit or stash them and run again`);

const oldFiles = readJson(path.join(data, 'module-files.json'))?.modules ?? {};
const targetFiles = listTargetFiles(root);
const resolved = resolveModules(map.modules, targetFiles);
const owners = (byModule, file) => Object.entries(byModule).filter(([, files]) => Array.isArray(files) && files.includes(file)).map(([id]) => id);
// Only files the analysis can see: the default excludes and .groundworkignore apply to Git changes too,
// otherwise a commit to dist/ would ask for a module map review that no rescan can satisfy.
const visible = new Set(targetFiles);
const changed = changedFiles(root, from, to).filter((c) => (c.status !== 'D' && visible.has(c.path)) || (c.status !== 'A' && owners(oldFiles, c.oldPath ?? c.path).length));

const analyzed = fs.existsSync(path.join(data, 'facts'))
  ? fs.readdirSync(path.join(data, 'facts')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  : [];
const touched = new Set();
const unassigned = [];
for (const c of changed) {
  const ids = new Set([...owners(oldFiles, c.oldPath ?? c.path), ...(c.status === 'D' ? [] : owners(resolved.byModule, c.path))]);
  for (const id of ids) touched.add(id);
  if (c.status !== 'D' && c.status !== 'M' && !ids.size && isBusinessSource(c.path)) unassigned.push(c.path);
}
const affected = [...touched].filter((id) => analyzed.includes(id)).sort();

const oldDirs = new Set();
for (const f of filesAt(root, from)) for (let d = path.posix.dirname(f); d !== '.' && !oldDirs.has(d); d = path.posix.dirname(d)) oldDirs.add(d);
const newDirs = [...new Set(unassigned.map((f) => path.posix.dirname(f)))].filter((d) => d !== '.' && !oldDirs.has(d)).sort();

const changedPaths = new Set(changed.flatMap((c) => [c.path, c.oldPath].filter(Boolean)));
const flows = readJsonDir(path.join(data, 'flows'), validateFlow);
const affectedFlows = flows.filter((fl) => fl.steps.some((s) => s.evidence.some((e) => changedPaths.has(e.file)))).map((fl) => fl.id).sort();

const ratio = analyzed.length ? Math.round((affected.length / analyzed.length) * 100) / 100 : 0;
let status = 'ready';
if (unassigned.length >= MAP_REVIEW_FILES || newDirs.length) status = 'map-review';
else if (!affected.length && !affectedFlows.length) status = 'noop';
else if (affected.length / Math.max(1, analyzed.length) > THRESHOLD && !args.includes('--yes')) status = 'over-threshold';

// An update that stopped after re-analysis (source-state not yet recorded) is run again over the same
// range: the facts now are already the new ones, so the old snapshot is the only "before" left.
const planFile = path.join(data, 'update-plan.json');
const last = readJson(planFile);
const resumed = status === 'ready' && last?.status === 'ready' && last.from === from && last.to === to && fs.existsSync(path.join(data, 'prev', 'facts'));

const plan = {
  from,
  to,
  status,
  resumed,
  changed,
  modules: { analyzed: analyzed.sort(), affected, notAnalyzed: [...touched].filter((id) => !analyzed.includes(id)).sort(), ratio, threshold: THRESHOLD },
  flows: { affected: affectedFlows, labels: Object.fromEntries(flows.filter((fl) => affectedFlows.includes(fl.id)).map((fl) => [fl.id, fl.trigger.label])) },
  unassigned: { files: unassigned.sort(), newDirs },
};

if (status === 'ready' || status === 'noop') {
  // Keep the file lists current either way: noop still moves the base commit forward.
  for (const mod of map.modules) mod.fileCount = resolved.byModule[mod.id].length;
  writeJsonAtomic(path.join(data, 'module-map.json'), map);
  writeJsonAtomic(path.join(data, 'module-files.json'), moduleFilesDoc(resolved, planModuleShards(root, resolved.byModule)));
}
if (status === 'ready') {
  if (!resumed) {
    const prev = path.join(data, 'prev');
    fs.rmSync(prev, { recursive: true, force: true });
    for (const sub of ['facts', 'flows', 'lifecycles']) {
      const src = path.join(data, sub);
      fs.mkdirSync(path.join(prev, sub), { recursive: true });
      if (fs.existsSync(src)) fs.cpSync(src, path.join(prev, sub), { recursive: true });
    }
    const conflicts = path.join(data, 'conflicts.json');
    if (fs.existsSync(conflicts)) fs.copyFileSync(conflicts, path.join(prev, 'conflicts.json'));
  }
  writeJsonAtomic(planFile, plan);
}
console.log(JSON.stringify(plan, null, 2));
process.exit({ ready: 0, noop: 0, 'over-threshold': 4, 'map-review': 5 }[status]);
