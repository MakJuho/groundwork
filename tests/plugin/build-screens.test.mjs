import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';

const CLI = path.resolve('plugin/scripts/build-screens.mjs');
const FIX = path.resolve('fixtures/nexacro-shop');

function makeOut(root) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-out-'));
  fs.mkdirSync(path.join(out, '_data'));
  fs.writeFileSync(path.join(out, '_data', 'module-map.json'), JSON.stringify({
    project: { root, stacks: ['nexacro'] },
    modules: [{ id: 'm', abbrev: 'MM', name: 'm', paths: ['src'] }],
  }));
  return out;
}
const run = (out) => spawnSync('node', [CLI, out], { encoding: 'utf8' });
const readScreens = (out) => JSON.parse(fs.readFileSync(path.join(out, '_data', 'screens.json'), 'utf8')).screens;

test('builds screens.json matching expected-screens', () => {
  const out = makeOut(FIX);
  const r = run(out);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'screens=3 buttons=9 linked=6 warnings=0');
  const screens = readScreens(out);
  assert.deepEqual(screens.find((x) => x.id === 'MemberMng').datasets.find((d) => d.id === 'ds_member').columns,
    ['MEMBER_ID', 'MEMBER_NM', 'EMAIL', 'PHONE', 'USE_YN']);
  const expected = JSON.parse(fs.readFileSync(path.join(FIX, 'expected-screens.json'), 'utf8')).screens;
  for (const es of expected) {
    const s = screens.find((x) => x.id === es.id);
    assert.ok(s, es.id);
    assert.equal(s.file, es.file);
    assert.equal(s.title, es.title);
    for (const eb of es.buttons) {
      const b = s.buttons.find((x) => x.id === eb.id);
      assert.ok(b, `${es.id}.${eb.id}`);
      assert.equal(b.call?.url ?? null, eb.url);
      assert.equal(b.endpoint ? `${b.endpoint.className}.${b.endpoint.method}` : null, eb.endpoint);
      const comp = s.components.find((c) => c.id === eb.id);
      if (eb.left != null) assert.equal(comp.left, eb.left);
      if (eb.top != null) assert.equal(comp.top, eb.top);
      if (eb.inDatasets) assert.deepEqual(b.call.inDatasets, eb.inDatasets);
      if (eb.callback) assert.equal(b.call.callback, eb.callback);
    }
  }
  assert.equal(screens.find((s) => s.id === 'MemberMng').group, 'member');
});

test('buttons without calls stay listed', () => {
  const out = makeOut(FIX);
  run(out);
  const b = readScreens(out).find((s) => s.id === 'MemberMng').buttons.find((x) => x.id === 'btn_add');
  assert.equal(b.call, null);
  assert.equal(b.endpoint, null);
});

test('unknown service key is a warning', () => {
  const root = makeTree({
    'forms/a/A.xfdl': `<?xml version="1.0" encoding="utf-8"?>
<FDL version="2.1"><Form id="A" width="100" height="100" titletext="A">
<Layouts><Layout width="100" height="100"><Button id="b1" text="go" left="1" top="2" width="10" height="10" onclick="b1_onclick"/></Layout></Layouts>
<Script type="xscript5.1"><![CDATA[
this.b1_onclick = function(obj,e)
{
	this.gfn_callApi("x.unknown", "", "", "cb");
};
]]></Script></Form></FDL>`,
  });
  const out = makeOut(root);
  const r = run(out);
  assert.equal(r.status, 0, r.stderr);
  const s = readScreens(out)[0];
  assert.equal(s.buttons[0].call.url, null);
  assert.equal(s.buttons[0].endpoint, null);
  assert.equal(s.warnings.length, 1);
  assert.match(s.warnings[0], /x\.unknown/);
});

test('no screens finishes with screens=0', () => {
  const out = makeOut(makeTree({ 'a.txt': 'x' }));
  const r = run(out);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^screens=0/);
});

test('refuses output inside target', () => {
  const root = makeTree({ 'a.txt': 'x' });
  const out = path.join(root, 'out');
  fs.mkdirSync(path.join(out, '_data'), { recursive: true });
  fs.writeFileSync(path.join(out, '_data', 'module-map.json'), JSON.stringify({ project: { root } }));
  assert.equal(run(out).status, 2);
});
