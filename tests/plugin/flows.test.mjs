import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { buildLifecycles, kebab, pickFlows } from '../../plugin/scripts/lib/flows.mjs';

const PICK = path.resolve('plugin/scripts/pick-flows.mjs');
const LIFE = path.resolve('plugin/scripts/build-lifecycles.mjs');

const EV = [{ file: 'src/x.js', line: 1, snippet: 'x' }];

const FACTS = [
  {
    module: 'loan',
    items: [
      { id: 'LOA-001', kind: 'api', summary: '대출 신청', confidence: 'high', evidence: EV, details: { method: 'post', path: '/api/loans', reads: ['Book', 'Member'], writes: ['Loan', 'Book'] } },
      { id: 'LOA-002', kind: 'api', summary: '대출 조회', confidence: 'high', evidence: EV, details: { method: 'GET', path: '/api/loans/{id}', reads: ['Loan'] } },
      { id: 'LOA-003', kind: 'entity', summary: '대출 기록', confidence: 'high', evidence: EV, details: { name: 'Loan', title: '대출', table: 'loans' } },
      { id: 'LOA-004', kind: 'state-transition', summary: '반납하면 반납 완료', confidence: 'high', evidence: EV, details: { entity: 'Loan', from: '대출 중', to: '반납 완료', trigger: 'PUT /api/loans/{id}/return' } },
      { id: 'LOA-005', kind: 'api', summary: '반납', confidence: 'medium', evidence: EV, details: { method: 'PUT', path: '/api/loans/{id}/return', writes: ['loans'] } },
    ],
  },
  {
    module: 'book',
    items: [
      { id: 'BOK-001', kind: 'api', summary: '도서 등록', confidence: 'high', evidence: EV, details: { method: 'POST', path: '/api/books', writes: ['Book'] } },
      { id: 'BOK-002', kind: 'entity', summary: '도서', confidence: 'high', evidence: EV, details: { name: 'Book', title: '도서', table: 'books' } },
      { id: 'BOK-003', kind: 'entity', summary: '이름 없는 엔티티', confidence: 'low', evidence: EV, details: { table: 'audit' } },
    ],
  },
  {
    module: 'member',
    items: [{ id: 'MEM-001', kind: 'entity', summary: '회원', confidence: 'high', evidence: EV, details: { name: 'Member', title: '회원', table: 'members' } }],
  },
];

const FLOWS = [{ id: 'loa-001', steps: [{ n: 1, data: { writes: ['loans.due_date'] } }, { n: 2, data: { reads: ['books'] } }] }];

test('kebab', () => {
  assert.equal(kebab('OrderItem'), 'order-item');
  assert.equal(kebab('Loan'), 'loan');
});

test('pickFlows prefers writing APIs, one per module first', () => {
  assert.deepEqual(pickFlows(FACTS).map((p) => p.id), ['loa-001', 'bok-001', 'loa-005']);
  assert.deepEqual(pickFlows(FACTS)[0], { id: 'loa-001', module: 'loan', factId: 'LOA-001', label: 'POST /api/loans' });
  assert.deepEqual(pickFlows(FACTS, { max: 2 }).map((p) => p.id), ['loa-001', 'bok-001']);
  assert.deepEqual(pickFlows(FACTS, { exclude: ['loa-001'] }).map((p) => p.id), ['bok-001', 'loa-005']);
});

test('buildLifecycles collects writers, readers, transitions and flows per entity', () => {
  const [loan, book, member] = buildLifecycles(FACTS, FLOWS);
  assert.equal(buildLifecycles(FACTS, FLOWS).length, 3);
  assert.deepEqual(loan, {
    id: 'loan', name: 'Loan', title: '대출', table: 'loans', module: 'loan', modules: ['loan'], entityFact: 'LOA-003', entityFacts: ['LOA-003'],
    states: [],
    transitions: [{ factId: 'LOA-004', from: '대출 중', to: '반납 완료', trigger: 'PUT /api/loans/{id}/return' }],
    writers: [
      { factId: 'LOA-001', module: 'loan', label: 'POST /api/loans', summary: '대출 신청' },
      { factId: 'LOA-005', module: 'loan', label: 'PUT /api/loans/{id}/return', summary: '반납' },
    ],
    readers: [{ factId: 'LOA-002', module: 'loan', label: 'GET /api/loans/{id}', summary: '대출 조회' }],
    flows: ['loa-001'],
    documented: true,
  });
  assert.deepEqual(book.writers.map((w) => w.factId), ['LOA-001', 'BOK-001']);
  assert.deepEqual(book.flows, ['loa-001']);
  assert.equal(member.documented, false);
});

test('buildLifecycles merges the same entity found in several modules into one lifecycle', () => {
  // realworld: Article/Comment/User/Tag appeared in both common (schema) and their own module, so 10 items made 6 files.
  const facts = [
    { module: 'common', items: [
      { id: 'COM-001', kind: 'entity', summary: '글', confidence: 'high', evidence: EV, details: { name: 'Article', title: '글', table: 'articles' } },
      { id: 'COM-002', kind: 'entity', summary: '태그', confidence: 'high', evidence: EV, details: { name: 'Tag', title: '태그' } },
    ] },
    { module: 'article', items: [
      { id: 'ART-001', kind: 'entity', summary: '게시글', confidence: 'high', evidence: EV, details: { name: 'Article', title: '게시글', table: 'Article' } },
      { id: 'ART-002', kind: 'api', summary: '글 작성', confidence: 'high', evidence: EV, details: { method: 'POST', path: '/api/articles', writes: ['articles'] } },
      { id: 'ART-003', kind: 'api', summary: '글 수정', confidence: 'high', evidence: EV, details: { method: 'PUT', path: '/api/articles/:slug', writes: ['Article'] } },
    ] },
    { module: 'tag', items: [
      { id: 'TAG-001', kind: 'entity', summary: '태그', confidence: 'high', evidence: EV, details: { name: 'Tag', title: '태그', table: 'Tag' } },
    ] },
  ];
  const lcs = buildLifecycles(facts);
  assert.deepEqual(lcs.map((lc) => lc.id), ['article', 'tag']);
  const [article, tag] = lcs;
  assert.equal(article.module, 'article', 'a business module owns the entity over common');
  assert.equal(article.title, '게시글');
  assert.equal(article.entityFact, 'ART-001');
  assert.deepEqual(article.entityFacts, ['COM-001', 'ART-001']);
  assert.deepEqual(article.modules, ['common', 'article']);
  assert.deepEqual(article.writers.map((w) => w.factId), ['ART-002', 'ART-003'], 'names and tables of every copy match');
  assert.equal(tag.module, 'tag');
  assert.equal(tag.table, 'Tag');
});

test('build-lifecycles reports as many entities as files it writes', () => {
  const out = outTree({
    '_data/facts/common.json': JSON.stringify({ module: 'common', items: [FACTS[0].items[2], { ...FACTS[1].items[1], id: 'COM-002' }].map((it, i) => ({ ...it, id: `COM-00${i + 1}` })) }),
    '_data/facts/loan.json': JSON.stringify(FACTS[0]),
    '_data/facts/book.json': JSON.stringify(FACTS[1]),
  });
  const stdout = execFileSync('node', [LIFE, out], { encoding: 'utf8' });
  const files = fs.readdirSync(path.join(out, '_data/lifecycles'));
  assert.match(stdout, new RegExp(`entities=${files.length} `));
  assert.deepEqual(files.sort(), ['book.json', 'loan.json']);
});

const VALID_FLOW = {
  id: 'loa-001',
  title: '도서 대출',
  outcome: '대출이 기록된다',
  trigger: { kind: 'api', label: 'POST /api/loans', factId: 'LOA-001' },
  actors: [{ id: 'client', kind: 'client', name: '사용자' }, { id: 'db', kind: 'db', name: 'DB' }],
  steps: [
    { n: 1, from: 'client', to: 'db', action: '대출 기록', confidence: 'high', evidence: EV, data: { writes: ['loans.due_date'] } },
    { n: 2, from: 'client', to: 'db', action: '도서 조회', confidence: 'high', evidence: EV, data: { reads: ['books'] } },
  ],
};

function outTree(files) {
  return makeTree({
    '_data/module-map.json': JSON.stringify({ project: { name: 'lib', root: path.join(os.tmpdir(), 'gw-target-not-here'), summary: 's', stacks: ['java'] }, modules: [] }),
    ...files,
  });
}

test('CLIs read the output folder', () => {
  const out = outTree({
    '_data/facts/loan.json': JSON.stringify(FACTS[0]),
    '_data/facts/book.json': JSON.stringify(FACTS[1]),
    '_data/flows/loa-001.json': JSON.stringify(VALID_FLOW),
    '_data/lifecycles/stale.json': '{}',
  });
  assert.deepEqual(JSON.parse(execFileSync('node', [PICK, out], { encoding: 'utf8' })).map((p) => p.id), ['bok-001', 'loa-005']);
  assert.deepEqual(JSON.parse(execFileSync('node', [PICK, out, '--all', '--max', '1'], { encoding: 'utf8' })).map((p) => p.id), ['loa-001']);

  assert.match(execFileSync('node', [LIFE, out], { encoding: 'utf8' }), /entities=2 documented=2/);
  assert.deepEqual(fs.readdirSync(path.join(out, '_data/lifecycles')).sort(), ['book.json', 'loan.json']);
});

test('CLIs skip and warn on invalid or unparseable data files instead of crashing', () => {
  const out = outTree({
    '_data/facts/book.json': JSON.stringify(FACTS[1]),
    '_data/facts/loan.json': JSON.stringify(FACTS[0]),
    '_data/facts/payment.json': JSON.stringify({ module: 'payment', items: [{ id: 'PAY-001', kind: 'api', summary: '결제', confidence: 'high', details: { method: 'POST', writes: ['Pay'] } }] }),
    '_data/facts/broken.json': '{ not json',
    '_data/flows/loa-001.json': JSON.stringify(VALID_FLOW),
    '_data/flows/bad.json': JSON.stringify({ id: 'bad', steps: 'x' }),
  });
  const pick = spawnSync('node', [PICK, out], { encoding: 'utf8' });
  assert.equal(pick.status, 0, pick.stderr);
  assert.deepEqual(JSON.parse(pick.stdout).map((p) => p.id), ['bok-001', 'loa-005']);
  assert.match(pick.stderr, /WARN skipped .*payment\.json/);
  assert.match(pick.stderr, /WARN skipped .*broken\.json/);

  const life = spawnSync('node', [LIFE, out], { encoding: 'utf8' });
  assert.equal(life.status, 0, life.stderr);
  assert.match(life.stdout, /entities=2 documented=2/);
  assert.match(life.stderr, /WARN skipped .*bad\.json/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, '_data/lifecycles/loan.json'), 'utf8')).flows, ['loa-001']);
});

test('buildLifecycles and pickFlows tolerate wrongly typed details', () => {
  const facts = [{
    module: 'loan',
    items: [
      { id: 'LOA-001', kind: 'api', summary: 'a', confidence: 'high', details: { method: 'POST', path: '/loans', writes: 'Loan', reads: 5 } },
      { id: 'LOA-002', kind: 'entity', summary: 'b', confidence: 'high', details: { name: 'Loan', table: ['loans'] } },
      { id: 'LOA-003', kind: 'state', summary: 'c', confidence: 'high', details: { entity: ['Loan'] } },
      { id: 'LOA-004', kind: 'api', summary: 'd', confidence: 'high', details: { method: 'PUT', path: '/x', writes: 'Loan' } },
    ],
  }];
  const [loan] = buildLifecycles(facts, [{ id: 'f', steps: [{ n: 1, data: { writes: 'Loan' } }] }]);
  assert.deepEqual(loan.writers.map((w) => w.factId), ['LOA-001', 'LOA-004']);
  assert.equal(loan.table, null);
  assert.deepEqual(loan.flows, ['f']);
  const picked = pickFlows(facts);
  assert.deepEqual(picked.map((p) => p.id), ['loa-001', 'loa-004']);
});

test('pick-flows and build-lifecycles exit 2 when the output folder is inside the target or module-map.json is missing', () => {
  const target = makeTree({ 'src/a.java': 'x' });
  const out = path.join(target, 'groundwork-output');
  fs.mkdirSync(path.join(out, '_data/facts'), { recursive: true });
  fs.writeFileSync(path.join(out, '_data/module-map.json'), JSON.stringify({ project: { name: 't', root: target, summary: 's', stacks: ['x'] }, modules: [] }));
  fs.writeFileSync(path.join(out, '_data/facts/loan.json'), JSON.stringify(FACTS[0]));
  for (const cli of [PICK, LIFE]) {
    const r = spawnSync('node', [cli, out], { encoding: 'utf8' });
    assert.equal(r.status, 2, cli);
    assert.match(r.stderr, /outside the target/);
  }
  assert.equal(fs.existsSync(path.join(out, '_data/lifecycles')), false);

  const bare = makeTree({ '_data/facts/loan.json': JSON.stringify(FACTS[0]) });
  for (const cli of [PICK, LIFE]) {
    const r = spawnSync('node', [cli, bare], { encoding: 'utf8' });
    assert.equal(r.status, 2, cli);
    assert.match(r.stderr, /module-map\.json/);
  }
});
