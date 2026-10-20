#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { listTargetFiles } from './lib/resolve.mjs';
import { parseXfdl, listFunctions, findServerCall, parseApiUrlMap, resolveUrl } from './lib/nexacro.mjs';
import { indexSpringEndpoints, normalizeUrl } from './lib/spring-endpoints.mjs';

const [out] = process.argv.slice(2);
if (!out) {
  console.error('usage: build-screens.mjs <output-dir>');
  process.exit(2);
}
const root = assertOutputOutsideTarget(out);

const files = listTargetFiles(root);
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const apiMap = {};
for (const f of files.filter((x) => x.endsWith('.xjs'))) Object.assign(apiMap, parseApiUrlMap(read(f)));

const endpoints = indexSpringEndpoints(root, files.filter((x) => x.endsWith('.java')));
const byUrl = new Map();
for (const e of endpoints) {
  const k = normalizeUrl(e.url);
  if (!byUrl.has(k)) byUrl.set(k, e);
}

function groupOf(file) {
  const parts = file.split('/');
  const i = parts.lastIndexOf('forms');
  if (i >= 0 && i < parts.length - 2) return parts[i + 1];
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

const screens = [];
let buttonCount = 0;
let linked = 0;
let warningCount = 0;
for (const file of files.filter((x) => x.endsWith('.xfdl')).sort()) {
  let form;
  try {
    form = parseXfdl(read(file));
  } catch (err) {
    console.error(`WARN ${file}: ${err.message}`);
    continue;
  }
  const fns = new Map(listFunctions(form.script || '').map((f) => [f.name, f]));
  const warnings = [];
  const buttons = [];
  for (const c of form.components) {
    const handler = c.events?.onclick;
    if (c.type !== 'Button' || !handler) continue;
    let call = null;
    let endpoint = null;
    const found = findServerCall(form.script, handler);
    if (found) {
      const url = resolveUrl(found.svcKey, apiMap);
      call = { fn: found.fn, line: found.line, via: found.via, svcKey: found.svcKey, url,
        inDatasets: found.inDatasets, outDatasets: found.outDatasets, callback: found.callback };
      if (url == null) {
        warnings.push(`${c.id}: 서비스 키 ${found.svcKey}의 URL을 찾지 못함`);
      } else {
        const ep = byUrl.get(normalizeUrl(url));
        if (ep) {
          endpoint = { className: ep.className, method: ep.method, file: ep.file, line: ep.line };
          linked++;
        }
      }
    }
    buttons.push({ id: c.id, text: c.text, event: 'onclick', handler, handlerLine: fns.get(handler)?.line ?? null, call, endpoint });
  }
  buttonCount += buttons.length;
  warningCount += warnings.length;
  screens.push({ id: form.id, file, title: form.title, group: groupOf(file), width: form.width, height: form.height,
    components: form.components, datasets: form.datasets, buttons, warnings });
}

fs.mkdirSync(path.join(out, '_data'), { recursive: true });
fs.writeFileSync(path.join(out, '_data', 'screens.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), screens }, null, 2));
console.log(`screens=${screens.length} buttons=${buttonCount} linked=${linked} warnings=${warningCount}`);
