import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { diffConflicts, diffFacts, diffFlows } from '../../plugin/scripts/lib/diff.mjs';

const CLI = path.resolve('plugin/scripts/diff-facts.mjs');
const CONFLICT_CLI = path.resolve('plugin/scripts/diff-conflicts.mjs');
const F = 'src/loan/LoanService.java';

const item = (id, kind, line, summary, details, snippet = 'x', extra = {}) => ({
  id, kind, summary, confidence: 'high', evidence: [{ file: F, line, snippet }], ...(details ? { details } : {}), ...extra,
});

const PREV = [
  { module: 'loan', items: [
    item('LOA-002', 'constant', 37, '한 회원은 동시에 3권까지 빌릴 수 있다', { name: 'MAX_LOANS', value: 3, unit: '권' }, 'MAX_LOANS = 3'),
    item('LOA-005', 'validation', 50, '연체 중인 회원은 빌릴 수 없다', null, 'if (member.overdue)'),
    item('LOA-009', 'validation', 60, '연체 회원 대출 금지', null, 'throw new OverdueException()'),
  ] },
  { module: 'book', items: [item('BOK-001', 'entity', 3, '도서', { name: 'Book' })] },
];

const NEXT = [
  { module: 'loan', items: [
    item('LOA-002', 'constant', 37, '한 회원은 동시에 5권까지 빌릴 수 있다', { name: 'MAX_LOANS', value: 5, unit: '권' }, 'MAX_LOANS = 5'),
    item('LOA-005', 'validation', 52, '연체 중인 회원은 빌릴 수 없다', null, 'if  (member.overdue)'),
    item('LOA-014', 'permission', 41, '골드 회원은 7권까지 빌릴 수 있다', null, 'if (member.isGold())'),
  ] },
  { module: 'book', items: [item('BOK-001', 'entity', 3, '도서', { name: 'Book' }, 'x', { confidence: 'low', originalConfidence: 'high', verifyFailed: true })] },
];

test('diffFacts separates one change, one addition and one removal by policy id', () => {
  const items = diffFacts(PREV, NEXT);
  assert.deepEqual(items.map((d) => `${d.type} ${d.id}`), ['changed LOA-002', 'changed LOA-005', 'added LOA-014', 'removed LOA-009']);
  const [ch, moved, add, rem] = items;
  assert.deepEqual(ch.fields, ['summary', 'details', 'code']);
  assert.deepEqual(ch.detailChanges, [{ path: 'value', before: 3, after: 5 }]);
  assert.equal(ch.codeChanged, true);
  assert.equal(ch.before.summary, '한 회원은 동시에 3권까지 빌릴 수 있다');
  assert.equal(ch.after.summary, '한 회원은 동시에 5권까지 빌릴 수 있다');
  assert.equal(ch.module, 'loan');
  assert.deepEqual(moved.fields, ['evidence'], 'only the line moved; whitespace in the snippet is ignored');
  assert.equal(moved.codeChanged, false);
  assert.equal(add.before, null);
  assert.equal(add.after.summary, '골드 회원은 7권까지 빌릴 수 있다');
  assert.equal(rem.after, null);
  assert.equal(rem.before.summary, '연체 회원 대출 금지');
});

test('diffFacts ignores verification fields and reports nothing when nothing changed', () => {
  assert.deepEqual(diffFacts(PREV, PREV), []);
  assert.ok(!diffFacts(PREV, NEXT).some((d) => d.id === 'BOK-001'), 'a failed citation is 확인 필요, not a policy change');
});

test('diffFacts marks a reworded summary over unchanged code as codeChanged=false', () => {
  const next = [{ module: 'loan', items: [{ ...PREV[0].items[0], summary: '회원 한 명이 동시에 빌릴 수 있는 책은 3권이다' }] }];
  const [d] = diffFacts([{ module: 'loan', items: [PREV[0].items[0]] }], next);
  assert.deepEqual(d.fields, ['summary']);
  assert.equal(d.codeChanged, false);
});

test('diffFacts reports nested detail paths and added or removed keys', () => {
  const prev = [{ module: 'loan', items: [item('LOA-001', 'api', 1, 'a', { method: 'POST', path: '/loans', auth: { role: 'USER' }, writes: ['Loan'] })] }];
  const next = [{ module: 'loan', items: [item('LOA-001', 'api', 1, 'a', { method: 'POST', path: '/loans', auth: { role: 'ADMIN' }, writes: ['Loan', 'Book'], reads: ['Member'] })] }];
  assert.deepEqual(diffFacts(prev, next)[0].detailChanges, [
    { path: 'auth.role', before: 'USER', after: 'ADMIN' },
    { path: 'reads', before: null, after: ['Member'] },
    { path: 'writes', before: ['Loan'], after: ['Loan', 'Book'] },
  ]);
});

const flow = (id, steps) => ({ id, title: `${id} 흐름`, steps: steps.map(([action, policies], i) => ({ n: i + 1, action, policies })) });

test('diffFlows compares only re-traced flows by step action and policy ids', () => {
  const prev = [flow('loa-001', [['대출 요청', []], ['연체 확인', ['LOA-009']], ['대출 기록', ['LOA-002']]]), flow('bok-001', [['등록', []]])];
  const next = [flow('loa-001', [['대출 요청', []], ['골드 회원 확인', ['LOA-014']], ['대출 기록', ['LOA-002']]]), flow('bok-001', [['등록', []], ['새 단계', []]])];
  assert.deepEqual(diffFlows(prev, next, ['loa-001']), [{
    id: 'loa-001', title: 'loa-001 흐름', status: 'changed', stepsBefore: 3, stepsAfter: 3,
    addedSteps: ['골드 회원 확인'], removedSteps: ['연체 확인'], policies: { added: ['LOA-014'], removed: ['LOA-009'] },
  }]);
  assert.equal(diffFlows(prev, prev, ['loa-001'])[0].status, 'unchanged');
  assert.equal(diffFlows([], next, ['loa-001'])[0].status, 'added');
});

function outTree(target, files) {
  return makeTree({
    '_data/module-map.json': JSON.stringify({ project: { name: 'lib', root: target, summary: 's', stacks: ['java'] }, modules: [] }),
    ...files,
  });
}

test('diff-facts CLI writes changes/<date>-<commit7>.json and policy-history.json', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const files = {};
  for (const f of PREV) files[`_data/prev/facts/${f.module}.json`] = JSON.stringify(f);
  for (const f of NEXT) files[`_data/facts/${f.module}.json`] = JSON.stringify(f);
  files['_data/policy-history.json'] = JSON.stringify({ 'BOK-001': { date: '2026-10-01', commit: '0000000', type: 'added' } });
  files['_data/prev/lifecycles/loan.json'] = JSON.stringify({ id: 'loan', writers: [] });
  files['_data/prev/lifecycles/book.json'] = JSON.stringify({ id: 'book', writers: [] });
  files['_data/prev/lifecycles/fine.json'] = JSON.stringify({ id: 'fine' });
  files['_data/lifecycles/loan.json'] = JSON.stringify({ id: 'loan', writers: [{ factId: 'LOA-014' }] });
  files['_data/lifecycles/book.json'] = JSON.stringify({ id: 'book', writers: [] });
  files['_data/lifecycles/member.json'] = JSON.stringify({ id: 'member' });
  const out = outTree(target, files);
  const r = spawnSync('node', [CLI, out, '--from', 'aaaaaaa111', '--to', 'a1b2c3d4e5f6', '--date', '2026-10-18'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /changes=2026-10-18-a1b2c3d added=1 changed=2 removed=1 modules=loan/);
  const change = JSON.parse(fs.readFileSync(path.join(out, '_data/changes/2026-10-18-a1b2c3d.json'), 'utf8'));
  assert.equal(change.from, 'aaaaaaa111');
  assert.equal(change.to, 'a1b2c3d4e5f6');
  assert.deepEqual(change.counts, { added: 1, changed: 2, removed: 1 });
  assert.deepEqual(change.modules, ['loan']);
  assert.deepEqual(change.needsReview, [{ id: 'BOK-001', module: 'book', summary: '도서' }]);
  assert.deepEqual(change.flows, []);
  assert.deepEqual(change.entities, { added: ['member'], changed: ['loan'], removed: ['fine'] });
  const history = JSON.parse(fs.readFileSync(path.join(out, '_data/policy-history.json'), 'utf8'));
  assert.deepEqual(history['LOA-002'], { date: '2026-10-18', commit: 'a1b2c3d', type: 'changed' });
  assert.deepEqual(history['LOA-009'], { date: '2026-10-18', commit: 'a1b2c3d', type: 'removed' });
  assert.equal(history['LOA-005'], undefined, 'a rule whose line only moved has not changed');
  assert.deepEqual(history['BOK-001'], { date: '2026-10-01', commit: '0000000', type: 'added' }, 'untouched ids keep their history');
});

test('diff-facts CLI refuses to run without a prev snapshot or commits', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const out = outTree(target, { '_data/facts/loan.json': JSON.stringify(NEXT[0]) });
  const r = spawnSync('node', [CLI, out, '--from', 'a', '--to', 'b'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /prev/);
  assert.equal(spawnSync('node', [CLI, out], { encoding: 'utf8' }).status, 2);
});

const cfl = (id, extra = {}) => ({
  id, title: `${id} 충돌`, type: 'screen-server', scenario: '시나리오', impact: '영향', severity: 'high', confidence: 'high', status: 'open', firstSeen: '2026-10-01',
  sides: [{ label: '화면', ruleIds: [], evidence: [{ file: 'a.xfdl', line: 1, snippet: 'x' }] }, { label: '서버', ruleIds: [], evidence: [{ file: 'B.java', line: 2, snippet: 'y' }] }],
  ...extra,
});
const cdoc = (...conflicts) => ({ generatedAt: '2026-10-19T00:00:00Z', conflicts });

test('diffConflicts finds new, resolved, changed and kept open conflicts by id', () => {
  const prev = cdoc(cfl('CFL-001'), cfl('CFL-002'), cfl('CFL-003'), cfl('CFL-006', { status: 'unverified' }));
  const next = cdoc(cfl('CFL-001'), cfl('CFL-003', { severity: 'medium', scenario: '새 시나리오' }), cfl('CFL-004', { severity: 'medium' }), cfl('CFL-005'));
  assert.deepEqual(diffConflicts(prev, next), {
    added: [{ id: 'CFL-004', title: 'CFL-004 충돌', severity: 'medium' }, { id: 'CFL-005', title: 'CFL-005 충돌', severity: 'high' }],
    resolved: [{ id: 'CFL-002', title: 'CFL-002 충돌', severity: 'high' }],
    changed: [{ id: 'CFL-003', title: 'CFL-003 충돌', fields: ['scenario', 'severity'] }],
    kept: ['CFL-001'],
    needsReview: [],
  });
});

test('diffConflicts puts an open conflict that turned unverified under needsReview, not resolved', () => {
  const d = diffConflicts(cdoc(cfl('CFL-001'), cfl('CFL-002')), cdoc(cfl('CFL-001', { status: 'unverified' })));
  assert.deepEqual(d.needsReview, [{ id: 'CFL-001', title: 'CFL-001 충돌' }]);
  assert.deepEqual(d.resolved.map((c) => c.id), ['CFL-002'], 'only a conflict that is gone is resolved');
  assert.deepEqual(d.added, []);
});

test('diffConflicts counts an unverified conflict that is open again as kept, not added', () => {
  const d = diffConflicts(cdoc(cfl('CFL-001', { status: 'unverified' })), cdoc(cfl('CFL-001'), cfl('CFL-002')));
  assert.deepEqual(d.kept, ['CFL-001']);
  assert.deepEqual(d.added.map((c) => c.id), ['CFL-002']);
  assert.deepEqual([d.resolved, d.needsReview], [[], []]);
});

test('diffConflicts treats a missing prev document as an empty list', () => {
  const d = diffConflicts(null, cdoc(cfl('CFL-001'), cfl('CFL-002')));
  assert.deepEqual(d.added.map((c) => c.id), ['CFL-001', 'CFL-002']);
  assert.deepEqual([d.resolved, d.changed, d.kept], [[], [], []]);
  assert.deepEqual(diffConflicts(undefined, undefined), { added: [], resolved: [], changed: [], kept: [], needsReview: [] });
});

test('diff-conflicts CLI adds a conflicts field to the change log', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const change = { from: 'a', to: 'b', date: '2026-10-18', items: [] };
  const out = outTree(target, {
    '_data/changes/2026-10-18-a1b2c3d.json': JSON.stringify(change),
    '_data/prev/conflicts.json': JSON.stringify(cdoc(cfl('CFL-001'), cfl('CFL-002'))),
    '_data/conflicts.json': JSON.stringify(cdoc(cfl('CFL-001', { title: '새 제목' }), cfl('CFL-003'))),
  });
  const r = spawnSync('node', [CONFLICT_CLI, out, '2026-10-18-a1b2c3d'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /added=1 resolved=1 changed=1/);
  const saved = JSON.parse(fs.readFileSync(path.join(out, '_data/changes/2026-10-18-a1b2c3d.json'), 'utf8'));
  assert.deepEqual(saved.items, [], 'the rest of the change log is kept');
  assert.deepEqual(saved.conflicts.added.map((c) => c.id), ['CFL-003']);
  assert.deepEqual(saved.conflicts.resolved.map((c) => c.id), ['CFL-002']);
  assert.deepEqual(saved.conflicts.changed, [{ id: 'CFL-001', title: '새 제목', fields: ['title'] }]);
  assert.equal(saved.conflicts.at, '2026-10-19T00:00:00Z', 'which conflicts.json this comparison is about');

  // No prev snapshot: every open conflict is new.
  fs.rmSync(path.join(out, '_data/prev/conflicts.json'));
  assert.match(spawnSync('node', [CONFLICT_CLI, out, '2026-10-18-a1b2c3d'], { encoding: 'utf8' }).stdout, /added=2 resolved=0 changed=0/);
});

test('diff-conflicts CLI leaves the change log alone when neither side has conflicts', () => {
  const target = path.join(os.tmpdir(), 'gw-target-not-here');
  const change = { from: 'a', to: 'b', date: '2026-10-18', items: [] };
  const out = outTree(target, { '_data/changes/2026-10-18-a1b2c3d.json': JSON.stringify(change) });
  const r = spawnSync('node', [CONFLICT_CLI, out, '2026-10-18-a1b2c3d'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /added=0 resolved=0 changed=0/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, '_data/changes/2026-10-18-a1b2c3d.json'), 'utf8')).conflicts, undefined);
  assert.equal(spawnSync('node', [CONFLICT_CLI, out, 'nope'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync('node', [CONFLICT_CLI, out], { encoding: 'utf8' }).status, 2);
});
