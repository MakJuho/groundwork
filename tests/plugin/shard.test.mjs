import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { planShards, shardLimits, shardModules, stemKey } from '../../plugin/scripts/lib/shard.mjs';
import { mergeFactsParts } from '../../plugin/scripts/lib/merge-facts.mjs';

const RESOLVE = path.resolve('plugin/scripts/resolve-modules.mjs');
const MERGE = path.resolve('plugin/scripts/merge-facts.mjs');

test('stemKey ignores layer suffixes so one business name stays together', () => {
  for (const f of ['c/LoanController.java', 's/LoanService.java', 's/LoanServiceImpl.java', 'r/LoanRepository.java', 'm/Loan.java', 'd/LoanDto.java']) assert.equal(stemKey(f), 'loan', f);
  assert.equal(stemKey('src/order/index.ts'), 'index');
  assert.equal(stemKey('Service.java'), 'service', 'a name that is only a suffix is kept');
});

test('planShards keeps a module within the limits as one shard', () => {
  const files = ['a/A.java', 'a/B.java'];
  assert.deepEqual(planShards(files, () => 10, { maxFiles: 5, maxBytes: 1000 }), [files]);
});

test('planShards splits by file count into near-equal shards and loses no file', () => {
  const files = Array.from({ length: 25 }, (_, i) => `src/F${String(i).padStart(2, '0')}.java`);
  const shards = planShards(files, () => 10, { maxFiles: 10, maxBytes: 1e9 });
  assert.equal(shards.length, 3);
  assert.deepEqual(shards.flat().sort(), files);
  for (const s of shards) assert.ok(s.length <= 10, `shard of ${s.length}`);
});

test('planShards folds a tiny tail into the previous shard instead of spawning an agent for it', () => {
  const files = Array.from({ length: 101 }, (_, i) => `src/F${String(i).padStart(3, '0')}.java`);
  const shards = planShards(files, () => 10, { maxFiles: 34, maxBytes: 1e9 });
  assert.equal(shards.length, 3);
  assert.deepEqual(shards.flat().sort(), files);
});

test('planShards splits by bytes when files are few but large', () => {
  const files = ['a/A.java', 'a/B.java', 'a/C.java', 'a/D.java'];
  const shards = planShards(files, () => 400, { maxFiles: 100, maxBytes: 500 });
  assert.ok(shards.length >= 3);
  assert.deepEqual(shards.flat().sort(), files);
});

test('planShards keeps Loan files from different layer folders in the same shard', () => {
  const files = [];
  for (const n of ['Book', 'Loan', 'Member', 'Order', 'Pay', 'Ship']) {
    for (const [dir, suf] of [['controller', 'Controller'], ['service', 'Service'], ['repository', 'Repository']]) files.push(`src/${dir}/${n}${suf}.java`);
  }
  const shards = planShards(files, () => 10, { maxFiles: 9, maxBytes: 1e9 });
  assert.ok(shards.length >= 2);
  for (const n of ['Book', 'Loan', 'Member', 'Order', 'Pay', 'Ship']) {
    const holders = shards.filter((s) => s.some((f) => f.includes(`/${n}`)));
    assert.equal(holders.length, 1, `${n} is split across ${holders.length} shards`);
  }
});

test('planShards is deterministic regardless of input order', () => {
  const files = Array.from({ length: 30 }, (_, i) => `d${i % 3}/X${i}.java`);
  const a = planShards(files, () => 1, { maxFiles: 8, maxBytes: 1e9 });
  const b = planShards([...files].reverse(), () => 1, { maxFiles: 8, maxBytes: 1e9 });
  assert.deepEqual(a, b);
});

test('shardModules returns only the modules over the limit; shardLimits reads the environment', () => {
  const big = Array.from({ length: 12 }, (_, i) => `big/F${i}.java`);
  const r = shardModules({ big, small: ['s/A.java'] }, () => 1, { maxFiles: 5, maxBytes: 1e9 });
  assert.deepEqual(Object.keys(r), ['big']);
  assert.deepEqual(shardLimits({ GROUNDWORK_SHARD_FILES: '7', GROUNDWORK_SHARD_BYTES: 'x' }), { maxFiles: 7, maxBytes: 300 * 1024 });
});

const item = (id, kind, summary, evidence, details, confidence = 'high') => ({ id, kind, summary, confidence, evidence: evidence.map(([file, line]) => ({ file, line, snippet: 's' })), ...(details ? { details } : {}) });

test('mergeFactsParts joins the same entity and API across shards and renumbers', () => {
  const p0 = { module: 'loan', items: [
    item('LON-001', 'entity', '대출', [['a/Loan.java', 3]], { name: 'Loan', fields: ['id'] }, 'medium'),
    item('LON-002', 'api', '대출 신청', [['a/C.java', 9]], { method: 'POST', path: '/loans', reads: ['Book'] }),
    item('LON-003', 'constant', '연장 7일', [['a/S.java', 20]]),
  ] };
  const p1 = { module: 'loan', items: [
    item('LON-001', 'entity', '대출 엔티티', [['b/Loan2.java', 5]], { name: 'Loan', fields: ['id', 'due'] }, 'high'),
    item('LON-002', 'api', '대출 신청', [['b/C2.java', 4]], { method: 'post', path: '/LOANS', reads: ['Book', 'Member'], writes: ['Loan'] }),
    item('LON-003', 'constant', '연장 기간 7일', [['a/S.java', 20], ['b/T.java', 2]]),
    item('LON-004', 'validation', '연체 시 대출 불가', [['b/V.java', 11]]),
  ] };
  const { facts, duplicates } = mergeFactsParts([p0, p1], { module: 'loan', abbrev: 'LON', modulePaths: ['src/**'], generatedAt: 'T' });
  assert.equal(duplicates, 3);
  assert.deepEqual(facts.items.map((i) => i.id), ['LON-001', 'LON-002', 'LON-003', 'LON-004']);
  const [entity, api, constant] = facts.items;
  assert.equal(entity.confidence, 'high', 'keeps the higher confidence');
  assert.deepEqual(entity.details.fields, ['id', 'due']);
  assert.equal(entity.evidence.length, 2);
  assert.deepEqual(api.details.reads, ['Book', 'Member']);
  assert.deepEqual(api.details.writes, ['Loan']);
  assert.equal(constant.evidence.length, 2, 'a rule citing the same line is one rule; extra evidence is added');
  assert.equal(facts.module, 'loan');
  assert.deepEqual(facts.modulePaths, ['src/**']);
});

test('mergeFactsParts does not mutate its inputs', () => {
  const p0 = { module: 'm', items: [item('MM-001', 'entity', 'x', [['a', 1]], { name: 'E', fields: ['a'] })] };
  const p1 = { module: 'm', items: [item('MM-001', 'entity', 'x', [['b', 2]], { name: 'E', fields: ['b'] })] };
  const before = JSON.stringify([p0, p1]);
  mergeFactsParts([p0, p1], { module: 'm', abbrev: 'MM', modulePaths: [] });
  assert.equal(JSON.stringify([p0, p1]), before);
});

function setup(fileCount) {
  const files = {};
  for (let i = 0; i < fileCount; i++) files[`src/order/F${String(i).padStart(2, '0')}.java`] = 'class X {}';
  const root = makeTree({ 'pom.xml': '<project/>', ...files });
  const out = makeTree({});
  fs.mkdirSync(path.join(out, '_data'), { recursive: true });
  fs.writeFileSync(path.join(out, '_data', 'module-map.json'), JSON.stringify({
    project: { name: 't', root, summary: '테스트', stacks: ['spring'] },
    modules: [{ id: 'order', abbrev: 'ORD', name: '주문', codeName: 'order', summary: '주문', paths: ['src/order'], fileCount: 0, dependsOn: [] }],
  }));
  return out;
}

test('resolve-modules writes shards only for a module over the limit', () => {
  const small = setup(5);
  execFileSync('node', [RESOLVE, small], { encoding: 'utf8' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(small, '_data', 'module-files.json'), 'utf8')).shards, undefined);

  const big = setup(10);
  const stdout = execFileSync('node', [RESOLVE, big], { encoding: 'utf8', env: { ...process.env, GROUNDWORK_SHARD_FILES: '4' } });
  assert.match(stdout, /SHARD module "order" is large: 10 files -> 3 shards/);
  const doc = JSON.parse(fs.readFileSync(path.join(big, '_data', 'module-files.json'), 'utf8'));
  assert.deepEqual(doc.shards.order.flat().sort(), doc.modules.order);
});

test('merge-facts CLI merges shard files, and names the shard that is missing or invalid', () => {
  const out = setup(10);
  execFileSync('node', [RESOLVE, out], { encoding: 'utf8', env: { ...process.env, GROUNDWORK_SHARD_FILES: '5' } });
  const parts = path.join(out, '_data', 'facts-parts');
  fs.mkdirSync(parts);
  const write = (i, items) => fs.writeFileSync(path.join(parts, `order.${i}.json`), JSON.stringify({ module: 'order', items }));
  write(0, [item('ORD-001', 'validation', '재고 확인', [['src/order/F00.java', 1]])]);

  const missing = spawnSync('node', [MERGE, out, 'order'], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /shard 1: missing/);

  write(1, [{ id: 'bad', kind: 'validation' }]);
  const invalid = spawnSync('node', [MERGE, out, 'order'], { encoding: 'utf8' });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /shard 1:/);

  write(1, [item('ORD-001', 'validation', '결제 확인', [['src/order/F07.java', 3]])]);
  assert.match(execFileSync('node', [MERGE, out, 'order'], { encoding: 'utf8' }), /parts=2 items=2 merged=0/);
  const facts = JSON.parse(fs.readFileSync(path.join(out, '_data', 'facts', 'order.json'), 'utf8'));
  assert.deepEqual(facts.items.map((i) => i.id), ['ORD-001', 'ORD-002']);
  assert.deepEqual(facts.modulePaths, ['src/order']);
});

test('merge-facts CLI refuses a module that is not sharded', () => {
  const out = setup(3);
  execFileSync('node', [RESOLVE, out], { encoding: 'utf8' });
  const r = spawnSync('node', [MERGE, out, 'order'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not sharded/);
});

test('merge-facts --clean removes only that module\'s shard files', () => {
  const out = setup(3);
  const parts = path.join(out, '_data', 'facts-parts');
  fs.mkdirSync(parts);
  for (const f of ['order.0.json', 'order.1.json', 'order-legacy.0.json', 'other.0.json', 'order.x.json']) fs.writeFileSync(path.join(parts, f), '{}');
  assert.match(execFileSync('node', [MERGE, out, 'order', '--clean'], { encoding: 'utf8' }), /cleaned=2/);
  assert.deepEqual(fs.readdirSync(parts).sort(), ['order-legacy.0.json', 'order.x.json', 'other.0.json']);
  assert.equal(spawnSync('node', [MERGE, out, 'order', '--nope'], { encoding: 'utf8' }).status, 2);
});
