import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { snippetTokens, verifyConflicts, verifyEvidence, verifyFacts, verifyFlow } from '../../plugin/scripts/lib/verify.mjs';

const CLI = path.resolve('plugin/scripts/verify-citations.mjs');
const SRC = {
  'src/order.js': ['// order', 'export const CANCEL_WINDOW_DAYS = 7;', '', 'export function cancel(order) {', '  if (days > CANCEL_WINDOW_DAYS) throw new Error("late");', '}'].join('\n'),
};

test('snippetTokens keeps identifiers and numbers, drops keywords', () => {
  assert.deepEqual(snippetTokens('if (days > CANCEL_WINDOW_DAYS) throw new Error("late")'), ['days', 'CANCEL_WINDOW_DAYS', 'Error', 'late']);
  assert.deepEqual(snippetTokens('x = 7'), ['7']);
});

test('verifyEvidence accepts matching snippet within ±3 lines', () => {
  const root = makeTree(SRC);
  assert.deepEqual(verifyEvidence(root, { file: 'src/order.js', line: 2, snippet: 'CANCEL_WINDOW_DAYS = 7' }), { ok: true });
  assert.deepEqual(verifyEvidence(root, { file: 'src/order.js', line: 4, snippet: 'days > CANCEL_WINDOW_DAYS' }), { ok: true });
});

test('verifyEvidence reasons', () => {
  const root = makeTree(SRC);
  assert.equal(verifyEvidence(root, { file: '../etc/passwd', line: 1, snippet: '' }).reason, 'outside-root');
  assert.equal(verifyEvidence(root, { file: 'src/none.js', line: 1, snippet: '' }).reason, 'file-not-found');
  assert.equal(verifyEvidence(root, { file: 'src/order.js', line: 99, snippet: '' }).reason, 'line-out-of-range');
  assert.equal(verifyEvidence(root, { file: 'src/order.js', line: 1, snippet: 'REFUND_FEE_RATE = 0.3' }).reason, 'snippet-mismatch');
});

test('verifyFacts downgrades failed items to low', () => {
  const root = makeTree(SRC);
  const facts = {
    module: 'order',
    items: [
      { id: 'ORD-001', kind: 'constant', summary: 'a', confidence: 'low', originalConfidence: 'high', verifyFailed: true, evidence: [{ file: 'src/order.js', line: 2, snippet: 'CANCEL_WINDOW_DAYS = 7' }] },
      { id: 'ORD-002', kind: 'constant', summary: 'b', confidence: 'high', evidence: [{ file: 'src/order.js', line: 2, snippet: 'REFUND_FEE_RATE = 0.3' }] },
    ],
  };
  const { facts: out, report } = verifyFacts(root, facts);
  assert.equal(out.items[0].confidence, 'high');
  assert.equal('verifyFailed' in out.items[0], false);
  assert.equal('originalConfidence' in out.items[0], false);
  assert.equal(out.items[1].confidence, 'low');
  assert.equal(out.items[1].verifyFailed, true);
  assert.equal(out.items[1].originalConfidence, 'high');
  assert.deepEqual(report, { module: 'order', total: 2, failed: [{ id: 'ORD-002', file: 'src/order.js', line: 2, reason: 'snippet-mismatch' }] });
});

test('verifyFlow downgrades failed steps to low', () => {
  const root = makeTree(SRC);
  const flow = {
    id: 'ord-001',
    steps: [
      { n: 1, confidence: 'high', evidence: [{ file: 'src/order.js', line: 4, snippet: 'days > CANCEL_WINDOW_DAYS' }] },
      { n: 2, confidence: 'high', evidence: [{ file: 'src/none.js', line: 1, snippet: 'x' }] },
    ],
  };
  const { flow: out, report } = verifyFlow(root, flow);
  assert.equal(out.steps[0].confidence, 'high');
  assert.equal(out.steps[1].confidence, 'low');
  assert.equal(out.steps[1].verifyFailed, true);
  assert.deepEqual(report, { flow: 'ord-001', total: 2, failed: [{ step: 2, file: 'src/none.js', line: 1, reason: 'file-not-found' }] });
});

const outTree = (root, files) => makeTree({
  '_data/module-map.json': JSON.stringify({ project: { name: 'shop', root, summary: 's', stacks: ['node'] }, modules: [] }),
  ...files,
});

const flowOf = (steps) => ({
  id: 'ord-001',
  title: '주문 취소',
  outcome: '주문이 취소된다',
  trigger: { kind: 'api', label: 'POST /orders/cancel' },
  actors: [{ id: 'client', kind: 'client', name: '고객' }, { id: 'svc', kind: 'component', name: '주문 처리' }],
  steps: steps.map((s, i) => ({ n: i + 1, from: 'client', to: 'svc', action: '취소 요청', ...s })),
});

test('CLI rewrites facts and flows and writes verify-report.json', () => {
  const root = makeTree(SRC);
  const out = outTree(root, {
    '_data/facts/order.json': JSON.stringify({ module: 'order', items: [{ id: 'ORD-001', kind: 'constant', summary: 'b', confidence: 'high', evidence: [{ file: 'src/order.js', line: 1, snippet: 'NOPE_TOKEN ANOTHER' }] }] }),
    '_data/flows/ord-001.json': JSON.stringify(flowOf([{ confidence: 'high', evidence: [{ file: 'src/none.js', line: 1, snippet: 'x' }] }])),
  });
  const stdout = execFileSync('node', [CLI, root, out], { encoding: 'utf8' });
  assert.match(stdout, /modules=1 flows=1 failed=2/);
  const flow = JSON.parse(fs.readFileSync(path.join(out, '_data/flows/ord-001.json'), 'utf8'));
  assert.equal(flow.steps[0].confidence, 'low');
  const facts = JSON.parse(fs.readFileSync(path.join(out, '_data/facts/order.json'), 'utf8'));
  assert.equal(facts.items[0].confidence, 'low');
  const report = JSON.parse(fs.readFileSync(path.join(out, '_data/verify-report.json'), 'utf8'));
  assert.equal(report.failedTotal, 2);
  assert.equal(report.flows[0].flow, 'ord-001');
});

test('CLI skips invalid or unparseable facts files, lists them, and leaves no temp files', () => {
  const root = makeTree(SRC);
  const good = { module: 'order', items: [{ id: 'ORD-001', kind: 'constant', summary: 'a', confidence: 'high', evidence: [{ file: 'src/order.js', line: 2, snippet: 'CANCEL_WINDOW_DAYS = 7' }] }] };
  const bad = { module: 'payment', items: [{ id: 'PAY-001', kind: 'api', summary: 'b', confidence: 'high' }] };
  const out = outTree(root, {
    '_data/facts/order.json': JSON.stringify(good),
    '_data/facts/payment.json': JSON.stringify(bad),
    '_data/facts/zz-broken.json': '{ nope',
  });
  const r = spawnSync('node', [CLI, root, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /modules=1 flows=0 failed=0 skipped=2/);
  assert.match(r.stdout, /skipped .*payment\.json/);
  const report = JSON.parse(fs.readFileSync(path.join(out, '_data/verify-report.json'), 'utf8'));
  assert.deepEqual(report.skipped.map((s) => s.file).sort(), ['facts/payment.json', 'facts/zz-broken.json']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, '_data/facts/payment.json'), 'utf8')), bad);
  assert.deepEqual(fs.readdirSync(path.join(out, '_data/facts')).sort(), ['order.json', 'payment.json', 'zz-broken.json']);
});

test('verifyFacts restores the original confidence when a later run passes', () => {
  const root = makeTree(SRC);
  const item = (snippet) => ({ id: 'ORD-001', kind: 'constant', summary: 'a', confidence: 'medium', evidence: [{ file: 'src/order.js', line: 2, snippet }] });
  const first = verifyFacts(root, { module: 'order', items: [item('REFUND_FEE_RATE = 0.3')] }).facts.items[0];
  assert.equal(first.confidence, 'low');
  assert.equal(first.originalConfidence, 'medium');
  const again = verifyFacts(root, { module: 'order', items: [first] }).facts.items[0];
  assert.equal(again.originalConfidence, 'medium', 'a second failure keeps the first original value');
  const fixed = verifyFacts(root, { module: 'order', items: [{ ...again, evidence: item('CANCEL_WINDOW_DAYS = 7').evidence }] }).facts.items[0];
  assert.equal(fixed.confidence, 'medium');
  assert.equal('originalConfidence' in fixed, false);
  assert.equal('verifyFailed' in fixed, false);
});

test('CLI exits 2 without writing when the target is missing, differs from project.root, or no cited file exists', () => {
  const root = makeTree(SRC);
  const facts = { module: 'order', items: [{ id: 'ORD-001', kind: 'constant', summary: 'a', confidence: 'high', evidence: [{ file: 'src/order.js', line: 2, snippet: 'CANCEL_WINDOW_DAYS = 7' }] }] };
  const out = outTree(root, { '_data/facts/order.json': JSON.stringify(facts) });
  const before = fs.readFileSync(path.join(out, '_data/facts/order.json'), 'utf8');

  const missing = spawnSync('node', [CLI, path.join(root, 'nope'), out], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /not a directory/);

  const other = makeTree({ 'src/a.js': 'x' });
  const wrong = spawnSync('node', [CLI, other, out], { encoding: 'utf8' });
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /project\.root/);

  const noMap = makeTree({ '_data/facts/order.json': before });
  assert.equal(spawnSync('node', [CLI, root, noMap], { encoding: 'utf8' }).status, 2);

  const empty = makeTree({ 'README.md': 'moved' });
  const staleOut = outTree(empty, { '_data/facts/order.json': before });
  const stale = spawnSync('node', [CLI, empty, staleOut], { encoding: 'utf8' });
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /no cited file/);
  assert.equal(fs.readFileSync(path.join(staleOut, '_data/facts/order.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(staleOut, '_data/verify-report.json')), false);

  assert.equal(fs.readFileSync(path.join(out, '_data/facts/order.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(out, '_data/verify-report.json')), false);
});

const conflictOf = (id, evidence) => ({
  id, title: '취소 기간 불일치', type: 'value-mismatch', scenario: 's', impact: 'i', severity: 'high', confidence: 'high', status: 'open', firstSeen: '2026-10-19T00:00:00.000Z',
  sides: [
    { label: '화면', ruleIds: ['ORD-001'], evidence: [{ file: 'src/order.js', line: 2, snippet: 'CANCEL_WINDOW_DAYS = 7' }] },
    { label: '서버', ruleIds: [], evidence },
  ],
});

test('verifyConflicts marks a conflict unverified when one citation fails, and open again once it passes', () => {
  const root = makeTree(SRC);
  const doc = { generatedAt: 'x', conflicts: [
    conflictOf('CFL-001', [{ file: 'src/order.js', line: 4, snippet: 'days > CANCEL_WINDOW_DAYS' }]),
    conflictOf('CFL-002', [{ file: 'src/order.js', line: 1, snippet: 'REFUND_FEE_RATE = 0.3' }]),
  ] };
  const { conflicts: out, report } = verifyConflicts(root, doc);
  assert.equal(out.generatedAt, 'x');
  assert.equal(out.conflicts[0].status, 'open');
  assert.equal('verifyFailed' in out.conflicts[0], false);
  assert.equal(out.conflicts[1].status, 'unverified');
  assert.equal(out.conflicts[1].verifyFailed, true);
  assert.deepEqual(report, { total: 2, failed: [{ id: 'CFL-002', file: 'src/order.js', line: 1, reason: 'snippet-mismatch' }] });

  const fixed = { ...out.conflicts[1], sides: doc.conflicts[0].sides };
  const again = verifyConflicts(root, { ...out, conflicts: [fixed] });
  assert.equal(again.conflicts.conflicts[0].status, 'open');
  assert.equal('verifyFailed' in again.conflicts.conflicts[0], false);
  assert.deepEqual(again.report, { total: 1, failed: [] });
});

test('CLI verifies conflicts.json with the rest and reports it', () => {
  const root = makeTree(SRC);
  const doc = { generatedAt: 'x', conflicts: [conflictOf('CFL-001', [{ file: 'src/none.js', line: 1, snippet: 'x' }])] };
  const out = outTree(root, { '_data/conflicts.json': JSON.stringify(doc) });
  const r = spawnSync('node', [CLI, root, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /modules=0 flows=0 failed=1 skipped=0 conflicts=1/);
  const written = JSON.parse(fs.readFileSync(path.join(out, '_data/conflicts.json'), 'utf8'));
  assert.equal(written.conflicts[0].status, 'unverified');
  assert.equal(written.conflicts[0].verifyFailed, true);
  const report = JSON.parse(fs.readFileSync(path.join(out, '_data/verify-report.json'), 'utf8'));
  assert.equal(report.failedTotal, 1);
  assert.deepEqual(report.conflicts, { total: 1, failed: [{ id: 'CFL-001', file: 'src/none.js', line: 1, reason: 'file-not-found' }] });
});

test('CLI without conflicts.json works as before and reports conflicts=0', () => {
  const root = makeTree(SRC);
  const facts = { module: 'order', items: [{ id: 'ORD-001', kind: 'constant', summary: 'a', confidence: 'high', evidence: [{ file: 'src/order.js', line: 2, snippet: 'CANCEL_WINDOW_DAYS = 7' }] }] };
  const out = outTree(root, { '_data/facts/order.json': JSON.stringify(facts) });
  const r = spawnSync('node', [CLI, root, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /^modules=1 flows=0 failed=0 skipped=0 conflicts=0$/m);
  assert.equal(fs.existsSync(path.join(out, '_data/conflicts.json')), false);
});

test('CLI skips a broken or invalid conflicts.json, leaves it as it was, and still verifies the facts', () => {
  const root = makeTree(SRC);
  const facts = { module: 'order', items: [{ id: 'ORD-001', kind: 'constant', summary: 'a', confidence: 'high', evidence: [{ file: 'src/order.js', line: 1, snippet: 'NOPE_TOKEN ANOTHER' }] }] };
  for (const bad of ['{ nope', JSON.stringify({ conflicts: [{ id: 'CFL-1' }] })]) {
    const out = outTree(root, { '_data/facts/order.json': JSON.stringify(facts), '_data/conflicts.json': bad });
    const r = spawnSync('node', [CLI, root, out], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /failed=1 skipped=1 conflicts=0/);
    assert.match(r.stdout, /skipped conflicts\.json: /);
    assert.equal(fs.readFileSync(path.join(out, '_data/conflicts.json'), 'utf8'), bad);
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, '_data/facts/order.json'), 'utf8')).items[0].confidence, 'low');
  }
});

test('CLI counts conflict citations in the "no cited file exists" guard', () => {
  const empty = makeTree({ 'README.md': 'moved' });
  const doc = { generatedAt: 'x', conflicts: [conflictOf('CFL-001', [{ file: 'src/order.js', line: 4, snippet: 'days' }])] };
  const out = outTree(empty, { '_data/conflicts.json': JSON.stringify(doc) });
  const r = spawnSync('node', [CLI, empty, out], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no cited file/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, '_data/conflicts.json'), 'utf8')), doc);
});
