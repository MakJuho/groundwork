import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { isBusinessSource, resolveModules } from '../../plugin/scripts/lib/resolve.mjs';

const CLI = path.resolve('plugin/scripts/resolve-modules.mjs');

test('resolveModules expands folders, files and globs, reports unassigned and overlaps', () => {
  const files = ['pom.xml', 'src/c/OrderController.java', 'src/s/OrderService.java', 'src/c/MemberController.java', 'src/order-legacy/x.java', 'src/common/Util.java'];
  const r = resolveModules([
    { id: 'order', paths: ['src/**/Order*.java'] },
    { id: 'member', paths: ['./src/c/MemberController.java'] },
    { id: 'common', paths: ['src/common/', 'src/c'] },
  ], files);
  assert.deepEqual(r.byModule.order, ['src/c/OrderController.java', 'src/s/OrderService.java']);
  assert.deepEqual(r.byModule.member, ['src/c/MemberController.java']);
  assert.deepEqual(r.byModule.common, ['src/c/OrderController.java', 'src/c/MemberController.java', 'src/common/Util.java']);
  assert.deepEqual(r.unassigned, ['pom.xml', 'src/order-legacy/x.java']);
  assert.deepEqual(r.overlaps, [
    { file: 'src/c/OrderController.java', modules: ['order', 'common'] },
    { file: 'src/c/MemberController.java', modules: ['member', 'common'] },
  ]);
});

test('CLI fills fileCount, writes module-files.json and refuses output inside target', () => {
  const root = makeTree({
    'pom.xml': '<project/>',
    'src/order/A.java': 'class A {}',
    'src/order/B.java': 'class B {}',
    'src/x/C.java': 'class C {}',
    'node_modules/y/i.js': 'x',
  });
  const map = {
    project: { name: 't', root, summary: '테스트', stacks: ['spring'] },
    modules: [{ id: 'order', abbrev: 'ORD', name: '주문', codeName: 'order', summary: '주문', paths: ['src/order'], fileCount: 0, dependsOn: [] }],
  };
  const writeMap = (dir) => {
    fs.mkdirSync(path.join(dir, '_data'), { recursive: true });
    fs.writeFileSync(path.join(dir, '_data', 'module-map.json'), JSON.stringify(map));
  };

  const out = makeTree({});
  writeMap(out);
  const stdout = execFileSync('node', [CLI, out], { encoding: 'utf8' });
  assert.match(stdout, /modules=1 files=4 unassigned=2 \(50%\) overlaps=0/);
  assert.match(stdout, /WARN unassigned/);
  const saved = JSON.parse(fs.readFileSync(path.join(out, '_data', 'module-map.json'), 'utf8'));
  assert.equal(saved.modules[0].fileCount, 2);
  const mf = JSON.parse(fs.readFileSync(path.join(out, '_data', 'module-files.json'), 'utf8'));
  assert.deepEqual(mf.modules.order, ['src/order/A.java', 'src/order/B.java']);
  assert.deepEqual(mf.unassigned, { count: 2, sample: ['pom.xml', 'src/x/C.java'] });

  const inside = path.join(root, 'out');
  writeMap(inside);
  assert.equal(spawnSync('node', [CLI, inside], { encoding: 'utf8' }).status, 2);
});

test('isBusinessSource keeps code files and drops tests, docs, build and infra files', () => {
  for (const f of ['src/order/Order.java', 'src/app.ts', 'lib/x.mjs', 'app/models/user.rb', 'src/main/kotlin/A.kt']) assert.equal(isBusinessSource(f), true, f);
  for (const f of [
    'pom.xml', 'package.json', 'README.md', 'Dockerfile', '.github/workflows/ci.yml', 'k8s/db.yml',
    'src/test/java/OrderTests.java', 'src/tests/app.test.ts', 'e2e/login.spec.js', 'test/x.js', '__tests__/a.js', 'src/a.test.mjs',
  ]) assert.equal(isBusinessSource(f), false, f);
});

test('CLI does not warn when only tests, docs and build files are unassigned', () => {
  const root = makeTree({
    'package.json': '{}',
    'README.md': '# x',
    'Dockerfile': 'FROM node',
    'src/order/a.ts': 'export {}',
    'src/tests/a.test.ts': 'x',
    'e2e/b.spec.ts': 'x',
  });
  const out = makeTree({});
  fs.mkdirSync(path.join(out, '_data'), { recursive: true });
  fs.writeFileSync(path.join(out, '_data', 'module-map.json'), JSON.stringify({
    project: { name: 't', root, summary: '테스트', stacks: ['node'] },
    modules: [{ id: 'order', abbrev: 'ORD', name: '주문', codeName: 'order', summary: '주문', paths: ['src/order'], fileCount: 0, dependsOn: [] }],
  }));
  const stdout = execFileSync('node', [CLI, out], { encoding: 'utf8' });
  assert.match(stdout, /unassigned=5 \(83%\)/);
  assert.match(stdout, /unassigned-source=0\/1 \(0%\)/);
  assert.doesNotMatch(stdout, /WARN unassigned/);
});
