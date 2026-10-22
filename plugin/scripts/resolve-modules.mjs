#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertOutside } from './lib/paths.mjs';
import { isBusinessSource, listTargetFiles, moduleFilesDoc, planModuleShards, resolveModules } from './lib/resolve.mjs';
import { validateModuleMap } from './lib/validate.mjs';

const [out] = process.argv.slice(2);
if (!out) {
  console.error('usage: resolve-modules.mjs <output-dir>');
  process.exit(2);
}
const mapFile = path.join(out, '_data', 'module-map.json');
let map;
try {
  map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
} catch (err) {
  console.error(`cannot read ${mapFile}: ${err.message}`);
  process.exit(1);
}
const errors = validateModuleMap(map);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
assertOutside(map.project.root, out);

const files = listTargetFiles(map.project.root);
const resolved = resolveModules(map.modules, files);
const { byModule, unassigned, overlaps } = resolved;
for (const mod of map.modules) mod.fileCount = byModule[mod.id].length;
const shards = planModuleShards(map.project.root, byModule);
fs.writeFileSync(mapFile, JSON.stringify(map, null, 2));
fs.writeFileSync(path.join(out, '_data', 'module-files.json'), JSON.stringify(moduleFilesDoc(resolved, shards), null, 2));

const pct = files.length ? Math.round((unassigned.length / files.length) * 100) : 0;
const sources = files.filter(isBusinessSource);
const looseSources = unassigned.filter(isBusinessSource);
const sourcePct = sources.length ? Math.round((looseSources.length / sources.length) * 100) : 0;
console.log(`modules=${map.modules.length} files=${files.length} unassigned=${unassigned.length} (${pct}%) overlaps=${overlaps.length}`);
console.log(`unassigned-source=${looseSources.length}/${sources.length} (${sourcePct}%)`);
if (sourcePct > 20) console.log('WARN unassigned source files exceed 20% of the project source');
for (const [id, parts] of Object.entries(shards)) console.log(`SHARD module "${id}" is large: ${byModule[id].length} files -> ${parts.length} shards`);
for (const mod of map.modules) if (mod.fileCount === 0) console.log(`WARN module "${mod.id}" matches no files`);
