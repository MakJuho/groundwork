import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { inferLayer, flowPaths, collectSnippets, buildPlayerData } from '../../plugin/scripts/lib/player.mjs';
import { renderPlayerPage } from '../../plugin/scripts/lib/player-page.mjs';
import { REPORT_CSP } from '../../plugin/scripts/lib/report.mjs';

test('inferLayer uses explicit layer, kind and names', () => {
  assert.equal(inferLayer({ layer: 'mapper' }), 'mapper');
  assert.equal(inferLayer({ kind: 'client' }), 'screen');
  assert.equal(inferLayer({ kind: 'component', name: '회원 저장 서비스', id: 'member-service' }), 'service');
  assert.equal(inferLayer({ kind: 'component', id: 'member-controller' }), 'controller');
  assert.equal(inferLayer({ kind: 'component', id: 'x' }), 'other');
});

test('flowPaths splits main and branches', () => {
  const flow = { steps: [
    { n: 1 }, { n: 2 }, { n: 3, branch: { condition: 'A', result: 'r' } }, { n: 4, branchOf: 3 },
    { n: 5 }, { n: 6, branch: { condition: 'B', result: 'r' } }, { n: 7, branchOf: 6 }, { n: 8 },
  ] };
  const p = flowPaths(flow);
  assert.deepEqual(p.map((x) => [x.key, x.label, x.steps]), [
    ['main', '정상', [1, 2, 5, 8]], ['b3', 'A', [1, 2, 3, 4]], ['b6', 'B', [1, 2, 5, 6, 7]],
  ]);
});

const flowWith = (evidence) => ({ steps: [{ n: 1, evidence }] });

test('collectSnippets reads context lines', () => {
  const root = makeTree({ 'a.txt': Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join('\n') });
  const s = collectSnippets(root, [flowWith([{ file: 'a.txt', line: 5, snippet: 'x' }])]);
  assert.equal(s['a.txt:5'].start, 2);
  assert.equal(s['a.txt:5'].lines.length, 7);
  assert.equal(s['a.txt:5'].lines[3], 'l5');
});

test('missing evidence file yields empty snippet', () => {
  const root = makeTree({ 'a.txt': 'one\ntwo' });
  const ev = [
    { file: 'nope.txt', line: 1, snippet: 'x' }, { file: 'a.txt', line: 99, snippet: 'x' },
    { file: '../x', line: 1, snippet: 'x' }, { file: path.resolve(root, 'a.txt'), line: 1, snippet: 'x' },
  ];
  assert.deepEqual(collectSnippets(root, [flowWith(ev)]), {});
});

test('buildPlayerData links buttons to flows', () => {
  const target = makeTree({ 'src/a.js': 'a\nb\nc' });
  const out = makeTree({
    '_data/module-map.json': JSON.stringify({ project: { root: target, name: 'P' } }),
    '_data/screens.json': JSON.stringify({ screens: [{ id: 'A', buttons: [{ id: 'btn_b' }, { id: 'btn_c' }] }] }),
    '_data/flows/ui-a-btn-b.json': JSON.stringify({
      id: 'ui-a-btn-b', title: 't', outcome: 'o',
      trigger: { kind: 'ui', label: 'l', screen: 'A', component: 'btn_b' },
      actors: [{ id: 'scr', kind: 'client', name: 'A' }, { id: 'svc', kind: 'component', name: '서비스' }],
      steps: [{ n: 1, from: 'scr', to: 'svc', action: 'go', confidence: 'high', evidence: [{ file: 'src/a.js', line: 2, snippet: 'b' }] }],
    }),
    '_data/flows/bad.json': '{"id":"bad"}',
  });
  const d = buildPlayerData(out);
  assert.equal(d.project.name, 'P');
  assert.equal(d.screens[0].buttons[0].flowId, 'ui-a-btn-b');
  assert.equal(d.screens[0].buttons[1].flowId, undefined);
  assert.equal(d.flows.length, 1);
  assert.deepEqual(d.flows[0].lanes, { scr: 'screen', svc: 'service' });
  assert.equal(d.flows[0].paths[0].key, 'main');
  assert.ok(d.snippets['src/a.js:2']);
  fs.rmSync(out, { recursive: true });
});

test('buildPlayerData without screens.json', () => {
  const out = makeTree({ '_data/module-map.json': JSON.stringify({ project: { root: '/nonexistent', name: 'P' } }) });
  assert.deepEqual(buildPlayerData(out).screens, []);
});

// ---- player page (Task 7) ----

const PLAYER_CLI = path.resolve('plugin/scripts/build-player.mjs');

const smallFlow = (action = '저장한다') => ({
  id: 'ui-a-btn-b', title: 't', outcome: 'o',
  trigger: { kind: 'ui', label: 'l', screen: 'A', component: 'btn_b' },
  actors: [{ id: 'scr', kind: 'client', name: 'A', layer: 'screen' }, { id: 'svc', kind: 'component', name: 'Svc', layer: 'service' }],
  steps: [{ n: 1, from: 'scr', to: 'svc', action, confidence: 'high', evidence: [{ file: 'src/a.js', line: 2, snippet: 'b' }] }],
});
const smallData = (action) => {
  const f = smallFlow(action);
  return {
    project: { name: 'P', root: '/t' },
    screens: [{ id: 'A', title: '화면 A', file: 'forms/g/A.xfdl', group: 'g', width: 100, height: 50,
      components: [{ id: 'btn_b', type: 'Button', text: 'B', left: 1, top: 1, width: 20, height: 10 }],
      buttons: [{ id: 'btn_b', text: 'B', event: 'onclick', handler: 'h', handlerLine: 1, call: null, endpoint: null, flowId: f.id }] }],
    flows: [{ ...f, lanes: { scr: 'screen', svc: 'service' }, paths: flowPaths(f) }],
    snippets: { 'src/a.js:2': { start: 1, lines: ['a', 'b', 'c'] } },
  };
};

test('renders a self-contained page', () => {
  const html = renderPlayerPage(smallData());
  const csp = `<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">`;
  assert.match(html, /<head>\s*<meta charset="utf-8">\s*<meta http-equiv="Content-Security-Policy"/);
  assert.ok(html.includes(csp));
  assert.ok(html.indexOf(csp) < html.indexOf('<style>'));
  assert.ok(!html.includes('http://') && !html.includes('https://'));
  assert.ok(html.includes('id="gw-data"'));
  assert.ok(html.includes('href="index.html"'));
});

test('embedded json cannot close the script tag', () => {
  const html = renderPlayerPage(smallData('</script><b>x'));
  assert.ok(!html.includes('</script><b>'));
  const json = html.match(/<script type="application\/json" id="gw-data">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(json).flows[0].steps[0].action, '</script><b>x');
});

test('embedded code with urls keeps the page free of http strings', () => {
  const d = smallData();
  d.snippets['src/a.js:2'].lines = ['<!DOCTYPE mapper "http://mybatis.org/dtd">', 'b'];
  const html = renderPlayerPage(d);
  assert.ok(!html.includes('http://'));
  const json = html.match(/id="gw-data">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(json).snippets['src/a.js:2'].lines[0], '<!DOCTYPE mapper "http://mybatis.org/dtd">');
});

test('cli writes player.html and refuses output inside target', () => {
  const target = makeTree({ 'src/a.js': 'a\nb\nc' });
  const d = smallData();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-out-'));
  const write = (dir) => {
    fs.mkdirSync(path.join(dir, '_data', 'flows'), { recursive: true });
    fs.writeFileSync(path.join(dir, '_data', 'module-map.json'), JSON.stringify({ project: { root: target, name: 'P' } }));
    fs.writeFileSync(path.join(dir, '_data', 'screens.json'), JSON.stringify({ screens: d.screens.map((s) => ({ ...s, buttons: s.buttons.map(({ flowId, ...b }) => b) })) }));
    fs.writeFileSync(path.join(dir, '_data', 'flows', 'ui-a-btn-b.json'), JSON.stringify(smallFlow()));
  };
  write(out);
  const r = spawnSync('node', [PLAYER_CLI, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^player=.*player\.html screens=1 flows=1\n$/);
  const html = fs.readFileSync(path.join(out, 'player.html'), 'utf8');
  const json = JSON.parse(html.match(/id="gw-data">([\s\S]*?)<\/script>/)[1]);
  assert.equal(json.screens[0].buttons[0].flowId, 'ui-a-btn-b');
  assert.ok(json.snippets['src/a.js:2']);

  const inside = path.join(target, 'out');
  write(inside);
  const bad = spawnSync('node', [PLAYER_CLI, inside], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.ok(!fs.existsSync(path.join(inside, 'player.html')));
  fs.rmSync(out, { recursive: true });
  fs.rmSync(target, { recursive: true });
});

test('build-report also builds the player when screens.json exists', () => {
  const target = makeTree({ 'src/a.js': 'a\nb\nc' });
  const out = makeTree({ '_data/module-map.json': JSON.stringify({ project: { root: target, name: 'P' } }) });
  const REPORT_CLI = path.resolve('plugin/scripts/build-report.mjs');
  let r = spawnSync('node', [REPORT_CLI, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim().split('\n').length, 1);
  assert.ok(!fs.existsSync(path.join(out, 'player.html')));
  fs.writeFileSync(path.join(out, '_data', 'screens.json'), JSON.stringify({ screens: [] }));
  r = spawnSync('node', [REPORT_CLI, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^index=/);
  assert.match(lines[1], /^player=.*player\.html screens=0 flows=0$/);
  assert.ok(fs.existsSync(path.join(out, 'player.html')));
  fs.rmSync(out, { recursive: true });
  fs.rmSync(target, { recursive: true });
});

test('linkButtonsToFlows prefers the button flow and falls back to the API flow for its URL', async () => {
  const { linkButtonsToFlows } = await import('../../plugin/scripts/lib/player.mjs');
  const screens = [{ id: 'A', buttons: [
    { id: 'btn_ui', call: { url: '/a/save.do' } },
    { id: 'btn_api', call: { url: '/a/list.do' } },
    { id: 'btn_none', call: { url: '/a/none.do' } },
    { id: 'btn_local' },
  ] }];
  const flows = [
    { id: 'ui-a', trigger: { kind: 'ui', screen: 'A', component: 'btn_ui' } },
    { id: 'save-api', trigger: { kind: 'api', label: 'POST /a/save.do' } },
    { id: 'list-api', trigger: { kind: 'api', label: 'POST /A/List.do?x=1' } },
  ];
  const byFlow = linkButtonsToFlows(screens, flows);
  const b = Object.fromEntries(screens[0].buttons.map((x) => [x.id, [x.flowId, x.flowSource]]));
  assert.deepEqual(b, { btn_ui: ['ui-a', 'ui'], btn_api: ['list-api', 'api'], btn_none: [undefined, undefined], btn_local: [undefined, undefined] });
  assert.deepEqual([...byFlow.keys()], ['ui-a', 'list-api']);
  assert.equal(byFlow.get('list-api')[0].button.id, 'btn_api');
});
