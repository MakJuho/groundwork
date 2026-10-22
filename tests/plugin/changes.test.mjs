import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { renderChanges } from '../../plugin/scripts/lib/changes.mjs';
import { collectDocs } from '../../plugin/scripts/lib/report.mjs';

const CLI = path.resolve('plugin/scripts/render-changes.mjs');
const F = 'src/loan/LoanService.java';
const ev = (line, snippet = 'x') => [{ file: F, line, snippet }];
const side = (summary, line, details = null, confidence = 'high') => ({ summary, details, evidence: ev(line), confidence });

const CHANGE = {
  from: 'aaaaaaa1111', to: 'a1b2c3d4e5f6', date: '2026-10-18',
  modules: ['loan'],
  counts: { added: 1, changed: 3, removed: 1 },
  items: [
    { type: 'changed', id: 'LOA-002', module: 'loan', kind: 'constant', before: side('한 회원은 동시에 3권까지 빌릴 수 있다', 37, { value: 3 }), after: side('한 회원은 동시에 5권까지 빌릴 수 있다', 37, { value: 5 }), fields: ['summary', 'details', 'code'], detailChanges: [{ path: 'value', before: 3, after: 5 }], codeChanged: true },
    { type: 'changed', id: 'LOA-005', module: 'loan', kind: 'validation', before: side('연체 중인 회원은 빌릴 수 없다', 50), after: side('연체 중인 회원은 빌릴 수 없다', 52), fields: ['evidence'], detailChanges: [], codeChanged: false },
    { type: 'changed', id: 'LOA-007', module: 'loan', kind: 'validation', before: side('대출 기간은 14일 | 연장 1회', 70), after: side('대출 기간은 14일이고 한 번 연장할 수 있다', 70), fields: ['summary'], detailChanges: [], codeChanged: false },
    { type: 'added', id: 'LOA-014', module: 'loan', kind: 'permission', before: null, after: side('골드 회원은 7권까지 빌릴 수 있다', 41), fields: [], detailChanges: [], codeChanged: null },
    { type: 'removed', id: 'LOA-009', module: 'loan', kind: 'validation', before: side('연체 회원 대출 금지', 60), after: null, fields: [], detailChanges: [], codeChanged: null },
  ],
  flows: [{ id: 'loa-001', title: '도서 대출', status: 'changed', stepsBefore: 3, stepsAfter: 3, addedSteps: ['골드 회원 확인'], removedSteps: ['연체 확인'], policies: { added: ['LOA-014'], removed: ['LOA-009'] } }],
  entities: { added: [], changed: ['loan'], removed: [] },
  needsReview: [{ id: 'BOK-003', module: 'book', summary: '도서 상태는 4가지다' }],
};

test('renderChanges writes before → after in business language with value changes', () => {
  const md = renderChanges(CHANGE, { moduleNames: { loan: '대출' } });
  assert.match(md, /^# 정책 변경 내역 2026-10-18 \(aaaaaaa → a1b2c3d\)$/m);
  assert.match(md, /\| 바뀐 모듈 \| 대출 \(loan\) \|/);
  assert.match(md, /\| 정책 변경 \| 추가 1 · 변경 2 · 삭제 1 \|/);
  assert.match(md, /^\| 구분 \| 정책 번호 \| 이전 \| 이후 \| 근거 \| 커밋 \|$/m);
  assert.match(md, /^\| 변경 \| LOA-002 \| 한 회원은 동시에 3권까지 빌릴 수 있다 \| 한 회원은 동시에 5권까지 빌릴 수 있다 \(값: 3 → 5\) \| `src\/loan\/LoanService\.java:37` \| `a1b2c3d` \|$/m);
  assert.match(md, /^\| 추가 \| LOA-014 \| — \| 골드 회원은 7권까지 빌릴 수 있다 \| `src\/loan\/LoanService\.java:41` \| `a1b2c3d` \|$/m);
  assert.match(md, /^\| 삭제 \| LOA-009 \| 연체 회원 대출 금지 \| — \| `src\/loan\/LoanService\.java:60` \(이전\) \| `a1b2c3d` \|$/m);
  assert.match(md, /^\| 변경\(표현\) \| LOA-007 \| 대출 기간은 14일 \\\| 연장 1회 \|/m, 'reworded only; pipes are escaped');
});

test('renderChanges lists evidence-only moves apart from the table', () => {
  const md = renderChanges(CHANGE, { moduleNames: { loan: '대출' } });
  assert.doesNotMatch(md, /^\| 변경 \| LOA-005/m);
  assert.match(md, /근거 위치만 바뀐 정책/);
  assert.match(md, /- LOA-005 연체 중인 회원은 빌릴 수 없다: `src\/loan\/LoanService\.java:50` → `src\/loan\/LoanService\.java:52`/);
});

test('renderChanges covers flows and 확인 필요, and says so when nothing changed', () => {
  const md = renderChanges(CHANGE, { moduleNames: { loan: '대출' } });
  assert.match(md, /## 3\. 바뀐 흐름/);
  assert.match(md, /\| \[도서 대출\]\(\.\.\/flows\/loa-001\/flow\.md\) \| 바뀜 \| 3 → 3 \| 추가된 단계: 골드 회원 확인 · 빠진 단계: 연체 확인 · 새로 적용된 정책: LOA-014 · 빠진 정책: LOA-009 \|/);
  assert.match(md, /## 4\. 확인 필요\n\n- BOK-003 도서 상태는 4가지다 \(book\)/);

  const empty = renderChanges({ ...CHANGE, modules: [], counts: { added: 0, changed: 0, removed: 0 }, items: [], flows: [], needsReview: [] });
  assert.match(empty, /바뀐 정책이 없습니다/);
  assert.match(empty, /다시 추적한 흐름이 없습니다/);
  assert.match(empty, /## 4\. 확인 필요\n\n없음/);
});

function outTree(files) {
  return makeTree({
    '_data/module-map.json': JSON.stringify({ project: { name: 'lib', root: path.join(os.tmpdir(), 'gw-target-not-here'), summary: 's', stacks: ['java'] }, modules: [{ id: 'loan', abbrev: 'LOA', name: '대출', codeName: 'loan', summary: 's', paths: ['src/loan'], fileCount: 1, dependsOn: [] }] }),
    ...files,
  });
}

test('render-changes CLI renders the latest change log, or the one named', () => {
  const out = outTree({
    '_data/changes/2026-10-01-0000000.json': JSON.stringify({ ...CHANGE, date: '2026-10-01', to: '0000000', items: [], flows: [], needsReview: [] }),
    '_data/changes/2026-10-18-a1b2c3d.json': JSON.stringify(CHANGE),
  });
  let r = spawnSync('node', [CLI, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /changes\/2026-10-18-a1b2c3d\.md/);
  assert.match(fs.readFileSync(path.join(out, 'changes/2026-10-18-a1b2c3d.md'), 'utf8'), /대출 \(loan\)/);
  r = spawnSync('node', [CLI, out, '2026-10-01-0000000'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(out, 'changes/2026-10-01-0000000.md')));
  assert.equal(spawnSync('node', [CLI, out, 'nope'], { encoding: 'utf8' }).status, 2);
});

test('collectDocs puts change logs right after the overview, newest first', () => {
  const out = outTree({
    'overview/onboarding.md': '# 온보딩',
    'changes/2026-10-01-0000000.md': '# a',
    'changes/2026-10-18-a1b2c3d.md': '# b',
    'policy/loan/policy.md': '# 대출 정책',
  });
  assert.deepEqual(collectDocs(out).map((d) => [d.group, d.relPath, d.title]), [
    ['시작하기', 'overview/onboarding.md', '온보딩 가이드'],
    ['최근 변경', 'changes/2026-10-18-a1b2c3d.md', '2026-10-18 (a1b2c3d)'],
    ['최근 변경', 'changes/2026-10-01-0000000.md', '2026-10-01 (0000000)'],
    ['대출', 'policy/loan/policy.md', '서비스 정책서'],
  ]);
});

// renderChanges output before policy conflicts existed: a change log without `conflicts` must not move a byte.
const BEFORE_CONFLICTS = "# 정책 변경 내역 2026-10-18 (aaaaaaa → a1b2c3d)\n> 자동 생성 문서입니다. 정책 번호는 처음 매긴 뒤 바뀌지 않습니다. 이전·이후 문장은 정책서의 정책 문장 그대로입니다.\n\n## 1. 요약\n\n| 항목 | 내용 |\n|---|---|\n| 커밋 범위 | `aaaaaaa` → `a1b2c3d` |\n| 바뀐 모듈 | 대출 (loan) |\n| 정책 변경 | 추가 1 · 변경 2 · 삭제 1 |\n| 근거 위치만 이동 | 1 |\n\n## 2. 바뀐 정책\n\n| 구분 | 정책 번호 | 이전 | 이후 | 근거 | 커밋 |\n|---|---|---|---|---|---|\n| 변경 | LOA-002 | 한 회원은 동시에 3권까지 빌릴 수 있다 | 한 회원은 동시에 5권까지 빌릴 수 있다 (값: 3 → 5) | `src/loan/LoanService.java:37` | `a1b2c3d` |\n| 변경(표현) | LOA-007 | 대출 기간은 14일 \\| 연장 1회 | 대출 기간은 14일이고 한 번 연장할 수 있다 | `src/loan/LoanService.java:70` | `a1b2c3d` |\n| 추가 | LOA-014 | — | 골드 회원은 7권까지 빌릴 수 있다 | `src/loan/LoanService.java:41` | `a1b2c3d` |\n| 삭제 | LOA-009 | 연체 회원 대출 금지 | — | `src/loan/LoanService.java:60` (이전) | `a1b2c3d` |\n\n> 변경(표현): 코드는 그대로이고 정책 문장만 다듬어진 항목입니다.\n\n근거 위치만 바뀐 정책 (내용은 그대로, 다른 코드가 바뀌어 줄 번호가 밀림):\n\n- LOA-005 연체 중인 회원은 빌릴 수 없다: `src/loan/LoanService.java:50` → `src/loan/LoanService.java:52`\n\n## 3. 바뀐 흐름\n\n| 흐름 | 상태 | 단계 수 | 달라진 점 |\n|---|---|---|---|\n| [도서 대출](../flows/loa-001/flow.md) | 바뀜 | 3 → 3 | 추가된 단계: 골드 회원 확인 · 빠진 단계: 연체 확인 · 새로 적용된 정책: LOA-014 · 빠진 정책: LOA-009 |\n\n## 4. 확인 필요\n\n- BOK-003 도서 상태는 4가지다 (book): 갱신 후 근거 코드 확인에 실패했습니다. 담당 개발자 확인 필요\n";

test('renderChanges output is unchanged for change logs without conflicts', () => {
  assert.equal(renderChanges(CHANGE, { moduleNames: { loan: '대출' } }), BEFORE_CONFLICTS);
});

test('renderChanges adds a conflict summary row and a last 정책 충돌 section', () => {
  const conflicts = {
    added: [{ id: 'CFL-004', title: '서버는 결제완료 취소를 허용하지만 화면이 막는다', severity: 'high' }],
    resolved: [],
    changed: [{ id: 'CFL-002', title: 'VIP 적립률 | 화면 5%', fields: ['severity'] }],
    kept: ['CFL-001'],
  };
  const md = renderChanges({ ...CHANGE, conflicts }, { moduleNames: { loan: '대출' } });
  assert.match(md, /\| 정책 변경 \| 추가 1 · 변경 2 · 삭제 1 \|\n\| 근거 위치만 이동 \| 1 \|\n\| 정책 충돌 \| 새 1 · 해소 0 · 변경 1 \|\n/);
  const sec = md.slice(md.indexOf('## 5. 정책 충돌'));
  assert.ok(md.indexOf('## 4. 확인 필요') < md.indexOf('## 5. 정책 충돌'), 'the conflict section comes last');
  assert.match(sec, /### 새 충돌\n\n\| 번호 \| 제목 \| 심각도 \|\n\|---\|---\|---\|\n\| CFL-004 \| 서버는 결제완료 취소를 허용하지만 화면이 막는다 \| 높음 \|/);
  assert.match(sec, /### 해소된 충돌\n\n없음/);
  assert.match(sec, /### 내용이 바뀐 충돌\n\n\| 번호 \| 제목 \| 바뀐 항목 \|\n\|---\|---\|---\|\n\| CFL-002 \| VIP 적립률 \\\| 화면 5% \| 심각도 \|/);
  assert.match(sec, /그대로 남은 충돌: CFL-001/);
  assert.ok(md.startsWith(BEFORE_CONFLICTS.split('| 근거 위치만 이동')[0]), 'earlier sections are untouched');
});

test('renderChanges lists conflicts whose evidence now needs checking apart from resolved ones', () => {
  const base = { added: [], resolved: [], changed: [], kept: [] };
  const conflicts = { ...base, needsReview: [{ id: 'CFL-003', title: '포인트 한도 | 화면' }] };
  const md = renderChanges({ ...CHANGE, conflicts }, { moduleNames: { loan: '대출' } });
  assert.match(md, /\| 정책 충돌 \| 새 0 · 해소 0 · 변경 0 · 확인 필요 1 \|\n/);
  const sec = md.slice(md.indexOf('## 5. 정책 충돌'));
  assert.match(sec, /### 해소된 충돌\n\n없음/);
  assert.match(sec, /### 근거 확인이 필요해진 충돌\n\n\| 번호 \| 제목 \| 사유 \|\n\|---\|---\|---\|\n\| CFL-003 \| 포인트 한도 \\\| 화면 \| 근거 코드 확인에 실패해 충돌 수에서 뺐습니다. 담당 개발자 확인 필요 \|/);

  const none = renderChanges({ ...CHANGE, conflicts: { ...base, needsReview: [] } });
  assert.match(none, /\| 정책 충돌 \| 새 0 · 해소 0 · 변경 0 \|\n/);
  assert.doesNotMatch(none, /근거 확인이 필요해진 충돌/);
});
