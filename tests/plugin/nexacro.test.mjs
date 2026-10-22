import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseXfdl } from '../../plugin/scripts/lib/nexacro.mjs';

const FORMS = path.resolve('fixtures/nexacro-shop/src/main/webapp/nexacro/forms');
const read = (rel) => fs.readFileSync(path.join(FORMS, rel), 'utf8');
const byId = (r, id) => r.components.find((c) => c.id === id);

const inline = (body, size = 'width="1280" height="720"') =>
  `<FDL><Form id="T" ${size}><Layouts><Layout>${body}</Layout></Layouts></Form></FDL>`;

test('parses MemberMng form, components and datasets', () => {
  const r = parseXfdl(read('member/MemberMng.xfdl'));
  assert.equal(r.id, 'MemberMng');
  assert.equal(r.title, '회원 관리');
  assert.equal(r.width, 1280);
  assert.equal(r.height, 720);
  const save = byId(r, 'btn_save');
  assert.equal(save.type, 'Button');
  assert.deepEqual(
    { left: save.left, top: save.top, width: save.width, height: save.height, text: save.text, events: save.events },
    { left: 1184, top: 106, width: 76, height: 28, text: '저장', events: { onclick: 'btn_save_onclick' } },
  );
  assert.equal(byId(r, 'grd_member').binddataset, 'ds_member');
  const ds = r.datasets.find((d) => d.id === 'ds_member');
  assert.deepEqual(ds.columns, ['MEMBER_ID', 'MEMBER_NM', 'EMAIL', 'PHONE', 'USE_YN']);
  assert.ok(!r.components.some((c) => c.type === 'Cell' || c.type === 'Column'));
});

test('div children get absolute coordinates', () => {
  const r = parseXfdl(read('member/MemberMng.xfdl'));
  const b = byId(r, 'btn_search');
  assert.equal(b.left, 1170);
  assert.equal(b.top, 58);
  assert.equal(b.parent, 'div_search');
  assert.equal(byId(r, 'btn_save').parent, null);
});

test('nested divs add every parent offset', () => {
  const r = parseXfdl(inline(
    `<Div id="a" left="10" top="10" width="500" height="300"><Layouts><Layout>
       <Div id="b" left="5" top="7" width="200" height="100"><Layouts><Layout>
         <Button id="c" left="1" top="2" width="10" height="10"/>
       </Layout></Layouts></Div></Layout></Layouts></Div>`));
  const c = byId(r, 'c');
  assert.equal(c.left, 16);
  assert.equal(c.top, 19);
  assert.equal(c.parent, 'b');
});

test('right-anchored and percent sizes', () => {
  const p = parseXfdl(read('product/ProductMng.xfdl'));
  assert.equal(byId(p, 'btn_save').left, 1184);
  const pct = parseXfdl(inline('<Button id="x" left="0" top="0" width="50%" height="10"/>'));
  assert.equal(byId(pct, 'x').width, 640);
  const pos = parseXfdl(inline('<Button id="y" position="absolute 10 20 110 50"/>'));
  const y = byId(pos, 'y');
  assert.deepEqual([y.left, y.top, y.width, y.height], [10, 20, 100, 30]);
  const bad = parseXfdl(inline('<Button id="z" text="q"/>'));
  assert.equal(byId(bad, 'z').approx, true);
});

test('script start line points at the first CDATA line', () => {
  const text = read('member/MemberMng.xfdl');
  const r = parseXfdl(text);
  const line = text.split('\n').findIndex((l) => l.includes('include "lib::common.xjs";')) + 1;
  assert.equal(r.script.startLine, line);
  assert.ok(r.script.text.startsWith('include "lib::common.xjs";'));
  assert.equal(parseXfdl(inline('')).script, null);
});

// ---- Task 3: server call linking ----
import { listFunctions, findServerCall, parseApiUrlMap, resolveUrl } from '../../plugin/scripts/lib/nexacro.mjs';

const LIB = path.resolve('fixtures/nexacro-shop/src/main/webapp/nexacro/lib');
const memberScript = () => parseXfdl(read('member/MemberMng.xfdl')).script;

test('listFunctions reports file line numbers', () => {
  const s = memberScript();
  const fns = listFunctions(s);
  const save = fns.find((f) => f.name === 'fn_save');
  assert.ok(save.body.includes('gfn_callApi'));
  assert.equal(read('member/MemberMng.xfdl').split('\n')[save.line - 1].trim(), 'this.fn_save = function()');
});

test('finds the save call through fn_save', () => {
  const s = memberScript();
  const c = findServerCall(s, 'btn_save_onclick');
  assert.equal(c.fn, 'fn_save');
  assert.equal(c.via, 'common');
  assert.equal(c.svcKey, 'member.save');
  assert.equal(c.url, null);
  assert.deepEqual(c.inDatasets, ['ds_member']);
  assert.deepEqual(c.outDatasets, ['ds_result']);
  assert.equal(c.callback, 'fn_callback');
  assert.ok(read('member/MemberMng.xfdl').split('\n')[c.line - 1].includes('this.gfn_callApi("member.save"'));
});

test('buttons without server calls return null', () => {
  assert.equal(findServerCall(memberScript(), 'btn_add_onclick'), null);
});

test('direct transaction calls are found', () => {
  const r = parseXfdl(inline('') .replace('</Form>', '<Script type="xscript5.1"><![CDATA[\nthis.b_onclick = function(obj, e)\n{\n\tthis.transaction("s1", "svc::/a/b.do", "in=ds_a:U", "ds_b=out", "", "cb");\n};\n]]></Script></Form>'));
  const c = findServerCall(r.script, 'b_onclick');
  assert.equal(c.via, 'transaction');
  assert.equal(c.svcKey, 's1');
  assert.deepEqual(c.inDatasets, ['ds_a']);
  assert.deepEqual(c.outDatasets, ['ds_b']);
  assert.equal(c.callback, 'cb');
  assert.equal(c.line, r.script.startLine + 3);
});

test('cyclic local calls terminate', () => {
  const script = { text: 'this.a = function() { this.b(); };\nthis.b = function() { this.a(); };', startLine: 1 };
  assert.equal(findServerCall(script, 'a'), null);
});

test('apiUrl map and resolveUrl', () => {
  const map = parseApiUrlMap(fs.readFileSync(path.join(LIB, 'apiUrl.xjs'), 'utf8'));
  assert.equal(map['member.save'], '/member/save.do');
  assert.equal(Object.keys(map).length, 6);
  assert.equal(resolveUrl('member.save', map), '/member/save.do');
  assert.equal(resolveUrl('nope', map), null);
  assert.equal(resolveUrl('svc::/x.do', {}), '/x.do');
  assert.equal(resolveUrl('/y.do', {}), '/y.do');
});

test('commented-out and quoted calls are ignored', () => {
  const script = { startLine: 1, text: [
    'this.h = function() {',
    '\t// this.gfn_callApi("old.key", "a=a", "b=b", "cb");',
    '\t/* this.dead(); */',
    '\tvar s = "this.gfn_callApi(\'str.key\')";',
    '\tthis.x();',
    '};',
    'this.dead = function() { this.gfn_callApi("dead.key", "", "", "cb"); };',
    'this.x = function() { this.gfn_callApi("real.key", "i=ds_i", "ds_o=o", "cb"); };',
  ].join('\n') };
  const c = findServerCall(script, 'h');
  assert.equal(c.svcKey, 'real.key');
  assert.equal(c.fn, 'x');
  assert.equal(c.line, 8);
  const only = { startLine: 1, text: 'this.h = function() { // this.gfn_callApi("k","","","cb");\n};' };
  assert.equal(findServerCall(only, 'h'), null);
});
