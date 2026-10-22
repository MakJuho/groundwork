import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorLine, score } from '../../eval/lib/score.mjs';

test('anchorLine returns 1-based line or -1', () => {
  assert.equal(anchorLine('a\nb\nconst X = 1;\n', 'X = 1'), 3);
  assert.equal(anchorLine('a', 'zzz'), -1);
});

test('score computes recall and precision with line tolerance', () => {
  const expected = [
    { id: 'N01', locations: [{ file: 'a.js', line: 10 }] },
    { id: 'N02', locations: [{ file: 'b.js', line: 3 }, { file: 'a.js', line: 40 }] },
    { id: 'N03', locations: [{ file: 'c.js', line: 5 }] },
  ];
  const items = [
    { id: 'X-001', kind: 'validation', evidence: [{ file: 'a.js', line: 12 }] },
    { id: 'X-002', kind: 'constant', evidence: [{ file: 'a.js', line: 41 }] },
    { id: 'X-003', kind: 'constant', evidence: [{ file: 'z.js', line: 1 }] },
    { id: 'X-004', kind: 'api', evidence: [{ file: 'r.js', line: 1 }] },
  ];
  assert.deepEqual(score(expected, items), {
    expected: 3, found: 2, recall: 0.667,
    facts: 3, correct: 2, precision: 0.667,
    missed: ['N03'],
  });
});
