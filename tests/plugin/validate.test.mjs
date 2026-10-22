import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { validateConflicts, validateFacts, validateFlow, validateModuleMap } from '../../plugin/scripts/lib/validate.mjs';

const CLI = path.resolve('plugin/scripts/validate-data.mjs');

const goodMap = () => ({
  project: { name: 'shop', root: '/src/shop', summary: '쇼핑몰', stacks: ['node'] },
  modules: [
    { id: 'order', abbrev: 'ORD', name: '주문', codeName: 'order', summary: '주문 처리', paths: ['src/order'], fileCount: 4, dependsOn: ['payment'] },
    { id: 'payment', abbrev: 'PAY', name: '결제', codeName: 'payment', summary: '결제 처리', paths: ['src/payment'], fileCount: 3, dependsOn: [] },
  ],
});

const goodFacts = () => ({
  module: 'order',
  items: [
    { id: 'ORD-001', kind: 'constant', summary: '최대 50개', confidence: 'high', evidence: [{ file: 'src/order/order-policy.js', line: 1, snippet: 'MAX_ITEMS_PER_ORDER = 50' }] },
  ],
});

test('valid module map passes', () => {
  assert.deepEqual(validateModuleMap(goodMap()), []);
});

test('module map errors: bad id, duplicate abbrev, unknown dependency', () => {
  const m = goodMap();
  m.modules[0].id = 'Order';
  m.modules[1].abbrev = 'ORD';
  m.modules[1].dependsOn = ['ghost'];
  const errors = validateModuleMap(m).join('\n');
  assert.match(errors, /modules\[0\]\.id: kebab-case/);
  assert.match(errors, /modules\[1\]\.abbrev: duplicate "ORD"/);
  assert.match(errors, /unknown module "ghost"/);
});

test('module basis must be a known value when present', () => {
  const m = goodMap();
  m.modules[0].basis = 'name-prefix';
  assert.deepEqual(validateModuleMap(m), []);
  m.modules[1].basis = 'guess';
  assert.match(validateModuleMap(m).join('\n'), /modules\[1\]\.basis: one of/);
});

test('facts modulePaths must be a string array when present', () => {
  const f = goodFacts();
  f.modulePaths = ['src/order'];
  assert.deepEqual(validateFacts(f), []);
  f.modulePaths = 'src/order';
  assert.match(validateFacts(f).join('\n'), /modulePaths: string array required/);
});

const goodFlow = () => ({
  id: 'loa-001',
  title: '도서 대출',
  outcome: '대출이 기록되고 도서가 대출 중이 된다',
  trigger: { kind: 'api', label: 'POST /api/loans', module: 'loan', factId: 'LOA-001' },
  actors: [{ id: 'client', kind: 'client', name: '회원' }, { id: 'loan-service', kind: 'component', name: '대출 처리' }, { id: 'db', kind: 'db', name: 'DB' }],
  steps: [
    { n: 1, from: 'client', to: 'loan-service', action: '대출 신청', call: 'LoanController.borrow', confidence: 'high', evidence: [{ file: 'a.java', line: 3, snippet: 'borrow(req)' }] },
    { n: 2, from: 'loan-service', to: 'db', action: '대출 기록 저장', data: { writes: ['loans'] }, policies: ['LOA-002'], confidence: 'high', evidence: [{ file: 'b.java', line: 9, snippet: 'loans.save' }] },
  ],
});

test('valid flow passes', () => {
  assert.deepEqual(validateFlow(goodFlow()), []);
});

test('flow errors: trigger kind, step numbering, unknown actor, empty evidence', () => {
  const f = goodFlow();
  f.trigger.kind = 'cron';
  f.steps[1].n = 3;
  f.steps[1].to = 'ghost';
  f.steps[0].evidence = [];
  const errors = validateFlow(f).join('\n');
  assert.match(errors, /trigger\.kind: one of/);
  assert.match(errors, /steps\[1\]\.n: must be 2/);
  assert.match(errors, /steps\[1\]\.to: unknown actor "ghost"/);
  assert.match(errors, /steps\[0\]\.evidence: non-empty array required/);
});

test('valid facts pass', () => {
  assert.deepEqual(validateFacts(goodFacts()), []);
});

test('facts errors: id format, kind, confidence, evidence path and line', () => {
  const f = goodFacts();
  f.items.push({ id: 'ord-2', kind: 'rule', summary: '', confidence: 'sure', evidence: [{ file: 'C:\\x\\a.js', line: 0, snippet: 'x' }] });
  const errors = validateFacts(f).join('\n');
  assert.match(errors, /items\[1\]\.id: format ABC-001/);
  assert.match(errors, /items\[1\]\.kind: one of/);
  assert.match(errors, /items\[1\]\.summary/);
  assert.match(errors, /items\[1\]\.confidence/);
  assert.match(errors, /evidence\[0\]\.file: relative posix path/);
  assert.match(errors, /evidence\[0\]\.line: integer >= 1/);
});

test('facts errors: duplicate ids and empty evidence', () => {
  const f = goodFacts();
  f.items.push({ ...f.items[0], evidence: [] });
  const errors = validateFacts(f).join('\n');
  assert.match(errors, /duplicate "ORD-001"/);
  assert.match(errors, /items\[1\]\.evidence: non-empty array/);
});

test('CLI exit codes', () => {
  const dir = makeTree({ 'ok.json': JSON.stringify(goodFacts()), 'bad.json': '{"module":"order","items":[{}]}', 'broken.json': '{' });
  const run = (kind, f) => spawnSync('node', [CLI, kind, path.join(dir, f)], { encoding: 'utf8' });
  assert.equal(run('facts', 'ok.json').status, 0);
  assert.equal(run('facts', 'bad.json').status, 1);
  assert.match(run('facts', 'broken.json').stderr, /invalid JSON/);
  assert.equal(run('nope', 'ok.json').status, 2);
});

test('facts details: fields consumed by scripts must have the right types when present', () => {
  const withDetails = (kind, details) => {
    const f = goodFacts();
    f.items[0].kind = kind;
    f.items[0].details = details;
    return validateFacts(f).join('\n');
  };
  assert.equal(withDetails('api', { method: 'POST', path: '/a', reads: ['Book'], writes: ['Loan'] }), '');
  assert.equal(withDetails('entity', { name: 'Loan', title: '대출', table: 'loans' }), '');
  assert.equal(withDetails('state-transition', { entity: 'Loan', from: 'a', to: 'b' }), '');
  assert.match(withDetails('api', { writes: 'Loan' }), /items\[0\]\.details\.writes: string array required/);
  assert.match(withDetails('api', { reads: [1] }), /items\[0\]\.details\.reads: string array required/);
  assert.match(withDetails('entity', { name: ['Loan'] }), /items\[0\]\.details\.name: string required/);
  assert.match(withDetails('entity', { name: 'Loan', title: 3 }), /items\[0\]\.details\.title: string required/);
  assert.match(withDetails('entity', { name: 'Loan', table: {} }), /items\[0\]\.details\.table: string required/);
  assert.match(withDetails('state', { entity: ['Loan'] }), /items\[0\]\.details\.entity: string required/);
  assert.match(withDetails('state-transition', { entity: 7 }), /items\[0\]\.details\.entity: string required/);
  assert.match(withDetails('api', 'POST /a'), /items\[0\]\.details: object required/);
  assert.match(withDetails('api', ['x']), /items\[0\]\.details: object required/);
});

test('verify bookkeeping fields must be well-formed when present', () => {
  const f = goodFacts();
  Object.assign(f.items[0], { confidence: 'low', originalConfidence: 'high', verifyFailed: true });
  assert.deepEqual(validateFacts(f), []);
  f.items[0].originalConfidence = 'sure';
  f.items[0].verifyFailed = 'yes';
  const errors = validateFacts(f).join('\n');
  assert.match(errors, /items\[0\]\.originalConfidence: one of high\|medium\|low required/);
  assert.match(errors, /items\[0\]\.verifyFailed: boolean required/);
  const fl = goodFlow();
  fl.steps[0].originalConfidence = 'sure';
  assert.match(validateFlow(fl).join('\n'), /steps\[0\]\.originalConfidence: one of high\|medium\|low required/);
});

test('flow optional ui fields pass', () => {
  const f = goodFlow();
  f.trigger.screen = 'MemberList';
  f.trigger.component = 'btnSearch';
  f.actors[0].layer = 'controller';
  f.steps[0].payload = { name: 'ds_member', fields: ['MEMBER_ID'] };
  f.steps[1].branch = { condition: '이미 대출 중', result: '거부' };
  f.steps.push({ n: 3, from: 'loan-service', to: 'client', action: '거부 안내', branchOf: 2, confidence: 'high', evidence: [{ file: 'a.java', line: 3, snippet: 'x' }] });
  assert.deepEqual(validateFlow(f), []);
});

test('flow optional ui field errors', () => {
  const f = goodFlow();
  f.actors[0].layer = 'view';
  f.steps[0].payload = {};
  f.steps[1].payload = { name: 'ds', fields: [1] };
  f.steps[0].branchOf = 5;
  f.steps[1].branchOf = 1;
  const errors = validateFlow(f).join('\n');
  assert.match(errors, /actors\[0\]\.layer/);
  assert.match(errors, /steps\[0\]\.payload\.name/);
  assert.match(errors, /steps\[1\]\.payload\.fields/);
  assert.match(errors, /steps\[0\]\.branchOf/);
  assert.match(errors, /steps\[1\]\.branchOf/);
});

const goodConflicts = () => ({
  generatedAt: '2026-10-19T00:00:00Z',
  conflicts: [{
    id: 'CFL-001', title: 'VIP 적립률: 화면 5%, 실제 3%', type: 'value-mismatch',
    scenario: 'VIP 회원 10만원 구매확정 → 화면 5,000P 안내, 실제 3,000P 적립', impact: 'VIP 고객이 덜 적립받는다',
    severity: 'high', confidence: 'high', status: 'open', firstSeen: '2026-10-19',
    sides: [
      { label: '화면', ruleIds: ['PNT-004'], evidence: [{ file: 'forms/PntMng.xfdl', line: 12, snippet: 'PNT_RATE' }] },
      { label: '서버', ruleIds: [], evidence: [{ file: 'pnt/PntService.java', line: 42, snippet: 'EARN_RATE_VIP = 0.03' }] },
    ],
  }],
});

test('valid conflicts pass, empty ruleIds allowed', () => {
  assert.deepEqual(validateConflicts(goodConflicts()), []);
});

test('conflicts errors', () => {
  assert.match(validateConflicts({}).join('\n'), /conflicts: array required/);
  const one = goodConflicts();
  one.conflicts[0].sides.pop();
  assert.match(validateConflicts(one).join('\n'), /conflicts\[0\]\.sides: 2 or more required/);
  const low = goodConflicts();
  low.conflicts[0].confidence = 'low';
  assert.match(validateConflicts(low).join('\n'), /conflicts\[0\]\.confidence/);
  const badId = goodConflicts();
  badId.conflicts[0].id = 'CFL-1';
  assert.match(validateConflicts(badId).join('\n'), /conflicts\[0\]\.id/);
  const dup = goodConflicts();
  dup.conflicts.push(structuredClone(dup.conflicts[0]));
  assert.match(validateConflicts(dup).join('\n'), /duplicate "CFL-001"/);
  const noEv = goodConflicts();
  noEv.conflicts[0].sides[1].evidence = [];
  assert.match(validateConflicts(noEv).join('\n'), /evidence: non-empty array required/);
  const badRule = goodConflicts();
  badRule.conflicts[0].sides[0].ruleIds = ['pnt-4'];
  assert.match(validateConflicts(badRule).join('\n'), /ruleIds/);
  const badEnum = goodConflicts();
  Object.assign(badEnum.conflicts[0], { type: 'x', severity: 'x', status: 'x' });
  const errs = validateConflicts(badEnum).join('\n');
  for (const k of ['type', 'severity', 'status']) assert.match(errs, new RegExp(`conflicts\\[0\\]\\.${k}`));
});

test('CLI validates conflicts', () => {
  const root = makeTree({ 'c.json': JSON.stringify(goodConflicts()) });
  const r = spawnSync(process.execPath, [CLI, 'conflicts', path.join(root, 'c.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /OK/);
});
