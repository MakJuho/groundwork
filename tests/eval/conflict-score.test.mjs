import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { scoreConflicts } from '../../eval/lib/conflict-score.mjs';

const CLI = path.resolve('eval/eval-conflicts.mjs');

const expected = [
  { id: 'C1', sides: [{ file: 'a.java', line: 10 }, { file: 'b.xfdl', line: 20 }, { file: 'c.yml', line: 3 }] },
  { id: 'C2', sides: [{ file: 'd.java', line: 5 }, { file: 'e.xfdl', line: 50 }] },
];

const conflict = (id, cites, extra = {}) => ({
  id, title: `${id} 충돌`, status: 'open',
  sides: cites.map(([file, line], i) => ({ label: `쪽${i}`, ruleIds: [], evidence: [{ file, line, snippet: 'x' }] })),
  ...extra,
});

test('scoreConflicts: two expected side files cited within 3 lines is a hit', () => {
  const r = scoreConflicts(expected, [conflict('CFL-001', [['a.java', 12], ['c.yml', 1]])]);
  assert.deepEqual(r.hits, [{ id: 'C1', cfl: 'CFL-001' }]);
  assert.deepEqual(r.missed, ['C2']);
  assert.equal(r.recall, 0.5);
  assert.deepEqual(r.extra, []);
});

test('scoreConflicts: citing only one expected file is a miss', () => {
  const r = scoreConflicts(expected, [conflict('CFL-001', [['a.java', 10], ['a.java', 11]])]);
  assert.deepEqual(r.hits, []);
  assert.deepEqual(r.missed, ['C1', 'C2']);
  assert.equal(r.recall, 0);
  assert.deepEqual(r.extra, [{ id: 'CFL-001', title: 'CFL-001 충돌' }]);
});

test('scoreConflicts: a line 5 away does not count', () => {
  const r = scoreConflicts(expected, [conflict('CFL-001', [['d.java', 10], ['e.xfdl', 50]])]);
  assert.deepEqual(r.missed, ['C1', 'C2']);
});

test('scoreConflicts: unmatched open conflicts are extra, one actual serves one expected', () => {
  const both = conflict('CFL-001', [['a.java', 10], ['b.xfdl', 20], ['d.java', 5], ['e.xfdl', 50]]);
  const r = scoreConflicts(expected, [both, conflict('CFL-002', [['z.java', 1], ['y.xfdl', 2]])]);
  assert.deepEqual(r.hits, [{ id: 'C1', cfl: 'CFL-001' }]);
  assert.deepEqual(r.missed, ['C2']);
  assert.deepEqual(r.extra, [{ id: 'CFL-002', title: 'CFL-002 충돌' }]);
});

test('scoreConflicts: unverified conflicts are ignored', () => {
  const r = scoreConflicts(expected, [conflict('CFL-001', [['d.java', 5], ['e.xfdl', 50]], { status: 'unverified' })]);
  assert.deepEqual(r.hits, []);
  assert.deepEqual(r.extra, []);
});

test('scoreConflicts: no expected conflicts gives recall 1 and lists every open conflict as extra', () => {
  const r = scoreConflicts([], [conflict('CFL-001', [['a.java', 1], ['b.java', 1]])]);
  assert.equal(r.recall, 1);
  assert.equal(r.extra.length, 1);
});

test('eval-conflicts CLI scores out/_data/conflicts.json against anchors', () => {
  const fixture = makeTree({ 'src/A.java': 'a\nint LIMIT = 7;\n', 'src/B.xfdl': 'x\ny\nthis.LIMIT = 5;\n' });
  const answers = makeTree({ 'answers.json': JSON.stringify({ conflicts: [{ id: 'C1', title: 't', sides: [
    { file: 'src/A.java', anchor: 'int LIMIT = 7;' }, { file: 'src/B.xfdl', anchor: 'this.LIMIT = 5;' },
  ] }] }) });
  const out = makeTree({ '_data/conflicts.json': JSON.stringify({ generatedAt: 'x', conflicts: [
    conflict('CFL-001', [['src/A.java', 2], ['src/B.xfdl', 3]]), conflict('CFL-002', [['src/A.java', 40], ['src/C.java', 1]]),
  ] }) });
  const r = spawnSync('node', [CLI, fixture, out, '--answers', path.join(answers, 'answers.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`fixture=${path.basename(fixture)} conflict-recall=1 \\(1/1\\) extra=1`));
  assert.match(r.stdout, /extra: CFL-002/);
  const report = JSON.parse(fs.readFileSync(path.join(out, '_data', 'eval-conflicts-report.json'), 'utf8'));
  assert.deepEqual(report.hits, [{ id: 'C1', cfl: 'CFL-001' }]);
});

test('eval-conflicts CLI without answers is a false-positive baseline', () => {
  const fixture = makeTree({ 'src/A.java': 'a\n' });
  const out = makeTree({ '_data/module-map.json': '{}' });
  const r = spawnSync('node', [CLI, fixture, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /conflict-recall=1 \(0\/0\) extra=0/);
  assert.equal(spawnSync('node', [CLI], { encoding: 'utf8' }).status, 2);
});
