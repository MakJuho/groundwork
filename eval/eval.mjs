#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { anchorLine, score } from './lib/score.mjs';

const [fixtureDir, outDir] = process.argv.slice(2);
if (!fixtureDir || !outDir) {
  console.error('usage: eval.mjs <fixture-dir> <output-dir>');
  process.exit(2);
}

const { policies } = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'expected-policies.json'), 'utf8'));
const expected = policies.map((p) => ({
  id: p.id,
  locations: p.locations.map((loc) => {
    const line = anchorLine(fs.readFileSync(path.join(fixtureDir, loc.file), 'utf8'), loc.anchor);
    if (line < 0) throw new Error(`${p.id}: anchor not found in ${loc.file}`);
    return { file: loc.file, line };
  }),
}));

const factsDir = path.join(outDir, '_data', 'facts');
const items = fs.existsSync(factsDir)
  ? fs.readdirSync(factsDir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(fs.readFileSync(path.join(factsDir, f), 'utf8')).items)
  : [];

const result = { fixture: path.basename(path.resolve(fixtureDir)), generatedAt: new Date().toISOString(), ...score(expected, items) };
fs.mkdirSync(path.join(outDir, '_data'), { recursive: true });
fs.writeFileSync(path.join(outDir, '_data', 'eval-report.json'), JSON.stringify(result, null, 2));
console.log(`fixture=${result.fixture} recall=${result.recall} (${result.found}/${result.expected}) precision=${result.precision} (${result.correct}/${result.facts})`);
if (result.missed.length) console.log(`missed: ${result.missed.join(', ')}`);
