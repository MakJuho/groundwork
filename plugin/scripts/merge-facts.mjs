#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './lib/jsondir.mjs';
import { mergeFactsParts } from './lib/merge-facts.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { validateFacts } from './lib/validate.mjs';

const [out, moduleId, flag] = process.argv.slice(2);
if (!out || !moduleId || (flag && flag !== '--clean')) {
  console.error('usage: merge-facts.mjs <output-dir> <module-id> [--clean]');
  process.exit(2);
}
assertOutputOutsideTarget(out);
const data = path.join(out, '_data');
// 분석 전에 이 모듈의 예전 조각 결과를 지운다(다른 모듈 조각은 건드리지 않는다).
if (flag === '--clean') {
  const dir = path.join(data, 'facts-parts');
  const mine = new RegExp(`^${moduleId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+\\.json$`);
  const old = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => mine.test(f)) : [];
  for (const f of old) fs.rmSync(path.join(dir, f));
  console.log(`cleaned=${old.length}`);
  process.exit(0);
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

let shards;
let mod;
try {
  shards = readJson(path.join(data, 'module-files.json')).shards?.[moduleId];
  mod = readJson(path.join(data, 'module-map.json')).modules.find((m) => m.id === moduleId);
} catch (err) {
  console.error(`cannot read module data: ${err.message}`);
  process.exit(2);
}
if (!Array.isArray(shards) || shards.length < 2 || !mod) {
  console.error(`module "${moduleId}" is not sharded`);
  process.exit(2);
}

// 조각마다 파일 하나. 없거나 깨진 조각은 모두 모아서 알려 준다(스킬이 그 조각만 다시 분석한다).
const parts = [];
const bad = [];
shards.forEach((_, i) => {
  const file = path.join(data, 'facts-parts', `${moduleId}.${i}.json`);
  let doc;
  try {
    doc = readJson(file);
  } catch (err) {
    bad.push(`shard ${i}: ${err.code === 'ENOENT' ? 'missing' : err.message}`);
    return;
  }
  const errors = validateFacts(doc);
  if (errors.length) bad.push(`shard ${i}: ${errors.slice(0, 3).join('; ')}`);
  else if (doc.module !== moduleId) bad.push(`shard ${i}: module is "${doc.module}", expected "${moduleId}"`);
  else parts.push(doc);
});
if (bad.length) {
  console.error(bad.join('\n'));
  process.exit(2);
}

const { facts, duplicates } = mergeFactsParts(parts, { module: moduleId, abbrev: mod.abbrev, modulePaths: mod.paths });
const errors = validateFacts(facts);
if (errors.length) {
  console.error(`merged facts invalid: ${errors.slice(0, 3).join('; ')}`);
  process.exit(2);
}
fs.mkdirSync(path.join(data, 'facts'), { recursive: true });
writeJsonAtomic(path.join(data, 'facts', `${moduleId}.json`), facts);
console.log(`parts=${parts.length} items=${facts.items.length} merged=${duplicates}`);
