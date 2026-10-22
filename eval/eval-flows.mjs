#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { anchorLine } from './lib/score.mjs';
import { findFlowForTrigger, scoreFlow } from './lib/flow-score.mjs';

const [fixture, out] = process.argv.slice(2);
if (!fixture || !out) {
  console.error('usage: eval-flows.mjs <fixture-dir> <output-dir>');
  process.exit(2);
}
const name = path.basename(path.resolve(fixture));
const { flows: expectedFlows } = JSON.parse(fs.readFileSync(path.join(fixture, 'expected-flows.json'), 'utf8'));
const flowsDir = path.join(out, '_data', 'flows');
const actual = fs.existsSync(flowsDir)
  ? fs.readdirSync(flowsDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(flowsDir, f), 'utf8')))
  : [];

const results = expectedFlows.map((exp) => {
  const steps = exp.steps.map((s) => ({ id: s.id, file: s.file, line: anchorLine(fs.readFileSync(path.join(fixture, s.file), 'utf8'), s.anchor) }));
  const flow = findFlowForTrigger(exp.trigger, actual);
  const score = flow ? scoreFlow(steps, flow) : { expected: steps.length, found: 0, recall: 0, missed: steps.map((s) => s.id) };
  return { trigger: exp.trigger, flow: flow?.id ?? null, ...score };
});
fs.writeFileSync(path.join(out, '_data', 'eval-flows-report.json'), JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`fixture=${name} flow="${r.trigger}" step-recall=${r.recall} (${r.found}/${r.expected})${r.flow ? '' : ' NOT TRACED'}`);
  if (r.missed.length) console.log(`missed: ${r.missed.join(', ')}`);
}
