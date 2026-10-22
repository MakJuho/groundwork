import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { buildRuleDigest, layerOf } from '../../plugin/scripts/lib/conflicts.mjs';

const CLI = path.resolve('plugin/scripts/build-rule-digest.mjs');

test('layerOf classifies files by path, extension and content', () => {
  assert.equal(layerOf('src/main/webapp/nexacro/forms/pnt/PntMng.xfdl'), 'screen');
  assert.equal(layerOf('src/main/resources/application.yml'), 'config');
  assert.equal(layerOf('src/main/resources/application-prod.properties'), 'config');
  assert.equal(layerOf('src/main/resources/sql/data/cmm_code.sql'), 'config');
  assert.equal(layerOf('src/main/resources/sql/procedure/SP_X.sql'), 'db');
  assert.equal(layerOf('src/main/resources/mapper/stl/StlMapper.xml'), 'db');
  assert.equal(layerOf('src/main/java/X.java', '@Scheduled(cron = "0 0 1 * * *")'), 'batch');
  assert.equal(layerOf('src/main/java/X.java'), 'server');
  assert.equal(layerOf('web/src/Order.vue'), 'screen');
  assert.equal(layerOf('README.md'), 'other');
});

const item = (id, summary, files, extra = {}) => ({
  id, kind: 'constant', summary, confidence: 'high',
  evidence: files.map((file, i) => ({ file, line: i + 1, snippet: 'x' })), ...extra,
});

test('buildRuleDigest flags a rule whose evidence spans screen and server', () => {
  const facts = [{ module: 'pnt', items: [
    item('PNT-001', 'VIP 적립률', ['src/main/webapp/nexacro/forms/pnt/PntMng.xfdl', 'src/main/java/pnt/PntService.java']),
  ] }];
  const { rules, signals } = buildRuleDigest({ facts, moduleMap: null, readText: () => '' });
  assert.deepEqual(rules[0], {
    id: 'PNT-001', module: 'pnt', kind: 'constant', summary: 'VIP 적립률', confidence: 'high',
    files: ['src/main/webapp/nexacro/forms/pnt/PntMng.xfdl', 'src/main/java/pnt/PntService.java'], layers: ['screen', 'server'],
  });
  assert.deepEqual(signals.map((s) => [s.type, s.ruleIds]), [['cross-layer', ['PNT-001']]]);
  assert.ok(signals[0].reason);
});

test('buildRuleDigest flags config + batch and reads text for @Scheduled', () => {
  const facts = [{ module: 'stl', items: [
    item('STL-001', '정산 확정', ['src/main/resources/application.yml', 'src/main/java/stl/StlBatch.java']),
  ] }];
  const readText = (f) => (f.endsWith('StlBatch.java') ? '@Scheduled(cron = "x")' : '');
  const { rules, signals } = buildRuleDigest({ facts, moduleMap: null, readText });
  assert.deepEqual(rules[0].layers, ['batch', 'config']);
  assert.deepEqual(signals.map((s) => s.type), ['cross-layer']);
});

test('buildRuleDigest pairs screen-only and server-only rules of one module sharing a number', () => {
  const facts = [{ module: 'clm', items: [
    item('CLM-001', '화면: 반품은 7일 이내', ['forms/clm/ClmMng.xfdl']),
    item('CLM-002', '서버: 반품 기한 7일', ['src/clm/ClmServiceImpl.java']),
    item('CLM-003', '서버: 최대 3개', ['src/clm/ClmServiceImpl.java']),
  ] }];
  const { signals } = buildRuleDigest({ facts, readText: () => '' });
  assert.deepEqual(signals.map((s) => [s.type, s.ruleIds]), [['cross-layer', ['CLM-001', 'CLM-002']]]);
});

test('buildRuleDigest flags the same number+unit across modules', () => {
  const facts = [
    { module: 'clm', items: [item('CLM-001', '배송완료 후 7일 이내 반품', ['src/clm/A.java'])] },
    { module: 'stl', items: [item('STL-001', '정산은 7일 뒤 확정', ['src/stl/B.java']), item('STL-002', '1,000원 이상', ['src/stl/B.java'])] },
    { module: 'pnt', items: [item('PNT-001', '1000원 단위 적립', ['src/pnt/C.java'])] },
  ];
  const { signals } = buildRuleDigest({ facts, readText: () => '' });
  const shared = signals.filter((s) => s.type === 'shared-number');
  assert.deepEqual(shared.map((s) => s.ruleIds), [['CLM-001', 'STL-001'], ['PNT-001', 'STL-002']]);
  assert.ok(shared.find((s) => s.ruleIds.includes('CLM-001')).reason.includes('7일'));
});

test('buildRuleDigest ignores a number shared by more than 6 rules', () => {
  const facts = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((m, i) => ({
    module: m, items: [item(`${m.toUpperCase()}X-00${i + 1}`, '보관 30일', [`src/${m}/X.java`])],
  }));
  const { signals } = buildRuleDigest({ facts, readText: () => '' });
  assert.deepEqual(signals, []);
});

test('buildRuleDigest drops verifyFailed rules and keeps low confidence ones', () => {
  const facts = [
    { module: 'clm', items: [item('CLM-001', '7일', ['src/clm/A.java'], { confidence: 'low' })] },
    { module: 'stl', items: [item('STL-001', '7일', ['src/stl/B.java'], { confidence: 'low', verifyFailed: true })] },
  ];
  const { rules, signals } = buildRuleDigest({ facts, readText: () => '' });
  assert.deepEqual(rules.map((r) => r.id), ['CLM-001']);
  assert.deepEqual(signals, []);
});

test('buildRuleDigest groups state/validation rules about one entity across modules', () => {
  const facts = [
    { module: 'ord', items: [
      item('ORD-001', '주문접수에서만 취소', ['src/ord/A.java'], { kind: 'state-transition', details: { entity: 'Order' } }),
      item('ORD-002', '주문 상수', ['src/ord/A.java'], { details: { entity: 'Order' } }),
    ] },
    { module: 'clm', items: [item('CLM-001', '배송완료 주문만 반품', ['src/clm/B.java'], { kind: 'validation', details: { entity: 'Order' } })] },
  ];
  const { rules, signals } = buildRuleDigest({ facts, readText: () => '' });
  assert.equal(rules.find((r) => r.id === 'ORD-001').entity, 'Order');
  assert.deepEqual(signals.filter((s) => s.type === 'same-entity').map((s) => s.ruleIds), [['CLM-001', 'ORD-001']]);
});

test('build-rule-digest CLI writes _data/rule-digest.json', () => {
  const target = makeTree({ 'src/stl/StlBatch.java': '@Scheduled(cron = "0 0 1 * * *")\nclass StlBatch {}\n' });
  const out = makeTree({
    '_data/module-map.json': JSON.stringify({ project: { name: 'x', root: target, summary: 's', stacks: ['spring'] }, modules: [] }),
    '_data/facts/stl.json': JSON.stringify({ module: 'stl', items: [
      item('STL-001', '정산은 5영업일 뒤 확정', ['src/main/resources/application.yml', 'src/stl/StlBatch.java']),
    ] }),
  });
  const r = spawnSync('node', [CLI, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'rules=1 signals=1');
  const doc = JSON.parse(fs.readFileSync(path.join(out, '_data', 'rule-digest.json'), 'utf8'));
  assert.ok(doc.generatedAt);
  assert.deepEqual(doc.rules[0].layers, ['batch', 'config']);
  assert.equal(spawnSync('node', [CLI], { encoding: 'utf8' }).status, 2);
});

test('build-rule-digest CLI refuses an output inside the target', () => {
  const target = makeTree({ 'a.txt': 'x' });
  const out = path.join(target, 'out');
  fs.mkdirSync(path.join(out, '_data'), { recursive: true });
  fs.writeFileSync(path.join(out, '_data', 'module-map.json'), JSON.stringify({ project: { root: target } }));
  assert.equal(spawnSync('node', [CLI, out], { encoding: 'utf8' }).status, 2);
});
