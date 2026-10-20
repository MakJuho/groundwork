#!/usr/bin/env node
// Prints only the business rules a developer is touching, as markdown (or JSON with --json).
// usage: query-rules.mjs <output-dir> [--file Foo.java[:33]] [--entity Order] [--screen OrderMng[.btn_cancel]]
//        [--endpoint /order/cancel.do] [--module order] [--kind validation] [--id ORD-004] [--json] [text ...]
import fs from 'node:fs';
import { buildRuleIndex, queryRules, renderRulesMarkdown } from './lib/rules.mjs';

const args = process.argv.slice(2);
const outDir = args.shift();
if (!outDir || !fs.statSync(outDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('usage: query-rules.mjs <output-dir> [--file F[:line]] [--entity E] [--screen S] [--endpoint URL] [--module M] [--kind K] [--id ID] [--json] [text ...]');
  process.exit(2);
}
const q = {};
const text = [];
let json = false;
const FLAGS = new Set(['file', 'line', 'entity', 'screen', 'endpoint', 'module', 'kind', 'id']);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') { json = true; continue; }
  if (a.startsWith('--') && FLAGS.has(a.slice(2))) {
    if (i + 1 >= args.length) { console.error(`missing value for ${a}`); process.exit(2); }
    q[a.slice(2)] = args[++i];
    continue;
  }
  text.push(a);
}
if (text.length) q.text = text.join(' ');

const index = buildRuleIndex(outDir);
if (!index.rules.length) {
  console.error('no rules: run /groundwork:analyze first (_data/facts is empty)');
  process.exit(1);
}
const rules = queryRules(index, q);
if (json) console.log(JSON.stringify(rules, null, 2));
else {
  const label = Object.entries(q).map(([k, v]) => `${k}=${v}`).join(' ') || '전체';
  process.stdout.write(renderRulesMarkdown(rules, { title: `관련 규칙 · ${label}` }));
}
