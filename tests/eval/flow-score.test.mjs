import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normLabel, scoreFlow, findFlowForTrigger } from '../../eval/lib/flow-score.mjs';

test('normLabel', () => {
  assert.equal(normLabel('  post   /api/loans '), 'POST /API/LOANS');
});

test('scoreFlow counts expected steps found within line tolerance', () => {
  const expected = [
    { id: 'F1', file: 'a.java', line: 10 },
    { id: 'F2', file: 'b.java', line: 5 },
    { id: 'F3', file: 'b.java', line: 40 },
  ];
  const flow = {
    steps: [
      { n: 1, evidence: [{ file: 'a.java', line: 11, snippet: '' }] },
      { n: 2, evidence: [{ file: 'b.java', line: 3, snippet: '' }, { file: 'b.java', line: 30, snippet: '' }] },
    ],
  };
  assert.deepEqual(scoreFlow(expected, flow), { expected: 3, found: 2, recall: 0.67, missed: ['F3'] });
});

test('findFlowForTrigger matches api labels and screen.component', () => {
  const flows = [
    { trigger: { label: 'POST /a' } },
    { trigger: { label: '회원 관리 · 저장', screen: 'MemberMng', component: 'btn_save' } },
  ];
  assert.equal(findFlowForTrigger('post  /a', flows), flows[0]);
  assert.equal(findFlowForTrigger('MemberMng.btn_save', flows), flows[1]);
  assert.equal(findFlowForTrigger('X.y', flows), undefined);
});
