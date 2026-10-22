import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jaccard, scoreModules } from '../../eval/lib/module-score.mjs';

test('jaccard', () => {
  assert.equal(jaccard(['a', 'b'], ['a', 'b']), 1);
  assert.equal(jaccard(['a', 'b'], ['b', 'c']), 1 / 3);
  assert.equal(jaccard([], []), 0);
});

test('scoreModules matches each expected module to its best generated module', () => {
  const expected = [
    { name: '도서', files: ['B1', 'B2', 'B3', 'B4'] },
    { name: '대출', files: ['L1', 'L2', 'L3', 'L4', 'L5'] },
    { name: '회원', files: ['M1', 'M2', 'M3', 'M4'] },
  ];
  const actual = {
    book: ['B1', 'B2', 'B3', 'B4'],
    loan: ['L1', 'L2', 'L3', 'L4', 'L5', 'C1'], // 5/6
    controller: ['M1', 'M2'], // 계층별로 잘못 나뉜 경우: 2/4
    service: ['M3', 'M4'],
  };
  const s = scoreModules(expected, actual);
  assert.equal(s.expected, 3);
  assert.equal(s.matched, 2);
  assert.equal(s.accuracy, 0.67);
  assert.deepEqual(s.details[0], { name: '도서', best: 'book', jaccard: 1, matched: true });
  assert.deepEqual(s.details[1], { name: '대출', best: 'loan', jaccard: 0.83, matched: true });
  assert.deepEqual(s.details[2], { name: '회원', best: 'controller', jaccard: 0.5, matched: false });
});
