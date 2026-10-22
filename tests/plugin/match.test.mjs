import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { matchConflicts, matchFacts } from '../../plugin/scripts/lib/match.mjs';

const CLI = path.resolve('plugin/scripts/match-facts.mjs');
const CFL_CLI = path.resolve('plugin/scripts/match-conflicts.mjs');
const F = 'src/order/order-policy.js';
const S = 'src/order/order-service.js';

const item = (id, kind, file, line, summary = `${id} 규칙`, details) => ({
  id, kind, summary, confidence: 'high', evidence: [{ file, line, snippet: 'x' }], ...(details ? { details } : {}),
});

const PREV = {
  module: 'order',
  items: [
    item('ORD-001', 'constant', F, 1, '한 주문에 최대 50개까지 담을 수 있다', { name: 'MAX_ITEMS_PER_ORDER', value: 50 }),
    item('ORD-002', 'constant', F, 2, '최소 주문 금액은 10,000원이다'),
    item('ORD-003', 'validation', S, 20, '주문 상품이 없으면 주문할 수 없다'),
    item('ORD-004', 'error', S, 40, '배송이 시작된 주문은 취소할 수 없다'),
  ],
};

test('matchFacts restores previous ids when kind and evidence (same file, ±3 lines) agree', () => {
  // The agent numbered from scratch in a different order and one line shifted by 2.
  const next = {
    module: 'order',
    items: [
      item('ORD-001', 'validation', S, 22, '주문 상품이 없으면 주문할 수 없다'),
      item('ORD-002', 'constant', F, 1, '한 주문에 최대 30개까지 담을 수 있다', { name: 'MAX_ITEMS_PER_ORDER', value: 30 }),
      item('ORD-003', 'constant', F, 2, '최소 주문 금액은 10,000원이다'),
      item('ORD-004', 'error', S, 40, '배송이 시작된 주문은 취소할 수 없다'),
    ],
  };
  const { facts, report } = matchFacts(PREV, next);
  assert.deepEqual(facts.items.map((it) => it.id), ['ORD-003', 'ORD-001', 'ORD-002', 'ORD-004']);
  assert.equal(facts.items[1].summary, '한 주문에 최대 30개까지 담을 수 있다', 'only the id changes');
  assert.deepEqual(report.restored, [{ from: 'ORD-001', to: 'ORD-003' }, { from: 'ORD-002', to: 'ORD-001' }, { from: 'ORD-003', to: 'ORD-002' }]);
  assert.deepEqual(report.kept, ['ORD-004']);
  assert.deepEqual(report.retired, []);
  assert.deepEqual(report.added, []);
});

test('matchFacts does not pair rules of a different kind even at the same evidence', () => {
  const next = { module: 'order', items: [item('ORD-001', 'validation', F, 1, '수량 검사')] };
  const { facts, report } = matchFacts({ module: 'order', items: [PREV.items[0]] }, next);
  assert.equal(facts.items[0].id, 'ORD-002');
  assert.deepEqual(report.added, ['ORD-002']);
  assert.deepEqual(report.renumbered, [{ from: 'ORD-001', to: 'ORD-002' }]);
  assert.deepEqual(report.retired.map((r) => r.id), ['ORD-001']);
});

test('matchFacts picks the closest previous item when several are within ±3 lines', () => {
  const prev = { module: 'order', items: [item('ORD-001', 'constant', F, 1), item('ORD-002', 'constant', F, 3)] };
  const next = { module: 'order', items: [item('ORD-009', 'constant', F, 3), item('ORD-008', 'constant', F, 2)] };
  const { facts } = matchFacts(prev, next);
  assert.deepEqual(facts.items.map((it) => it.id), ['ORD-002', 'ORD-001']);
});

test('matchFacts prefers the same code over the nearest line when a new line shifts dense constants', () => {
  // Demo on node-shop: a constant inserted at line 2 pushed every constant below it down by one line.
  const k = (id, line, snippet, name) => ({ id, kind: 'constant', summary: name, confidence: 'high', evidence: [{ file: F, line, snippet }], details: { name } });
  const prev = { module: 'order', items: [
    k('ORD-001', 1, 'MAX_ITEMS_PER_ORDER = 50', 'MAX_ITEMS_PER_ORDER'),
    k('ORD-002', 2, 'MIN_ORDER_AMOUNT = 10000', 'MIN_ORDER_AMOUNT'),
    k('ORD-003', 3, 'FREE_SHIPPING_THRESHOLD = 50000', 'FREE_SHIPPING_THRESHOLD'),
    k('ORD-004', 4, 'SHIPPING_FEE = 3000', 'SHIPPING_FEE'),
  ] };
  const next = { module: 'order', items: [
    k('ORD-001', 2, 'MAX_ORDERS_PER_DAY = 5', 'MAX_ORDERS_PER_DAY'),
    k('ORD-002', 1, 'MAX_ITEMS_PER_ORDER = 30', 'MAX_ITEMS_PER_ORDER'),
    k('ORD-003', 3, 'MIN_ORDER_AMOUNT = 10000', 'MIN_ORDER_AMOUNT'),
    k('ORD-004', 4, 'FREE_SHIPPING_THRESHOLD = 50000', 'FREE_SHIPPING_THRESHOLD'),
    k('ORD-005', 5, 'SHIPPING_FEE = 3000', 'SHIPPING_FEE'),
  ] };
  const { facts, report } = matchFacts(prev, next);
  assert.deepEqual(facts.items.map((it) => `${it.id} ${it.details.name}`), [
    'ORD-005 MAX_ORDERS_PER_DAY', 'ORD-001 MAX_ITEMS_PER_ORDER', 'ORD-002 MIN_ORDER_AMOUNT', 'ORD-003 FREE_SHIPPING_THRESHOLD', 'ORD-004 SHIPPING_FEE',
  ]);
  assert.deepEqual(report.added, ['ORD-005']);
  assert.deepEqual(report.retired, []);
});

test('matchFacts does not pair rules that cite different names just because one moved onto the other line', () => {
  // Review finding: 10 lines inserted above; the analyzer kept both ids correctly.
  const k = (id, line, name) => ({ id, kind: 'constant', summary: name, confidence: 'high', evidence: [{ file: F, line, snippet: `${name} = 1` }], details: { name } });
  const prev = { module: 'order', items: [k('ORD-001', 10, 'MAX_QTY'), k('ORD-002', 20, 'MIN_AMOUNT')] };
  const next = { module: 'order', items: [k('ORD-001', 20, 'MAX_QTY'), k('ORD-002', 30, 'MIN_AMOUNT')] };
  const { facts, report } = matchFacts(prev, next);
  assert.deepEqual(facts.items.map((it) => it.id), ['ORD-001', 'ORD-002']);
  assert.deepEqual(report.retired, []);
});

test('matchFacts trusts the agent id for a far-moved rule of the same kind', () => {
  const next = { module: 'order', items: [item('ORD-004', 'error', S, 60, '배송이 시작된 주문은 취소할 수 없다')] };
  const { facts, report } = matchFacts({ module: 'order', items: [PREV.items[3]] }, next);
  assert.equal(facts.items[0].id, 'ORD-004');
  assert.deepEqual(report.kept, ['ORD-004']);
});

test('matchFacts numbers new rules after every previous and retired id and never reuses a retired one', () => {
  const next = {
    module: 'order',
    items: [
      item('ORD-001', 'constant', F, 1),
      item('ORD-006', 'permission', S, 90, '관리자만 환불할 수 있다'), // agent reused a retired number
      item('ORD-002', 'calculation', S, 70, '배송비 계산'), // collides with a previous id of another rule
    ],
  };
  const { facts, report } = matchFacts(PREV, next, { retired: ['ORD-006'] });
  assert.deepEqual(facts.items.map((it) => it.id), ['ORD-001', 'ORD-007', 'ORD-008']);
  assert.deepEqual(report.added, ['ORD-007', 'ORD-008']);
  assert.deepEqual(report.retired.map((r) => r.id), ['ORD-002', 'ORD-003', 'ORD-004']);
  assert.deepEqual(report.retired[0], { id: 'ORD-002', kind: 'constant', summary: '최소 주문 금액은 10,000원이다' });
});

test('matchFacts keeps the previous abbrev when the agent used another prefix', () => {
  const next = { module: 'order', items: [item('ODR-001', 'constant', F, 2), item('ODR-002', 'state', S, 99)] };
  const { facts } = matchFacts(PREV, next, { abbrev: 'ODR' });
  assert.deepEqual(facts.items.map((it) => it.id), ['ORD-002', 'ORD-005']);
});

function outTree(target, files = {}) {
  return makeTree({
    '_data/module-map.json': JSON.stringify({ project: { name: 'shop', root: target, summary: 's', stacks: ['node'] }, modules: [{ id: 'order', abbrev: 'ORD' }] }),
    ...files,
  });
}

test('match-facts CLI rewrites facts and appends newly retired ids to retired-ids.json without duplicates', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const next = { module: 'order', items: [item('ORD-001', 'constant', F, 2), item('ORD-002', 'state', S, 99)] };
  const out = outTree(target, {
    '_data/prev/facts/order.json': JSON.stringify(PREV),
    '_data/facts/order.json': JSON.stringify(next),
    '_data/retired-ids.json': JSON.stringify({ retired: [{ id: 'ORD-003', module: 'order', kind: 'validation', summary: 'old', retiredAt: '2026-01-01T00:00:00.000Z' }] }),
  });
  const r = spawnSync('node', [CLI, out, 'order'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /kept=0 restored=1 renumbered=1 added=1 retired=3/);
  const facts = JSON.parse(fs.readFileSync(path.join(out, '_data/facts/order.json'), 'utf8'));
  assert.deepEqual(facts.items.map((it) => it.id), ['ORD-002', 'ORD-005']);
  const retired = JSON.parse(fs.readFileSync(path.join(out, '_data/retired-ids.json'), 'utf8')).retired;
  assert.deepEqual(retired.map((x) => x.id), ['ORD-003', 'ORD-001', 'ORD-004']);
  assert.ok(retired.every((x) => x.module === 'order' && x.retiredAt));
});

test('match-facts CLI takes an id back out of retired-ids.json when a retry keeps it', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const out = outTree(target, {
    '_data/prev/facts/order.json': JSON.stringify(PREV),
    '_data/facts/order.json': JSON.stringify(PREV),
    '_data/retired-ids.json': JSON.stringify({ retired: [
      { id: 'ORD-004', module: 'order', kind: 'error', summary: 'x', retiredAt: '2026-01-01T00:00:00.000Z' },
      { id: 'ORD-009', module: 'order', kind: 'error', summary: 'gone for real', retiredAt: '2026-01-01T00:00:00.000Z' },
    ] }),
  });
  const r = spawnSync('node', [CLI, out, 'order'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const retired = JSON.parse(fs.readFileSync(path.join(out, '_data/retired-ids.json'), 'utf8')).retired;
  assert.deepEqual(retired.map((x) => x.id), ['ORD-009']);
});

test('match-facts CLI leaves a first analysis alone and refuses an output inside the target', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const out = outTree(target, { '_data/facts/order.json': JSON.stringify(PREV) });
  const r = spawnSync('node', [CLI, out, 'order'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /prev=none/);
  assert.equal(fs.existsSync(path.join(out, '_data/retired-ids.json')), false);

  const t2 = makeTree({ 'a.js': 'x' });
  const inside = path.join(t2, 'gw');
  fs.mkdirSync(path.join(inside, '_data'), { recursive: true });
  fs.writeFileSync(path.join(inside, '_data/module-map.json'), JSON.stringify({ project: { name: 't', root: t2, summary: 's', stacks: ['x'] }, modules: [] }));
  assert.equal(spawnSync('node', [CLI, inside, 'order'], { encoding: 'utf8' }).status, 2);
});

test('match-facts --snapshot copies the current facts to prev, replacing an old snapshot', () => {
  // A snapshot left from an earlier run is stale: matching against it would renumber rules added since.
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const out = outTree(target, { '_data/facts/order.json': JSON.stringify(PREV), '_data/prev/facts/order.json': '{"module":"order","items":[]}' });
  const prevFile = path.join(out, '_data/prev/facts/order.json');
  const r = spawnSync('node', [CLI, out, 'order', '--snapshot'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /snapshot=created/);
  assert.deepEqual(JSON.parse(fs.readFileSync(prevFile, 'utf8')), PREV);

  const fresh = outTree(target);
  assert.match(spawnSync('node', [CLI, fresh, 'order', '--snapshot'], { encoding: 'utf8' }).stdout, /snapshot=none/);
});

test('match-facts CLI exits 2 on facts of another module', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const out = outTree(target, {
    '_data/prev/facts/order.json': JSON.stringify(PREV),
    '_data/facts/order.json': JSON.stringify({ ...PREV, module: 'payment' }),
  });
  const r = spawnSync('node', [CLI, out, 'order'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /module/);
});

// Conflicts (CFL-nnn): the agent's id when it shares a file or rule with that previous conflict; else the
// same type sharing a rule id and a cited file, or evidence overlapping (±3 lines) in 2+ files.
const SCREEN = 'src/main/webapp/forms/OrdMng.xfdl';
const PNT_SCREEN = 'src/main/webapp/forms/PntMng.xfdl';
const SERVER = 'src/main/java/OrdService.java';
const BATCH = 'src/main/java/StlBatch.java';
const side = (label, ruleIds, ...ev) => ({ label, ruleIds, evidence: ev.map(([file, line]) => ({ file, line, snippet: 'x' })) });
const conflict = (id, type, sides, title = `${id} 충돌`) => ({
  id, title, type, scenario: 's', impact: 'i', severity: 'high', confidence: 'high', status: 'open', firstSeen: 'agent', sides,
});
const PREV_CFL = { generatedAt: 'a', conflicts: [
  conflict('CFL-001', 'screen-server', [side('화면', ['ORD-004'], [SCREEN, 10]), side('서버', ['ORD-007'], [SERVER, 20])], '취소 가능 상태 불일치'),
  conflict('CFL-002', 'cross-module-timing', [side('클레임', [], [SERVER, 50]), side('정산', [], [BATCH, 30])], '반품 기간과 정산 시점'),
  conflict('CFL-003', 'value-mismatch', [side('화면', ['PNT-001'], [PNT_SCREEN, 80]), side('설정', [], ['src/main/resources/application.yml', 5])], '포인트 한도'),
].map((c, i) => ({ ...c, firstSeen: `seen-${i + 1}` })) };

test('matchConflicts keeps the id and firstSeen of a conflict whose evidence lines shifted by 2 (no rule ids)', () => {
  const next = { generatedAt: 'b', conflicts: [
    conflict('CFL-003', 'value-mismatch', [side('클레임', [], [SERVER, 52]), side('정산', [], [BATCH, 32])], '반품 기간과 정산 시점'),
  ] };
  const { doc, report } = matchConflicts(PREV_CFL, next, { seen: 'now' });
  assert.equal(doc.generatedAt, 'b');
  assert.equal(doc.conflicts[0].id, 'CFL-002');
  assert.equal(doc.conflicts[0].firstSeen, 'seen-2');
  assert.equal(doc.conflicts[0].type, 'value-mismatch', 'only id and firstSeen change');
  assert.deepEqual(report.restored, [{ from: 'CFL-003', to: 'CFL-002' }]);
  assert.deepEqual(report.kept, []);
  assert.deepEqual(report.added, []);
  assert.deepEqual(report.retired, [{ id: 'CFL-001', title: '취소 가능 상태 불일치' }, { id: 'CFL-003', title: '포인트 한도' }]);
});

test('matchConflicts restores ids the agent swapped and pairs by shared rule ids of the same type', () => {
  const next = { generatedAt: 'b', conflicts: [
    conflict('CFL-001', 'value-mismatch', [side('화면', ['PNT-001'], [PNT_SCREEN, 200]), side('설정', [], ['other.yml', 1])]),
    conflict('CFL-003', 'screen-server', [side('화면', ['ORD-004'], [SCREEN, 11]), side('서버', ['ORD-007'], [SERVER, 21])]),
    conflict('CFL-002', 'cross-module-timing', [side('클레임', [], [SERVER, 50]), side('정산', [], [BATCH, 30])]),
  ] };
  const { doc, report } = matchConflicts(PREV_CFL, next, { seen: 'now' });
  assert.deepEqual(doc.conflicts.map((c) => c.id), ['CFL-003', 'CFL-001', 'CFL-002']);
  assert.deepEqual(doc.conflicts.map((c) => c.firstSeen), ['seen-3', 'seen-1', 'seen-2']);
  assert.deepEqual(report.restored, [{ from: 'CFL-001', to: 'CFL-003' }, { from: 'CFL-003', to: 'CFL-001' }]);
  assert.deepEqual(report.kept, ['CFL-002']);
  assert.deepEqual(report.retired, []);
});

test('matchConflicts does not pair on a shared rule id when the type differs, nor on evidence in one file only', () => {
  const next = { generatedAt: 'b', conflicts: [
    conflict('CFL-901', 'calculation-mismatch', [side('화면', ['ORD-004'], [SCREEN, 10]), side('서버', [], ['src/elsewhere.java', 1])]),
  ] };
  const { doc, report } = matchConflicts(PREV_CFL, next, { seen: 'now' });
  assert.equal(doc.conflicts[0].id, 'CFL-004');
  assert.equal(doc.conflicts[0].firstSeen, 'now');
  assert.deepEqual(report.added, ['CFL-004']);
  assert.equal(report.retired.length, 3);
});

test('matchConflicts never reuses a retired number and pairs the highest score first', () => {
  const prev = { generatedAt: 'a', conflicts: [PREV_CFL.conflicts[0]] };
  const next = { generatedAt: 'b', conflicts: [
    // Shares one rule id and one cited file only.
    conflict('CFL-007', 'screen-server', [side('화면', ['ORD-004'], [SCREEN, 300]), side('서버', [], ['x.java', 1])]),
    // Shares both rule ids and both evidence lines: this one is the same conflict.
    conflict('CFL-008', 'screen-server', [side('화면', ['ORD-004'], [SCREEN, 10]), side('서버', ['ORD-007'], [SERVER, 20])]),
  ] };
  const { doc, report } = matchConflicts(prev, next, { retired: ['CFL-004'], seen: 'now' });
  assert.deepEqual(doc.conflicts.map((c) => c.id), ['CFL-005', 'CFL-001']);
  assert.deepEqual(report.added, ['CFL-005']);
  assert.deepEqual(report.restored, [{ from: 'CFL-008', to: 'CFL-001' }]);
  assert.equal(doc.conflicts[0].firstSeen, 'now');
});

test('matchConflicts keeps an agent id that shares a cited file or a rule id with the previous conflict of that id', () => {
  const next = { generatedAt: 'b', conflicts: [
    // Scores higher against CFL-001, but the agent kept CFL-002 and it still cites the batch file.
    conflict('CFL-002', 'screen-server', [side('화면', ['ORD-004'], [SCREEN, 10]), side('서버', ['ORD-007'], [SERVER, 20]), side('정산', [], [BATCH, 99])]),
    // Shares only the rule id PNT-001 with CFL-003.
    conflict('CFL-003', 'calculation-mismatch', [side('화면', ['PNT-001'], ['a.xfdl', 1]), side('서버', [], ['b.java', 1])]),
  ] };
  const { doc, report } = matchConflicts(PREV_CFL, next, { seen: 'now' });
  assert.deepEqual(doc.conflicts.map((c) => [c.id, c.firstSeen]), [['CFL-002', 'seen-2'], ['CFL-003', 'seen-3']]);
  assert.deepEqual(report.kept, ['CFL-002', 'CFL-003']);
  assert.deepEqual(report.retired, [{ id: 'CFL-001', title: '취소 가능 상태 불일치' }]);

  // The same id with nothing in common is not trusted.
  const unrelated = { conflicts: [conflict('CFL-002', 'value-mismatch', [side('a', [], ['a.xfdl', 1]), side('b', [], ['b.java', 1])])] };
  assert.deepEqual(matchConflicts(PREV_CFL, unrelated, { seen: 'now' }).report.added, ['CFL-004']);
});

test('matchConflicts needs a shared cited file besides a shared rule id (a hub rule alone is not the same conflict)', () => {
  const prev = { conflicts: [conflict('CFL-001', 'value-mismatch', [side('a', ['ORD-001'], ['a.java', 1]), side('b', [], ['b.java', 1])])] };
  const hub = { conflicts: [conflict('CFL-901', 'value-mismatch', [side('c', ['ORD-001'], ['c.java', 1]), side('d', [], ['d.java', 1])])] };
  assert.deepEqual(matchConflicts(prev, hub, { seen: 'now' }).report.added, ['CFL-002']);
  const sameFile = { conflicts: [conflict('CFL-901', 'value-mismatch', [side('c', ['ORD-001'], ['a.java', 90]), side('d', [], ['d.java', 1])])] };
  assert.deepEqual(matchConflicts(prev, sameFile, { seen: 'now' }).report.restored, [{ from: 'CFL-901', to: 'CFL-001' }]);
});

test('match-conflicts CLI matches against the snapshot and appends retired ids to retired-conflicts.json', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const next = { generatedAt: 'b', conflicts: [
    conflict('CFL-001', 'screen-server', [side('화면', ['ORD-004'], [SCREEN, 12]), side('서버', ['ORD-007'], [SERVER, 22])]),
    conflict('CFL-002', 'value-mismatch', [side('화면', [], ['a.xfdl', 1]), side('서버', [], ['b.java', 1])], '새 충돌'),
  ] };
  const out = outTree(target, {
    '_data/prev/conflicts.json': JSON.stringify(PREV_CFL),
    '_data/conflicts.json': JSON.stringify(next),
    '_data/retired-conflicts.json': JSON.stringify({ retired: [{ id: 'CFL-004', title: 'old', retiredAt: '2026-01-01T00:00:00.000Z' }] }),
  });
  const r = spawnSync('node', [CFL_CLI, out, '--seen', 'abc1234'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /kept=1 restored=0 added=1 retired=2/);
  const doc = JSON.parse(fs.readFileSync(path.join(out, '_data/conflicts.json'), 'utf8'));
  assert.deepEqual(doc.conflicts.map((c) => [c.id, c.firstSeen]), [['CFL-001', 'seen-1'], ['CFL-005', 'abc1234']]);
  const retired = JSON.parse(fs.readFileSync(path.join(out, '_data/retired-conflicts.json'), 'utf8')).retired;
  assert.deepEqual(retired.map((x) => [x.id, x.title]), [['CFL-004', 'old'], ['CFL-002', '반품 기간과 정산 시점'], ['CFL-003', '포인트 한도']]);
  assert.ok(retired.every((x) => x.retiredAt));
});

test('match-conflicts CLI without a snapshot only fills firstSeen', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const out = outTree(target, { '_data/conflicts.json': JSON.stringify(PREV_CFL) });
  const r = spawnSync('node', [CFL_CLI, out, '--seen', 'first-run'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /prev=none/);
  const doc = JSON.parse(fs.readFileSync(path.join(out, '_data/conflicts.json'), 'utf8'));
  assert.deepEqual(doc.conflicts.map((c) => [c.id, c.firstSeen]), [['CFL-001', 'first-run'], ['CFL-002', 'first-run'], ['CFL-003', 'first-run']]);
  assert.equal(fs.existsSync(path.join(out, '_data/retired-conflicts.json')), false);

  const noSeen = outTree(target, { '_data/conflicts.json': JSON.stringify(PREV_CFL) });
  assert.equal(spawnSync('node', [CFL_CLI, noSeen], { encoding: 'utf8' }).status, 0);
  const iso = JSON.parse(fs.readFileSync(path.join(noSeen, '_data/conflicts.json'), 'utf8')).conflicts[0].firstSeen;
  assert.ok(!Number.isNaN(Date.parse(iso)), 'defaults to the current ISO time');
});

test('match-conflicts --snapshot copies conflicts.json to prev, or removes a stale snapshot', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const out = outTree(target, { '_data/conflicts.json': JSON.stringify(PREV_CFL), '_data/prev/conflicts.json': '{"conflicts":[]}' });
  const r = spawnSync('node', [CFL_CLI, out, '--snapshot'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /snapshot=created/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, '_data/prev/conflicts.json'), 'utf8')), PREV_CFL);

  const fresh = outTree(target, { '_data/prev/conflicts.json': '{"conflicts":[]}' });
  assert.match(spawnSync('node', [CFL_CLI, fresh, '--snapshot'], { encoding: 'utf8' }).stdout, /snapshot=none/);
  assert.equal(fs.existsSync(path.join(fresh, '_data/prev/conflicts.json')), false);
});

test('match-conflicts CLI exits 2 on an invalid conflicts.json and leaves it alone', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const bad = JSON.stringify({ conflicts: [{ id: 'CFL-1' }] });
  const out = outTree(target, { '_data/prev/conflicts.json': JSON.stringify(PREV_CFL), '_data/conflicts.json': bad });
  const r = spawnSync('node', [CFL_CLI, out], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /conflicts\.json/);
  assert.equal(fs.readFileSync(path.join(out, '_data/conflicts.json'), 'utf8'), bad);
  assert.equal(spawnSync('node', [CFL_CLI, outTree(target, { '_data/conflicts.json': '{ nope' })], { encoding: 'utf8' }).status, 2);
});

test('match-conflicts CLI without a snapshot renumbers temporary ids (CFL-900 and up) past the retired ones', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const [a, b, c] = PREV_CFL.conflicts;
  const out = outTree(target, {
    '_data/conflicts.json': JSON.stringify({ conflicts: [{ ...b, id: 'CFL-950' }, a, { ...c, id: 'CFL-901' }] }),
    '_data/retired-conflicts.json': JSON.stringify({ retired: [{ id: 'CFL-004', title: 'old', retiredAt: '2026-01-01T00:00:00.000Z' }] }),
  });
  const r = spawnSync('node', [CFL_CLI, out, '--seen', 'first-run'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /prev=none/);
  const doc = JSON.parse(fs.readFileSync(path.join(out, '_data/conflicts.json'), 'utf8'));
  assert.deepEqual(doc.conflicts.map((x) => [x.id, x.title]), [['CFL-005', b.title], ['CFL-001', a.title], ['CFL-006', c.title]]);
});

test('match-conflicts CLI treats an invalid snapshot as none and an unreadable retired file as empty, with a warning', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  for (const prev of ['{ nope', JSON.stringify({ conflicts: [{ id: 'CFL-1' }] })]) {
    const out = outTree(target, { '_data/conflicts.json': JSON.stringify(PREV_CFL), '_data/prev/conflicts.json': prev });
    const r = spawnSync('node', [CFL_CLI, out, '--seen', 'first-run'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /prev=none/);
    assert.match(r.stderr, /WARN .*prev/);
    const doc = JSON.parse(fs.readFileSync(path.join(out, '_data/conflicts.json'), 'utf8'));
    assert.deepEqual(doc.conflicts.map((c) => c.firstSeen), ['first-run', 'first-run', 'first-run']);
  }

  const out = outTree(target, {
    '_data/conflicts.json': JSON.stringify(PREV_CFL),
    '_data/prev/conflicts.json': JSON.stringify(PREV_CFL),
    '_data/retired-conflicts.json': '{ nope',
  });
  const r = spawnSync('node', [CFL_CLI, out, '--seen', 'abc1234'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /WARN .*retired-conflicts\.json/);
  assert.match(r.stdout, /kept=3 restored=0 added=0 retired=0/);
});

test('match-conflicts --snapshot does not keep an invalid conflicts.json as the snapshot', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  for (const bad of ['{ nope', JSON.stringify({ conflicts: [{ id: 'CFL-1' }] })]) {
    const out = outTree(target, { '_data/conflicts.json': bad, '_data/prev/conflicts.json': JSON.stringify(PREV_CFL) });
    const r = spawnSync('node', [CFL_CLI, out, '--snapshot'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /snapshot=none/);
    assert.equal(fs.existsSync(path.join(out, '_data/prev/conflicts.json')), false);
  }
});

test('match-conflicts CLI stamps generatedAt with the current time on every run', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const before = Date.now();
  for (const files of [{}, { '_data/prev/conflicts.json': JSON.stringify(PREV_CFL) }]) {
    const out = outTree(target, { '_data/conflicts.json': JSON.stringify(PREV_CFL), ...files });
    assert.equal(spawnSync('node', [CFL_CLI, out, '--seen', 'x'], { encoding: 'utf8' }).status, 0);
    const at = JSON.parse(fs.readFileSync(path.join(out, '_data/conflicts.json'), 'utf8')).generatedAt;
    assert.ok(Date.parse(at) >= before - 1000 && new Date(at).toISOString() === at, `fresh ISO time, got ${at}`);
  }
});
