import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { isInside } from '../../plugin/scripts/lib/paths.mjs';
import { detectStacks } from '../../plugin/scripts/lib/detect-stack.mjs';
import { detectLayout } from '../../plugin/scripts/lib/layout.mjs';
import { buildInventory } from '../../plugin/scripts/lib/inventory.mjs';

const CLI = path.resolve('plugin/scripts/scan-inventory.mjs');

test('isInside', () => {
  assert.ok(isInside('/a/b', '/a/b'));
  assert.ok(isInside('/a/b', '/a/b/c'));
  assert.ok(!isInside('/a/b', '/a/bc'));
  assert.ok(!isInside('/a/b', '/a'));
  assert.ok(isInside('/a/b', '/a/b/..foo/out'), 'a child folder named ..foo is still inside');
  assert.ok(!isInside('/a/b', '/a/b/../c'));
});

test('isInside sees through a junction or symlink into the target', () => {
  const target = makeTree({ 'src/a.js': 'x' });
  const link = path.join(makeTree({}), 'link');
  fs.symlinkSync(target, link, 'junction');
  assert.ok(isInside(target, path.join(link, 'out')), 'not-yet-existing output under a link into the target');
  assert.ok(isInside(target, path.join(link, 'src')));
});

test('detectStacks finds every stack and falls back to generic', () => {
  assert.deepEqual(detectStacks(['api/pom.xml', 'web/package.json', 'ml/requirements.txt']), ['node', 'python', 'spring']);
  assert.deepEqual(detectStacks(['build.gradle.kts']), ['spring']);
  assert.deepEqual(detectStacks(['README.md']), ['generic']);
});

test('detectLayout tells layered, feature and mixed layouts apart', () => {
  const J = 'src/main/java/com/ex';
  const layered = detectLayout(['pom.xml', `${J}/App.java`, `${J}/controller/A.java`, `${J}/service/A.java`, `${J}/repository/A.java`, `${J}/entity/A.java`]);
  assert.deepEqual(layered, { type: 'layer', layerRatio: 0.67, layerParents: [J] });

  assert.equal(detectLayout(['package.json', 'src/order/order.js', 'src/payment/pay.js']).type, 'feature');

  const nested = detectLayout(['src/order/controller/A.java', 'src/order/service/A.java', 'src/pay/controller/B.java', 'src/pay/service/B.java', 'src/member/controller/C.java']);
  assert.equal(nested.type, 'feature');
  assert.equal(nested.layerParents.length, 3);

  assert.equal(detectLayout(['a/controller/X.java', 'a/b.java', 'a/c.java', 'a/d.java', 'a/e.java', 'a/f.java']).type, 'feature'); // ratio 0.17
  assert.equal(detectLayout(['a/controller/X.java', 'a/service/Y.java', 'a/c.java', 'a/d.java', 'a/e.java']).type, 'mixed'); // ratio 0.4
  assert.equal(detectLayout([]).type, 'feature');
});

test('buildInventory skips excluded, large, binary and generated files', () => {
  const root = makeTree({
    'package.json': '{}',
    'src/index.js': 'export {};\n',
    'src/order/order.js': 'export const A = 1;\n',
    'node_modules/x/index.js': 'x',
    'dist/app.min.js': 'x',
    'big.sql': 'x'.repeat(1024 * 1024 + 1),
    'logo.png': Buffer.from([0x89, 0x50, 0x00, 0x01]).toString('binary'),
    'src/Gen.java': '// @generated\nclass Gen {}',
    'legacy/old.js': 'x',
    '.groundworkignore': 'legacy/\n',
  });
  const inv = buildInventory(root);
  const reasons = Object.fromEntries(inv.skipped.sample.map((s) => [s.path, s.reason]));
  assert.equal(reasons['big.sql'], 'too-large');
  assert.equal(reasons['logo.png'], 'binary');
  assert.equal(reasons['src/Gen.java'], 'generated');
  assert.deepEqual(inv.stacks, ['node']);
  assert.deepEqual(inv.manifests, ['package.json']);
  assert.ok(inv.entryPoints.includes('src/index.js'));
  assert.deepEqual(inv.userIgnorePatterns, ['legacy/']);
  assert.equal(inv.totals.files, 4); // .groundworkignore, package.json, src/index.js, src/order/order.js
  assert.equal(inv.layout.type, 'feature');
  assert.deepEqual(inv.dirs, [{ path: 'src', files: 2 }, { path: 'src/order', files: 1 }]);
});

test('CLI writes inventory and refuses output inside target', () => {
  const root = makeTree({ 'package.json': '{}', 'src/index.js': '' });
  const out = makeTree({});
  const outFile = path.join(out, '_data', 'inventory.json');
  const stdout = execFileSync('node', [CLI, root, outFile], { encoding: 'utf8' });
  assert.match(stdout, /files=2 skipped=0 stacks=node layout=feature/);
  assert.equal(JSON.parse(fs.readFileSync(outFile, 'utf8')).totals.files, 2);

  const bad = spawnSync('node', [CLI, root, path.join(root, 'inv.json')], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /outside the target/);
});

test('detectStacks adds nexacro on top of other stacks', () => {
  assert.deepEqual(detectStacks(['pom.xml', 'src/main/webapp/nexacro/forms/a/A.xfdl']), ['nexacro', 'spring']);
  assert.deepEqual(detectStacks(['x/Shop.xprj']), ['nexacro']);
});
