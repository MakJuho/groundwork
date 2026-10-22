import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { changedFiles } from '../../plugin/scripts/lib/git.mjs';

const PLAN = path.resolve('plugin/scripts/plan-update.mjs');
const STATE = path.resolve('plugin/scripts/source-state.mjs');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=gw', '-c', 'user.email=gw@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();

function commit(repo, files, message, { remove = [], rename = [] } = {}) {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), content);
  }
  for (const rel of remove) git(repo, 'rm', '-q', rel);
  for (const [a, b] of rename) git(repo, 'mv', a, b);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

const MODULES = ['order', 'payment', 'member', 'shipping'];
const SRC = {
  'src/order/order-service.js': 'export const MAX = 50;\n',
  'src/order/order-policy.js': 'export const MIN = 10000;\n',
  'src/payment/payment-service.js': 'export const pay = 1;\n',
  'src/member/member-service.js': 'export const m = 1;\n',
  'src/shipping/shipping-service.js': 'export const s = 1;\n',
  'README.md': '# shop\n',
};

const fact = (mod, file) => JSON.stringify({ module: mod, items: [{ id: `${mod.slice(0, 3).toUpperCase()}-001`, kind: 'constant', summary: 's', confidence: 'high', evidence: [{ file, line: 1, snippet: 'x' }] }] });
const flowJson = (id, file) => JSON.stringify({ id, title: id, outcome: 'o', trigger: { kind: 'api', label: 'POST /x' }, actors: [{ id: 'c', kind: 'client', name: 'c' }], steps: [{ n: 1, from: 'c', to: 'c', action: 'a', confidence: 'high', evidence: [{ file, line: 1, snippet: 'x' }] }] });

// A target repo (with the project in a subfolder, like a monorepo) and an output folder analyzed at commit A.
function setup() {
  const repo = makeTree({});
  git(repo, 'init', '-q');
  const files = Object.fromEntries(Object.entries(SRC).map(([k, v]) => [`shop/${k}`, v]));
  const a = commit(repo, files, 'A');
  const root = path.join(repo, 'shop');
  const map = {
    project: { name: 'shop', root, summary: 's', stacks: ['node'] },
    modules: MODULES.map((id) => ({ id, abbrev: id.slice(0, 3).toUpperCase(), name: id, codeName: id, summary: id, paths: [`src/${id}`], fileCount: 0, dependsOn: [] })),
  };
  const byModule = Object.fromEntries(MODULES.map((id) => [id, Object.keys(SRC).filter((f) => f.startsWith(`src/${id}/`))]));
  const out = makeTree({
    '_data/module-map.json': JSON.stringify(map),
    '_data/module-files.json': JSON.stringify({ modules: byModule, unassigned: { count: 1, sample: ['README.md'] }, overlaps: { count: 0, sample: [] } }),
    ...Object.fromEntries(MODULES.map((id) => [`_data/facts/${id}.json`, fact(id, byModule[id][0])])),
    '_data/flows/ord-001.json': flowJson('ord-001', 'src/order/order-service.js'),
    '_data/flows/pay-001.json': flowJson('pay-001', 'src/payment/payment-service.js'),
    '_data/lifecycles/order.json': JSON.stringify({ id: 'order' }),
    '_data/prev/facts/stale.json': '{}',
  });
  return { repo, root, out, a };
}

const run = (...args) => spawnSync('node', args, { encoding: 'utf8' });

test('changedFiles lists modified, added, deleted and renamed files relative to a subfolder target', () => {
  const { repo, root, a } = setup();
  const b = commit(repo, { 'shop/src/order/order-service.js': 'export const MAX = 30;\n', 'shop/src/order/new.js': 'x\n', 'other/outside.js': 'x\n' }, 'B', {
    remove: ['shop/src/member/member-service.js'],
    rename: [['shop/src/payment/payment-service.js', 'shop/src/payment/pay-service.js']],
  });
  assert.deepEqual(changedFiles(root, a, b), [
    { status: 'D', path: 'src/member/member-service.js' },
    { status: 'A', path: 'src/order/new.js' },
    { status: 'M', path: 'src/order/order-service.js' },
    { status: 'R', path: 'src/payment/pay-service.js', oldPath: 'src/payment/payment-service.js' },
  ]);
});

test('plan-update finds the affected module and flow, snapshots _data/prev and writes update-plan.json', () => {
  const { repo, out, a } = setup();
  const b = commit(repo, { 'shop/src/order/order-service.js': 'export const MAX = 30;\n' }, 'B');
  const r = run(PLAN, out, a, b);
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.status, 'ready');
  assert.equal(plan.from, a);
  assert.equal(plan.to, b);
  assert.deepEqual(plan.modules.affected, ['order']);
  assert.equal(plan.modules.ratio, 0.25);
  assert.deepEqual(plan.flows.affected, ['ord-001']);
  assert.deepEqual(plan.flows.labels, { 'ord-001': 'POST /x' });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, '_data/update-plan.json'), 'utf8')), plan);
  assert.deepEqual(fs.readdirSync(path.join(out, '_data/prev/facts')).sort(), MODULES.map((m) => `${m}.json`).sort(), 'the stale snapshot is replaced');
  assert.deepEqual(fs.readdirSync(path.join(out, '_data/prev/flows')).sort(), ['ord-001.json', 'pay-001.json']);
  assert.ok(fs.existsSync(path.join(out, '_data/prev/lifecycles/order.json')));
});

test('plan-update stops at 30% of analyzed modules unless --yes, and assigns deleted and renamed files by their old path', () => {
  const { repo, out, a } = setup();
  const b = commit(repo, { 'shop/src/order/order-service.js': 'x\n' }, 'B', {
    remove: ['shop/src/member/member-service.js'],
    rename: [['shop/src/payment/payment-service.js', 'shop/src/payment/pay-service.js']],
  });
  const r = run(PLAN, out, a, b);
  assert.equal(r.status, 4, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.status, 'over-threshold');
  assert.deepEqual(plan.modules.affected, ['member', 'order', 'payment']);
  assert.deepEqual(plan.flows.affected, ['ord-001', 'pay-001']);
  assert.equal(fs.existsSync(path.join(out, '_data/update-plan.json')), false, 'nothing is written before the operator decides');

  const yes = run(PLAN, out, a, b, '--yes');
  assert.equal(yes.status, 0, yes.stderr);
  assert.equal(JSON.parse(yes.stdout).status, 'ready');
  const files = JSON.parse(fs.readFileSync(path.join(out, '_data/module-files.json'), 'utf8'));
  assert.deepEqual(files.modules.payment, ['src/payment/pay-service.js'], 'module-files.json is re-resolved');
});

test('plan-update asks for a module map review when new source lands in a new folder outside every module', () => {
  const { repo, out, a } = setup();
  const b = commit(repo, { 'shop/src/coupon/coupon-service.js': 'x\n' }, 'B');
  const r = run(PLAN, out, a, b);
  assert.equal(r.status, 5, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.status, 'map-review');
  assert.deepEqual(plan.unassigned.files, ['src/coupon/coupon-service.js']);
  assert.deepEqual(plan.unassigned.newDirs, ['src/coupon']);
});

test('plan-update does not call an existing parent folder new', () => {
  const { repo, out, a } = setup();
  const b = commit(repo, { 'shop/src/util.js': 'x\n' }, 'B');
  const plan = JSON.parse(run(PLAN, out, a, b).stdout);
  assert.deepEqual(plan.unassigned, { files: ['src/util.js'], newDirs: [] });
  assert.equal(plan.status, 'noop');
});

test('plan-update ignores files in excluded folders (dist, .groundworkignore)', () => {
  const { repo, out, a } = setup();
  const b = commit(repo, { 'shop/dist/gen/b.js': 'x\n', 'shop/.groundworkignore': 'generated/\n', 'shop/generated/c.js': 'x\n' }, 'B');
  const r = run(PLAN, out, a, b);
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.status, 'noop');
  assert.deepEqual(plan.unassigned, { files: [], newDirs: [] });
});

test('plan-update resumes an interrupted update with the snapshot it already took', () => {
  const { repo, out, a } = setup();
  const b = commit(repo, { 'shop/src/order/order-service.js': 'export const MAX = 30;\n' }, 'B');
  assert.equal(run(PLAN, out, a, b).status, 0);
  // The update re-analyzed order, then stopped before source-state was recorded.
  fs.writeFileSync(path.join(out, '_data/facts/order.json'), fact('order', 'src/order/order-policy.js'));
  const again = run(PLAN, out, a, b);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(JSON.parse(again.stdout).resumed, true);
  assert.match(fs.readFileSync(path.join(out, '_data/prev/facts/order.json'), 'utf8'), /order-service\.js/, 'the pre-update snapshot is kept');
});

test('plan-update keeps module files current on noop', () => {
  const { repo, out, a } = setup();
  const b = commit(repo, { 'shop/src/util.js': 'x\n' }, 'B');
  assert.equal(JSON.parse(run(PLAN, out, a, b).stdout).status, 'noop');
  const files = JSON.parse(fs.readFileSync(path.join(out, '_data/module-files.json'), 'utf8'));
  assert.ok(files.unassigned.sample.includes('src/util.js'));
});

test('plan-update names uncommitted files relative to the target, renames included', () => {
  const { repo, out, a } = setup();
  const b = commit(repo, { 'shop/src/order/order-service.js': 'x\n' }, 'B');
  git(repo, 'mv', 'shop/src/order/order-policy.js', 'shop/src/order/policy.js');
  const r = run(PLAN, out, a, b);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /src\/order\/policy\.js/);
  assert.doesNotMatch(r.stderr, /shop\//);
});

test('plan-update reports noop when only files outside every analyzed module changed', () => {
  const { repo, out, a } = setup();
  const b = commit(repo, { 'shop/README.md': '# shop v2\n' }, 'B');
  const r = run(PLAN, out, a, b);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).status, 'noop');
  assert.equal(fs.existsSync(path.join(out, '_data/prev/facts/order.json')), false);
});

test('plan-update refuses when the target is not checked out at the new commit or has local edits', () => {
  const { repo, root, out, a } = setup();
  const b = commit(repo, { 'shop/src/order/order-service.js': 'export const MAX = 30;\n' }, 'B');
  git(repo, 'checkout', '-q', a);
  let r = run(PLAN, out, a, b);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /checked out/);
  git(repo, 'checkout', '-q', b);
  fs.writeFileSync(path.join(root, 'src/order/order-policy.js'), 'export const MIN = 1;\n');
  r = run(PLAN, out, a, b);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /uncommitted/);
});

test('source-state --record stores the analyzed commit, and plan-update defaults to it and HEAD', () => {
  const { repo, out, a } = setup();
  git(repo, 'remote', 'add', 'origin', 'https://user:secret@git.example.com/shop.git');
  const rec = run(STATE, out, '--record');
  assert.equal(rec.status, 0, rec.stderr);
  const state = JSON.parse(fs.readFileSync(path.join(out, '_data/source-state.json'), 'utf8'));
  assert.equal(state.commit, a);
  assert.equal(state.repo, 'https://git.example.com/shop.git', 'credentials are not stored');
  assert.ok(state.branch && state.analyzedAt);

  const b = commit(repo, { 'shop/src/order/order-service.js': 'export const MAX = 30;\n' }, 'B');
  const plan = JSON.parse(run(PLAN, out).stdout);
  assert.equal(plan.from, a);
  assert.equal(plan.to, b);
});

test('source-state outside a Git repository records git:false and plan-update exits 2', () => {
  const root = makeTree({ 'src/a.js': 'x' });
  const out = makeTree({ '_data/module-map.json': JSON.stringify({ project: { name: 't', root, summary: 's', stacks: ['node'] }, modules: [{ id: 'a', abbrev: 'AA', name: 'a', codeName: 'a', summary: 'a', paths: ['src'], fileCount: 1, dependsOn: [] }] }) });
  assert.equal(run(STATE, out, '--record').status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, '_data/source-state.json'), 'utf8')).git, false);
  const r = run(PLAN, out);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Git/);
});

test('plan-update snapshots conflicts.json into _data/prev when it exists', () => {
  const { repo, out, a } = setup();
  const conflicts = JSON.stringify({ generatedAt: 'x', conflicts: [] });
  fs.writeFileSync(path.join(out, '_data/conflicts.json'), conflicts);
  const b = commit(repo, { 'shop/src/order/order-service.js': 'export const MAX = 30;\n' }, 'B');
  assert.equal(run(PLAN, out, a, b).status, 0);
  assert.equal(fs.readFileSync(path.join(out, '_data/prev/conflicts.json'), 'utf8'), conflicts);

  const { repo: repo2, out: out2, a: a2 } = setup();
  const b2 = commit(repo2, { 'shop/src/order/order-service.js': 'export const MAX = 30;\n' }, 'B');
  assert.equal(run(PLAN, out2, a2, b2).status, 0);
  assert.equal(fs.existsSync(path.join(out2, '_data/prev/conflicts.json')), false);
});
