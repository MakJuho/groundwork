import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { buildRuleIndex, fileScore, parseFileRef, queryRules, renderRulesMarkdown } from '../../plugin/scripts/lib/rules.mjs';
import { renderRuleFinder } from '../../plugin/scripts/lib/rule-finder.mjs';
import { buildReport } from '../../plugin/scripts/lib/report.mjs';

const CLI = path.resolve('plugin/scripts/query-rules.mjs');
const SVC = 'src/main/java/shop/order/OrderService.java';
const ev = (line, snippet = 'code') => ({ file: SVC, line, snippet });

function sampleOut() {
  return makeTree({
    '_data/module-map.json': JSON.stringify({
      project: { name: 'shop', root: '/x', summary: 's', stacks: ['spring'] },
      modules: [{ id: 'order', abbrev: 'ORD', name: '주문 관리', codeName: 'order', summary: 's', paths: ['src'], fileCount: 1, dependsOn: [] }],
    }),
    '_data/facts/order.json': JSON.stringify({ module: 'order', items: [
      { id: 'ORD-001', kind: 'entity', summary: '주문은 주문번호로 식별한다.', confidence: 'high', evidence: [{ file: 'sql/schema.sql', line: 3, snippet: 'CREATE TABLE TB_ORDER' }],
        details: { name: 'Order', title: '주문', table: 'TB_ORDER' } },
      { id: 'ORD-004', kind: 'state-transition', summary: '주문접수 상태에서만 취소할 수 있다.', confidence: 'high', evidence: [ev(14, 'STAT_RECEIVED = "10"'), ev(33, 'if (!STAT_RECEIVED')],
        details: { entity: 'Order', from: '주문접수(10)', to: '주문취소(90)', trigger: '주문 취소' } },
      { id: 'ORD-005', kind: 'validation', summary: '선택한 주문이 없으면 취소하지 않는다.', confidence: 'low', evidence: [{ file: 'forms/OrderMng.xfdl', line: 90, snippet: 'if (nRow < 0)' }] },
      { id: 'ORD-007', kind: 'api', summary: '주문을 취소하는 API.', confidence: 'high', evidence: [{ file: 'src/main/java/shop/order/OrderController.java', line: 27, snippet: '@PostMapping' }],
        details: { method: 'POST', path: '/order/cancel.do', writes: ['Order'] } },
    ] }),
    '_data/flows/ui-order-mng-btn-cancel.json': JSON.stringify({
      id: 'ui-order-mng-btn-cancel', title: '주문 취소', outcome: 'o',
      trigger: { kind: 'ui', label: '주문 관리 · 주문 취소', module: 'order', screen: 'OrderMng', component: 'btn_cancel' },
      actors: [{ id: 'scr', kind: 'client', name: '화면' }, { id: 'svc', kind: 'component', name: '서비스' }],
      steps: [
        { n: 1, from: 'scr', to: 'scr', action: '선택 확인', confidence: 'high', evidence: [{ file: 'forms/OrderMng.xfdl', line: 90, snippet: 'x' }], policies: ['ORD-005'] },
        { n: 2, from: 'scr', to: 'svc', action: '상태 검사', call: 'OrderService.cancelOrder', confidence: 'high', evidence: [ev(33)], policies: ['ORD-004'] },
      ],
    }),
    '_data/flows/ord-007.json': JSON.stringify({
      id: 'ord-007', title: '주문 취소 API', outcome: 'o', trigger: { kind: 'api', label: 'POST /order/cancel.do', factId: 'ORD-007' },
      actors: [{ id: 'svc', kind: 'component', name: '서비스' }],
      steps: [{ n: 1, from: 'svc', to: 'svc', action: '취소', confidence: 'high', evidence: [ev(33)], policies: ['ORD-004'] }],
    }),
    '_data/screens.json': JSON.stringify({ screens: [{ id: 'OrderMng', title: '주문 관리', buttons: [{ id: 'btn_cancel', text: '주문 취소', call: { url: '/order/cancel.do' } }] }] }),
    '_data/lifecycles/order.json': JSON.stringify({ id: 'order', name: 'Order', title: '주문', table: 'TB_ORDER' }),
    'policy/order/policy.md': '# 주문 정책\n\n## 3. 업무 규칙\n\n### ORD-004 주문접수 상태에서만 취소\n- 정책: x\n\n### ORD-005 미선택 안내\n- 정책: y\n',
    'spec/order/spec.md': '# 주문 명세\n\n## 1. 개요\n\n## 2. API 목록\n\n## 3. 데이터 모델\n\n## 5. 상수와 설정값\n',
    'flows/ord-007/flow.md': '# 주문 취소 흐름\n',
  });
}

const ids = (rules) => rules.map((r) => r.id);

test('buildRuleIndex joins facts with flows, screens, endpoints and tables', () => {
  const index = buildRuleIndex(sampleOut());
  assert.deepEqual(ids(index.rules), ['ORD-001', 'ORD-004', 'ORD-005', 'ORD-007']);
  const r = index.rules.find((x) => x.id === 'ORD-004');
  assert.equal(r.moduleName, '주문 관리');
  assert.equal(r.kindLabel, '상태 전이');
  assert.equal(r.table, 'TB_ORDER');
  assert.deepEqual(r.transition, { from: '주문접수(10)', to: '주문취소(90)', trigger: '주문 취소' });
  assert.deepEqual(r.screens, ['OrderMng.btn_cancel']);
  assert.deepEqual(r.endpoints.sort(), ['/order/cancel.do']);
  assert.deepEqual(r.calls, ['OrderService.cancelOrder']);
  const ui = r.flows.find((f) => f.id === 'ui-order-mng-btn-cancel');
  assert.deepEqual([ui.buttonText, ui.url, ui.steps], ['주문 취소', '/order/cancel.do', [2]]);
  // The API fact is linked through the flow trigger and its own path, and through what it writes.
  const api = index.rules.find((x) => x.id === 'ORD-007');
  assert.deepEqual([api.api, api.entities, api.tables], ['POST /order/cancel.do', ['Order'], ['TB_ORDER']]);
  assert.deepEqual(api.flows.map((f) => f.id), ['ord-007']);
});

test('parseFileRef and fileScore', () => {
  assert.deepEqual(parseFileRef('OrderService.java:33'), { file: 'OrderService.java', line: 33 });
  assert.deepEqual(parseFileRef('src\\a\\B.java'), { file: 'src/a/B.java', line: null });
  assert.equal(parseFileRef('주문 취소'), null);
  const rule = { evidence: [ev(33)] };
  assert.equal(fileScore(rule, 'OrderService.java', 33), 3);
  assert.equal(fileScore(rule, 'OrderService.java', 35), 2);
  assert.equal(fileScore(rule, 'OrderService.java', 40), 0);
  assert.equal(fileScore(rule, 'OrderService.java'), 1);
  assert.equal(fileScore(rule, 'shop/order/OrderService.java'), 1);
  // A suffix must match whole path segments.
  assert.equal(fileScore(rule, 'derService.java'), 0);
});

test('queryRules filters by file, entity, screen, endpoint, kind and text', () => {
  const index = buildRuleIndex(sampleOut());
  assert.deepEqual(ids(queryRules(index, { file: 'OrderService.java:33' })), ['ORD-004']);
  assert.deepEqual(ids(queryRules(index, { file: 'OrderService.java', line: 15 })), ['ORD-004']);
  assert.deepEqual(ids(queryRules(index, { entity: 'tb_order' })), ['ORD-001', 'ORD-004', 'ORD-007']);
  assert.deepEqual(ids(queryRules(index, { screen: 'OrderMng' })), ['ORD-004', 'ORD-005']);
  assert.deepEqual(ids(queryRules(index, { screen: 'OrderMng.btn_cancel', kind: 'validation' })), ['ORD-005']);
  assert.deepEqual(ids(queryRules(index, { endpoint: '/order/cancel.do' })), ['ORD-004', 'ORD-005', 'ORD-007']);
  assert.deepEqual(ids(queryRules(index, { text: '취소 주문접수' })), ['ORD-004']);
  assert.deepEqual(ids(queryRules(index, { id: 'ord-005' })), ['ORD-005']);
  assert.deepEqual(ids(queryRules(index, { module: 'member' })), []);
});

test('renderRulesMarkdown lists evidence and flows', () => {
  const index = buildRuleIndex(sampleOut());
  const md = renderRulesMarkdown(queryRules(index, { id: 'ORD-004' }), { title: 't' });
  assert.match(md, /## t \(1건\)/);
  assert.match(md, /### ORD-004 주문접수 상태에서만 취소할 수 있다\./);
  assert.match(md, /`src\/main\/java\/shop\/order\/OrderService\.java:33`/);
  assert.match(md, /주문 취소 \(OrderMng\.btn_cancel "주문 취소"\) · 단계 2/);
  assert.match(renderRulesMarkdown([]), /해당하는 규칙이 없습니다/);
});

test('query-rules CLI prints markdown or JSON and checks arguments', () => {
  const out = sampleOut();
  const md = spawnSync(process.execPath, [CLI, out, '--file', 'OrderService.java:33'], { encoding: 'utf8' });
  assert.equal(md.status, 0, md.stderr);
  assert.match(md.stdout, /ORD-004/);
  const js = spawnSync(process.execPath, [CLI, out, '--screen', 'OrderMng', '--json'], { encoding: 'utf8' });
  assert.deepEqual(ids(JSON.parse(js.stdout)), ['ORD-004', 'ORD-005']);
  const text = spawnSync(process.execPath, [CLI, out, '선택한', '주문'], { encoding: 'utf8' });
  assert.match(text.stdout, /ORD-005/);
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, out, '--file'], { encoding: 'utf8' }).status, 2);
  const empty = makeTree({ '_data/module-map.json': '{}' });
  assert.equal(spawnSync(process.execPath, [CLI, empty], { encoding: 'utf8' }).status, 1);
});

test('report gets a rule finder first, with policy, spec and flow anchors', () => {
  const out = sampleOut();
  buildReport(out);
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.ok(fs.existsSync(path.join(out, '_data', 'rule-index.json')));
  const main = html.slice(html.indexOf('<main>'));
  assert.ok(main.indexOf('id="rules"') < main.indexOf('id="doc-0"'), 'finder comes before the documents');
  const data = JSON.parse(/<script type="application\/json" id="gw-rules">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal(data.rules.length, 4);
  assert.equal(data.player, true);
  for (const anchor of [data.policyAnchor['ORD-004'], data.policyAnchor['ORD-005'], data.specAnchor.order.api, data.flowAnchor['ord-007']]) {
    assert.ok(anchor && html.includes(`id="${anchor}"`), `anchor ${anchor} exists`);
  }
  assert.match(data.policyAnchor['ORD-004'], /-ord-004-/);
});

test('report has no finder when there are no facts', () => {
  const out = makeTree({ '_data/module-map.json': JSON.stringify({ project: { name: 'p' } }), 'overview/onboarding.md': '# 온보딩' });
  buildReport(out);
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /id="rules"/);
  assert.equal(renderRuleFinder({ rules: [] }), null);
});

// The page script runs the serialized rules.mjs functions; check they compile and search in isolation.
test('finder script searches by file, API path and words', () => {
  const index = buildRuleIndex(sampleOut());
  const { script, section } = renderRuleFinder(index, { player: true });
  const json = /id="gw-rules">([\s\S]*?)<\/script>/.exec(script)[1];
  const code = /<script>([\s\S]*)<\/script>$/.exec(script.trim())[1];
  const els = new Map();
  const mk = (tag) => {
    const e = { tag, children: [], attrs: {}, textContent: '', dataset: {}, listeners: {},
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      append(...k) { this.children.push(...k); }, replaceChildren(...k) { this.children = k; },
      addEventListener(t, f) { this.listeners[t] = f; }, focus() {}, scrollIntoView() {} };
    return e;
  };
  for (const id of ['rules-list', 'rules-q', 'rules-count', 'rules-mod', 'rules-kind', 'rules']) els.set(id, mk('div'));
  els.set('gw-rules', { textContent: json });
  const ctx = {
    document: { getElementById: (id) => els.get(id), createElement: mk, querySelectorAll: () => [] },
    location: { hash: '' }, addEventListener() {}, scrollTo() {}, Node: function Node() {},
  };
  ctx.Node.prototype = Object.getPrototypeOf(mk('x'));
  vm.runInNewContext(code, ctx);
  const q = els.get('rules-q');
  const search = (text) => { q.value = text; q.listeners.input(); return els.get('rules-list').children.map((c) => c.attrs.id).filter(Boolean); };
  assert.deepEqual(search('OrderService.java:33'), ['rule-ORD-004']);
  assert.deepEqual(search('/order/cancel.do'), ['rule-ORD-004', 'rule-ORD-005', 'rule-ORD-007']);
  assert.deepEqual(search('선택한 주문'), ['rule-ORD-005']);
  assert.match(els.get('rules-count').textContent, /규칙 1건 \/ 전체 4건/);
  assert.match(section, /data-q="OrderService\.java:\d+"/);
});

test('player policy chips link to the rule card in the report', async () => {
  const { renderPlayerPage } = await import('../../plugin/scripts/lib/player-page.mjs');
  const html = renderPlayerPage({ project: { name: 'p' }, screens: [], flows: [], snippets: {} });
  assert.match(html, /h\('a', \{ class: 'pol', href: 'index\.html#rule=' \+ id/);
});

test('report links to the player from the header, nav and playable flow docs', async () => {
  const out = sampleOut();
  // Without a button flow, the button that calls /order/cancel.do plays the API flow ord-007.
  fs.rmSync(path.join(out, '_data', 'flows', 'ui-order-mng-btn-cancel.json'));
  buildReport(out);
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(html, /<header class="top">.*<a class="nav-link" href="player\.html">▶ 데이터 흐름 플레이어<\/a><\/header>/);
  assert.match(html, /<details class="nav-start" open><summary>시작하기<\/summary>[^]*?<a href="#rules">규칙 찾기<\/a>\n<a href="player\.html">데이터 흐름 플레이어<\/a><\/details>/);
  assert.match(html, /<p class="play">▶ 플레이어에서 재생: <a href="player\.html#OrderMng\.btn_cancel">주문 관리 · 주문 취소<\/a><\/p><h1/);
  const noScreens = makeTree({ '_data/module-map.json': JSON.stringify({ project: { name: 'p' } }), 'overview/onboarding.md': '# 온보딩' });
  buildReport(noScreens);
  assert.doesNotMatch(fs.readFileSync(path.join(noScreens, 'index.html'), 'utf8'), /player\.html/);
});

const conflictSide = (label, ruleIds, file, line) => ({ label, ruleIds, evidence: [{ file, line, snippet: 'code' }] });
const conflict = (id, status, sides) => ({
  id, title: `${id} 충돌`, type: 'screen-server', scenario: 's', impact: 'i', severity: 'high', confidence: 'high', status, firstSeen: '2026-10-19', sides,
});

function conflictOut() {
  const out = sampleOut();
  fs.writeFileSync(path.join(out, '_data/conflicts.json'), JSON.stringify({ generatedAt: '2026-10-19T00:00:00Z', conflicts: [
    conflict('CFL-001', 'open', [conflictSide('서버', ['ORD-004'], SVC, 33), conflictSide('화면', ['ORD-005'], 'forms/OrderMng.xfdl', 90)]),
    conflict('CFL-002', 'unverified', [conflictSide('서버', ['ORD-004'], SVC, 14), conflictSide('설정', [], 'application.yml', 3)]),
  ] }));
  return out;
}

test('buildRuleIndex lists open conflicts and marks the rules they cite', () => {
  const index = buildRuleIndex(conflictOut());
  assert.deepEqual(index.conflicts.map((c) => c.id), ['CFL-001'], 'unverified conflicts stay out');
  const byId = new Map(index.rules.map((r) => [r.id, r]));
  assert.deepEqual(byId.get('ORD-004').conflicts, ['CFL-001']);
  assert.deepEqual(byId.get('ORD-005').conflicts, ['CFL-001']);
  assert.deepEqual(byId.get('ORD-007').conflicts, []);

  const plain = buildRuleIndex(sampleOut());
  assert.deepEqual(plain.conflicts, []);
  assert.ok(plain.rules.every((r) => Array.isArray(r.conflicts) && !r.conflicts.length));
  const broken = sampleOut();
  fs.writeFileSync(path.join(broken, '_data/conflicts.json'), '{ nope');
  assert.deepEqual(buildRuleIndex(broken).conflicts, []);
});

test('queryRules by file and line also returns the open conflicts cited within 3 lines', () => {
  const index = buildRuleIndex(conflictOut());
  const hit = queryRules(index, { file: 'OrderService.java:35' });
  assert.deepEqual(ids(hit), ['ORD-004'], 'the rule list is unchanged');
  assert.deepEqual(hit.conflicts.map((c) => c.id), ['CFL-001']);
  assert.deepEqual(queryRules(index, { file: 'OrderMng.xfdl', line: 90 }).conflicts.map((c) => c.id), ['CFL-001']);
  assert.deepEqual(queryRules(index, { file: 'OrderService.java', line: 14 }).conflicts, [], 'CFL-002 is unverified');
  assert.deepEqual(queryRules(index, { file: 'OrderService.java', line: 40 }).conflicts, []);
  assert.deepEqual(queryRules(index, { id: 'ORD-004' }).conflicts, []);
  assert.equal(JSON.stringify(hit), JSON.stringify([...hit]), 'JSON output of query-rules keeps its shape');
});

test('finder payload carries conflicts and rule cards link to them', () => {
  const out = conflictOut();
  buildReport(out);
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const data = JSON.parse(/<script type="application\/json" id="gw-rules">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.deepEqual(data.conflicts.map((c) => c.id), ['CFL-001']);
  const { script } = renderRuleFinder(buildRuleIndex(out), {});
  assert.match(script, /cfl-badge/);
  assert.match(script, /conflictHits/);
});
