import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { buildReport, collectDocs, countNeedsReview, injectDiagramFit, stripExternalFonts } from '../../plugin/scripts/lib/report.mjs';
import { viewClient } from '../../plugin/scripts/lib/report-view.mjs';

const CLI = path.resolve('plugin/scripts/build-report.mjs');
const FONT = '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">';

const EV = [{ file: 'src/order.js', line: 1, snippet: 'x' }];
const fact = (id, confidence) => ({ id, kind: 'constant', summary: '규칙', confidence, evidence: EV });
const flow = (id, title, confidences) => ({
  id, title, outcome: '끝', trigger: { kind: 'api', label: 'POST /orders', module: 'order' },
  actors: [{ id: 'client', kind: 'client', name: '고객' }],
  steps: confidences.map((confidence, i) => ({ n: i + 1, from: 'client', to: 'client', action: '요청', confidence, evidence: EV })),
});

function sampleOut() {
  return makeTree({
    '_data/module-map.json': JSON.stringify({
      project: { name: 'shop', root: '/x', summary: '쇼핑몰 서비스', stacks: ['node'] },
      modules: [{ id: 'order', abbrev: 'ORD', name: '주문', codeName: 'order', summary: 's', paths: ['src/order'], fileCount: 1, dependsOn: [] }],
    }),
    '_data/facts/order.json': JSON.stringify({ module: 'order', items: [fact('ORD-001', 'low'), fact('ORD-002', 'high')] }),
    '_data/flows/ord-001.json': JSON.stringify(flow('ord-001', '주문 생성', ['low', 'high'])),
    '_data/lifecycles/order.json': JSON.stringify({ id: 'order', title: '주문', module: 'order' }),
    'flows/ord-001/flow.md': '# 주문 생성 흐름\n\n![업무 흐름](diagrams/swimlane.html)',
    'flows/ord-001/diagrams/swimlane.html': `<html><head>${FONT}</head><body>lane</body></html>`,
    'data/order/data.md': '# 주문 데이터 생애',
    'overview/onboarding.md': '# 온보딩\n\n시작하기',
    'overview/architecture.html': `<html><head>${FONT}</head><body>arch</body></html>`,
    'policy/order/policy.md': '# 주문 정책\n\n![상태 전이도](diagrams/state.html)\n\n[흐름 전체 보기](../../flows/ord-001/flow.md) [흐름 제목](../../flows/ord-001/flow.md#주문-생성-흐름) [위로](#주문-정책) [그림 원본](diagrams/state.html) [없는 문서](../../data/ghost/data.md)',
    'policy/order/diagrams/state.html': `<html><head>${FONT}<style>@import url('https://fonts.googleapis.com/css2?family=X');</style></head></html>`,
    'spec/order/spec.md': '# 주문 명세',
  });
}

// The sample plus a second, never-analyzed module (회원): no policy, spec, data or flow documents.
function withMember(out) {
  const file = path.join(out, '_data/module-map.json');
  const map = JSON.parse(fs.readFileSync(file, 'utf8'));
  map.modules.push({ id: 'member', abbrev: 'MBR', name: '회원', codeName: 'member', summary: '회원 관리', paths: ['src/member'], fileCount: 9, dependsOn: [] });
  fs.writeFileSync(file, JSON.stringify(map));
  return out;
}

test('stripExternalFonts removes link tags and @import', () => {
  assert.equal(stripExternalFonts(`<head>${FONT}\n<style>@import url("https://fonts.googleapis.com/css2?family=X");a{}</style></head>`), '<head><style>a{}</style></head>');
});

test('collectDocs groups docs by business module: policy, spec, data, then flows', () => {
  assert.deepEqual(collectDocs(sampleOut()), [
    { group: '시작하기', kind: 'onboarding', relPath: 'overview/onboarding.md', moduleId: null, module: null, title: '온보딩 가이드' },
    { group: '주문', kind: 'policy', relPath: 'policy/order/policy.md', moduleId: 'order', module: 'order', title: '서비스 정책서' },
    { group: '주문', kind: 'spec', relPath: 'spec/order/spec.md', moduleId: 'order', module: 'order', title: '기술 명세서' },
    { group: '주문', kind: 'data', relPath: 'data/order/data.md', moduleId: null, module: 'order', title: '데이터 · 주문' },
    { group: '주문', kind: 'flow', relPath: 'flows/ord-001/flow.md', moduleId: null, module: 'order', title: '흐름 · 주문 생성' },
  ]);
});

test('collectDocs marks change logs and orphan documents with no module', () => {
  const out = sampleOut();
  fs.mkdirSync(path.join(out, 'changes'), { recursive: true });
  fs.writeFileSync(path.join(out, 'changes/2026-10-18-a1b2c3d.md'), '# 변경');
  fs.mkdirSync(path.join(out, 'data/coupon'), { recursive: true });
  fs.writeFileSync(path.join(out, 'data/coupon/data.md'), '# 쿠폰');
  const docs = collectDocs(out);
  assert.equal(docs.find((d) => d.kind === 'changes').module, null);
  assert.equal(docs.find((d) => d.relPath === 'data/coupon/data.md').module, null);
});

test('collectDocs names button flows by their button, lists them after API flows, and keeps orphans in 기타', () => {
  const out = sampleOut();
  fs.mkdirSync(path.join(out, 'flows/ui-order-btn-cancel'), { recursive: true });
  fs.writeFileSync(path.join(out, 'flows/ui-order-btn-cancel/flow.md'), '# 취소');
  fs.writeFileSync(path.join(out, '_data/flows/ui-order-btn-cancel.json'), JSON.stringify({
    ...flow('ui-order-btn-cancel', '주문 관리 화면에서 주문 취소', ['high']),
    trigger: { kind: 'ui', label: '주문 관리 · 주문 취소', module: 'order' },
  }));
  fs.mkdirSync(path.join(out, 'data/coupon'), { recursive: true });
  fs.writeFileSync(path.join(out, 'data/coupon/data.md'), '# 쿠폰');
  assert.deepEqual(collectDocs(out).slice(3).map((d) => [d.group, d.title]), [
    ['주문', '데이터 · 주문'],
    ['주문', '흐름 · 주문 생성'],
    ['주문', '버튼 · 주문 취소'],
    ['기타', '데이터 · coupon'],
  ]);
});

test('report nav: a module picker, 시작하기 in a details box, then one block per module with only its documents', () => {
  const html = fs.readFileSync(buildReport(withMember(sampleOut())).indexPath, 'utf8');
  const nav = /<nav>([^]*?)<\/nav>/.exec(html)[1];
  assert.match(nav, /^<select id="nav-mod" aria-label="모듈 선택"><option value="">전체 모듈<\/option><option value="order">주문<\/option><option value="member">회원 \(미분석\)<\/option><\/select>\n/);
  assert.match(nav, /<details class="nav-start" open><summary>시작하기<\/summary><a href="#doc-0">온보딩 가이드<\/a>\n<a href="#overview">구조도<\/a>/);
  assert.match(nav, /<details class="nav-mods" open><summary>모듈<\/summary><div class="nav-mod" data-module="order"><a class="mod-name" href="#doc-1">주문<\/a><div class="mod-docs"><a href="#doc-1">서비스 정책서<\/a>\n<a href="#doc-2">기술 명세서<\/a>\n<a href="#doc-3">데이터 · 주문<\/a>\n<a href="#doc-4">흐름 · 주문 생성<\/a><\/div><\/div>/);
  assert.match(nav, /<div class="nav-mod off" data-module="member"><a class="mod-name" href="#mod-member">회원<\/a><\/div><\/details>/);
  assert.doesNotMatch(nav, /최근 변경|기타/, 'empty groups are left out');
  assert.match(html, /<section id="doc-1" data-module="order"><p class="group">주문 · 서비스 정책서<\/p>/);
});

test('report nav keeps 최근 변경 and 기타 as plain groups outside the module blocks', () => {
  const out = sampleOut();
  fs.mkdirSync(path.join(out, 'changes'), { recursive: true });
  fs.writeFileSync(path.join(out, 'changes/2026-10-18-a1b2c3d.md'), '# 변경');
  fs.mkdirSync(path.join(out, 'data/coupon'), { recursive: true });
  fs.writeFileSync(path.join(out, 'data/coupon/data.md'), '# 쿠폰');
  const nav = /<nav>([^]*?)<\/nav>/.exec(fs.readFileSync(buildReport(out).indexPath, 'utf8'))[1];
  assert.match(nav, /<div class="nav-group"><h2>최근 변경<\/h2><a href="#doc-1">2026-10-18 \(a1b2c3d\)<\/a><\/div>/);
  assert.match(nav, /<div class="nav-group"><h2>기타<\/h2><a href="#doc-\d+">데이터 · coupon<\/a><\/div>$/);
  assert.ok(nav.indexOf('최근 변경') < nav.indexOf('class="nav-mods"'), '최근 변경 sits above the modules');
});

test('countNeedsReview counts low confidence items and flow steps', () => {
  assert.equal(countNeedsReview(sampleOut()), 2);
});

test('report readers skip invalid or unparseable data files instead of crashing', () => {
  const out = sampleOut();
  fs.writeFileSync(path.join(out, '_data/facts/payment.json'), JSON.stringify({ module: 'payment', items: [{ id: 'PAY-001', confidence: 'low' }] }));
  fs.writeFileSync(path.join(out, '_data/facts/broken.json'), '{ nope');
  fs.writeFileSync(path.join(out, '_data/flows/bad.json'), JSON.stringify({ id: 'bad', title: '나쁨', steps: null }));
  fs.writeFileSync(path.join(out, '_data/lifecycles/broken.json'), 'nope');
  assert.equal(countNeedsReview(out), 2);
  assert.equal(collectDocs(out).length, 5);
  assert.equal(buildReport(out).docs, 5);
});

test('buildReport writes index.html and strips fonts from diagrams', () => {
  const out = sampleOut();
  const { indexPath, docs } = buildReport(out);
  assert.equal(docs, 5);
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, /<title>shop · Groundwork<\/title>/);
  assert.match(html, /쇼핑몰 서비스/);
  assert.match(html, /src="overview\/architecture\.html"/);
  assert.match(html, /src="policy\/order\/diagrams\/state\.html"/);
  assert.match(html, /src="flows\/ord-001\/diagrams\/swimlane\.html"/);
  assert.match(html, /<div class="stat warn"><b>2<\/b><span>확인 필요<\/span><\/div>/);
  assert.doesNotMatch(html, /fonts\.googleapis/);
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'policy/order/diagrams/state.html'), 'utf8'), /fonts\.googleapis/);
});

test('injectDiagramFit inserts style and script once, before </head>', () => {
  const once = injectDiagramFit('<html><head><title>t</title></head><body>x</body></html>');
  const twice = injectDiagramFit(once);
  assert.equal(twice, once);
  assert.equal(once.split('<!-- groundwork:fit v3 -->').length - 1, 1);
  assert.match(once, /<style>svg\{min-width:0!important;max-width:100%!important;height:auto!important\}html,body\{min-height:0!important;height:auto!important\}<\/style>/);
  assert.match(once, /groundwork:diagram-height/);
  assert.ok(once.indexOf('<!-- groundwork:fit v3 -->') < once.indexOf('</head>'));
});

test('injectDiagramFit without </head> prepends', () => {
  const out = injectDiagramFit('<svg></svg>');
  assert.ok(out.startsWith('<!-- groundwork:fit v3 -->'));
  assert.ok(out.endsWith('<svg></svg>'));
  assert.equal(injectDiagramFit(out), out);
});

test('injectDiagramFit replaces an older fit block instead of stacking', () => {
  const old = '<html><head><!-- groundwork:fit --><style>svg{max-width:100%;height:auto}</style><script>x()</script></head></html>';
  const out = injectDiagramFit(old);
  assert.doesNotMatch(out, /<!-- groundwork:fit -->/);
  assert.equal(out.split('<!-- groundwork:fit v3 -->').length - 1, 1);
  assert.doesNotMatch(out, /x\(\)/);
});

test('buildReport adds height listener and open link; diagrams get marker once', () => {
  const out = sampleOut();
  buildReport(out);
  const { indexPath } = buildReport(out);
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, /groundwork:diagram-height/);
  assert.match(html, /<a class="diagram-open" href="overview\/architecture\.html" target="_blank" rel="noopener">새 창에서 크게 보기<\/a>/);
  assert.match(html, /\.diagram-open\{/);
  for (const f of ['overview/architecture.html', 'policy/order/diagrams/state.html', 'flows/ord-001/diagrams/swimlane.html']) {
    const d = fs.readFileSync(path.join(out, f), 'utf8');
    assert.equal(d.split('<!-- groundwork:fit v3 -->').length - 1, 1, f);
  }
});

test('index.html compensates iframe border in height listener and fixes narrow layout overflow', () => {
  const out = sampleOut();
  const html = fs.readFileSync(buildReport(out).indexPath, 'utf8');
  assert.ok(html.includes('offsetHeight - f.clientHeight'), 'listener adds frame border height');
  assert.match(html, /@media \(max-width:760px\)\{\.layout\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(html, /code\{[^}]*overflow-wrap:anywhere/, 'long inline code paths wrap instead of widening the page');
  assert.match(html, /th,td\{[^}]*word-break:keep-all/, 'Korean words in table cells are not broken per character');
  assert.match(html, /main\{[^}]*min-width:0/);
});

test('CLI prints index path and doc count', () => {
  const out = sampleOut();
  assert.match(execFileSync('node', [CLI, out], { encoding: 'utf8' }), /docs=5/);
});

test('index.html and diagrams carry a CSP that blocks remote loads but keeps inline code and local frames', () => {
  const out = sampleOut();
  const html = fs.readFileSync(buildReport(out).indexPath, 'utf8');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(csp, 'index.html has a CSP meta');
  assert.ok(html.indexOf(csp[0]) < html.indexOf('<style>'), 'CSP comes before any content');
  const dirs = Object.fromEntries(csp[1].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(dirs['default-src'], ["'none'"]);
  assert.ok(dirs['script-src'].includes("'unsafe-inline'"));
  assert.ok(dirs['style-src'].includes("'unsafe-inline'"));
  assert.deepEqual(dirs['frame-src'], ["'self'"]);
  assert.ok(!csp[1].includes('http'), 'no remote origins allowed');

  const diagram = fs.readFileSync(path.join(out, 'policy/order/diagrams/state.html'), 'utf8');
  const dcsp = diagram.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(dcsp, 'diagram has a CSP meta');
  assert.ok(diagram.indexOf(dcsp[0]) < diagram.indexOf('<style>'), 'diagram CSP comes first in head');
  assert.match(dcsp[1], /default-src 'none'/);
  buildReport(out);
  assert.equal(fs.readFileSync(path.join(out, 'policy/order/diagrams/state.html'), 'utf8').split('Content-Security-Policy').length - 1, 1);
});

test('CLI exits 2 when the output folder is inside the target or module-map.json is missing', () => {
  const target = makeTree({ 'src/main/resources/templates/page.html': '<html><head></head><body>t</body></html>' });
  const page = path.join(target, 'src/main/resources/templates/page.html');
  const before = fs.readFileSync(page, 'utf8');
  fs.mkdirSync(path.join(target, '_data'), { recursive: true });
  fs.writeFileSync(path.join(target, '_data/module-map.json'), JSON.stringify({ project: { name: 't', root: target, summary: 's', stacks: ['x'] }, modules: [] }));
  const inside = spawnSync('node', [CLI, target], { encoding: 'utf8' });
  assert.equal(inside.status, 2);
  assert.match(inside.stderr, /outside the target/);

  const bare = makeTree({ 'templates/page.html': before });
  const noMap = spawnSync('node', [CLI, bare], { encoding: 'utf8' });
  assert.equal(noMap.status, 2);
  assert.match(noMap.stderr, /module-map\.json/);

  assert.equal(fs.readFileSync(page, 'utf8'), before);
  assert.equal(fs.readFileSync(path.join(bare, 'templates/page.html'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(target, 'index.html')), false);
});

test('buildReport rewrites only diagram HTML in the known diagram folders', () => {
  const out = sampleOut();
  const stray = ['node_modules/pkg/readme.html', 'policy/order/notes.html', 'misc/page.html'];
  const html = `<html><head>${FONT}</head><body>x</body></html>`;
  for (const f of stray) {
    fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
    fs.writeFileSync(path.join(out, f), html);
  }
  buildReport(out);
  for (const f of stray) assert.equal(fs.readFileSync(path.join(out, f), 'utf8'), html, f);
  assert.match(fs.readFileSync(path.join(out, 'overview/architecture.html'), 'utf8'), /groundwork:fit/);
  assert.match(fs.readFileSync(path.join(out, 'flows/ord-001/diagrams/swimlane.html'), 'utf8'), /groundwork:fit/);
});

test('cross-document links jump to the rendered sections inside index.html', () => {
  const html = fs.readFileSync(buildReport(sampleOut()).indexPath, 'utf8');
  // docs: 0 onboarding, 1 policy, 2 spec, 3 data, 4 flow
  assert.match(html, /<a href="#doc-4">흐름 전체 보기<\/a>/);
  assert.match(html, /<a href="#doc-4-주문-생성-흐름">흐름 제목<\/a>/);
  assert.match(html, /<h1 id="doc-4-주문-생성-흐름">/);
  assert.match(html, /<a href="#doc-1-주문-정책">위로<\/a>/);
  assert.match(html, /<h1 id="doc-1-주문-정책">/);
  assert.match(html, /<a href="policy\/order\/diagrams\/state\.html">그림 원본<\/a>/, 'links to non-doc files stay relative');
  assert.match(html, /<a href="policy\/order\/..\/..\/data\/ghost\/data\.md">없는 문서<\/a>/, 'unknown docs keep the plain link');
  assert.doesNotMatch(html, /href="[^"#]*flow\.md/);
});

test('report and player share theme tokens and the top bar', async () => {
  const { THEME_TOKENS } = await import('../../plugin/scripts/lib/theme.mjs');
  const { renderPlayerPage } = await import('../../plugin/scripts/lib/player-page.mjs');
  const out = sampleOut();
  buildReport(out);
  const report = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const player = renderPlayerPage({ project: { name: 'shop' }, screens: [], flows: [], snippets: {} });
  for (const html of [report, player]) {
    assert.ok(html.includes(THEME_TOKENS.trim()), 'same tokens');
    assert.match(html, /<header class="top"><span class="brand">Groundwork<\/span>/);
  }
  assert.match(player, /<a class="nav-link" href="index\.html">분석 리포트 열기<\/a>/);
});

test('report opens on a home view with stats and module cards, documents get a table-of-contents slot', () => {
  const html = fs.readFileSync(buildReport(sampleOut()).indexPath, 'utf8');
  const main = html.slice(html.indexOf('<main>'));
  assert.match(main, /^<main>\n<section id="home">/);
  assert.match(html, /<html lang="ko" class="no-js">/);
  assert.match(html, /<div class="stat"><b>1 \/ 1<\/b><span>분석한 업무 모듈<\/span><\/div>/);
  assert.match(html, /<div class="mcard"><h3>주문<\/h3>/);
  assert.match(html, /<div class="mlinks"><a href="#doc-1">정책서<\/a><a href="#doc-2">명세서<\/a><a href="#doc-3">데이터 · 주문<\/a><a class="sub" href="#doc-4">흐름 · 주문 생성<\/a><\/div>/);
  assert.match(html, /<a class="scard" href="#doc-0"><b>온보딩 가이드<\/b>/);
  assert.match(html, /<section id="doc-1" data-module="order"><p class="group">주문 · 서비스 정책서<\/p><div class="doc-grid"><article class="doc-body"><h1/);
  assert.match(html, /<aside class="toc" aria-label="이 문서의 목차"><\/aside>/);
  assert.doesNotMatch(html, /data-player=/, 'no player link target without screens');
  assert.doesNotMatch(html, /충돌 \d/, 'no conflict badge without a conflicts file');
});

const cside = (label, ruleIds, file, line, snippet = 'code') => ({ label, ruleIds, evidence: [{ file, line, snippet }] });
const CONFLICTS = { generatedAt: '2026-10-19T00:00:00Z', conflicts: [
  { id: 'CFL-001', title: 'VIP 적립률: 화면 안내 5%, 실제 적립 3%', type: 'value-mismatch', scenario: 'VIP 회원이 10만원 구매확정 → 화면은 5,000P 안내, 실제 3,000P 적립',
    impact: 'VIP 고객이 안내보다 적은 포인트를 받는다', severity: 'high', confidence: 'high', status: 'open', firstSeen: '2026-10-01',
    sides: [cside('화면', ['ORD-002'], 'src/order.js', 1, 'rate = 5 < 6'), cside('서버', [], 'src/point/PointService.java', 40)] },
  { id: 'CFL-002', title: '서버는 결제완료 취소를 허용하지만 화면이 막는다', type: 'screen-server', scenario: '결제완료 주문 취소 → 화면 차단', impact: '고객 문의',
    severity: 'medium', confidence: 'medium', status: 'open', firstSeen: 'a1b2c3d', sides: [cside('서버', [], 'src/OrdService.java', 12), cside('화면', [], 'src/OrdMng.xfdl', 30)] },
  { id: 'CFL-003', title: '확인 안 된 충돌', type: 'cross-module-timing', scenario: 's', impact: 'i', severity: 'low', confidence: 'high', status: 'unverified', firstSeen: '2026-10-01',
    verifyFailed: true, sides: [cside('a', [], 'src/a.js', 1), cside('b', [], 'src/b.js', 2)] },
] };

function conflictOut({ conflicts = JSON.stringify(CONFLICTS), change = true } = {}) {
  const out = sampleOut();
  fs.writeFileSync(path.join(out, 'policy/order/policy.md'), '# 주문 정책\n\n## 3. 업무 규칙\n\n### ORD-002 주문 적립률\n- 정책: x\n- 근거: `src/order.js:1`\n');
  if (conflicts !== null) fs.writeFileSync(path.join(out, '_data/conflicts.json'), conflicts);
  if (change) {
    fs.mkdirSync(path.join(out, '_data/changes'), { recursive: true });
    fs.writeFileSync(path.join(out, '_data/changes/2026-10-01-0000000.json'), JSON.stringify({ from: 'x', to: '0000000', date: '2026-10-01', items: [] }));
    fs.writeFileSync(path.join(out, '_data/changes/2026-10-18-a1b2c3d.json'), JSON.stringify({ from: 'x', to: 'a1b2c3d', date: '2026-10-18', items: [],
      conflicts: { added: [{ id: 'CFL-002', title: CONFLICTS.conflicts[1].title, severity: 'medium' }], resolved: [], changed: [], kept: ['CFL-001'],
        needsReview: [{ id: 'CFL-003', title: CONFLICTS.conflicts[2].title }], at: CONFLICTS.generatedAt } }));
  }
  return out;
}
const articleOf = (html, id) => {
  const start = html.indexOf(`<article class="cfl`, html.indexOf(`id="cfl-${id}"`) - 60);
  return html.slice(start, html.indexOf('</article>', start));
};

test('home shows the open policy conflicts with this update\'s change, and a conflict view lists them', () => {
  const html = fs.readFileSync(buildReport(conflictOut()).indexPath, 'utf8');
  const home = html.slice(html.indexOf('<section id="home">'), html.indexOf('</section>', html.indexOf('<section id="home">')));
  assert.match(home, /<div class="stat"><b>2<\/b><span>업무 규칙<\/span><\/div><div class="stat warn"><b>2<\/b><span>정책 충돌<\/span><\/div>/, 'open only, right after 업무 규칙');
  assert.match(home, /<a class="cflcard warn" href="#conflicts">/);
  assert.match(home, /정책 충돌 <b>2<\/b>건/);
  assert.match(home, /높음 1/);
  assert.match(home, /보통 1/);
  assert.match(home, /이번 변경: 새 충돌 1 · 해소 0/);

  assert.match(html, /<section id="conflicts">/);
  assert.match(html, /<nav>[^]*<a href="#conflicts">정책 충돌<\/a>[^]*<\/nav>/);
  const c1 = articleOf(html, 'CFL-001');
  const c2 = articleOf(html, 'CFL-002');
  assert.match(c1, /id="cfl-CFL-001"/);
  assert.match(c1, /기준값 불일치/);
  assert.match(c1, /VIP 회원이 10만원 구매확정/);
  assert.match(c1, /VIP 고객이 안내보다 적은 포인트를 받는다/);
  assert.match(c1, /title="src\/point\/PointService\.java:40">PointService\.java:40</);
  assert.match(c1, /rate = 5 &lt; 6/, 'snippets are escaped');
  assert.match(c1, /<a href="#doc-1-ord-002-[^"]*">ORD-002<\/a>/, 'related policy links to the policy heading');
  assert.doesNotMatch(c1, /NEW/);
  assert.match(c2, /<span class="cfl-new">NEW<\/span>/);
  assert.match(c2, /화면·서버 불일치/);
  assert.match(c2, /추론/, 'medium confidence is marked as inferred');
  const sec = html.slice(html.indexOf('<section id="conflicts">'));
  assert.ok(sec.indexOf('확인 필요') < sec.indexOf('id="cfl-CFL-003"'), 'unverified sits under 확인 필요');
  assert.ok(sec.indexOf('id="cfl-CFL-002"') < sec.indexOf('확인 필요'));
});

test('policy rule headings get a badge for each open conflict', () => {
  const html = fs.readFileSync(buildReport(conflictOut()).indexPath, 'utf8');
  assert.match(html, /<h3 id="doc-1-ord-002-[^"]*">ORD-002 주문 적립률 <a class="cfl-badge" href="#cfl-CFL-001">CFL-001<\/a><\/h3>/);
  assert.doesNotMatch(html, /href="#cfl-CFL-003"/, 'unverified conflicts get no badge');
});

test('the home card has no change line when the latest change log has no conflicts', () => {
  const out = conflictOut({ change: false });
  fs.mkdirSync(path.join(out, '_data/changes'), { recursive: true });
  fs.writeFileSync(path.join(out, '_data/changes/2026-10-18-a1b2c3d.json'), JSON.stringify({ items: [] }));
  const html = fs.readFileSync(buildReport(out).indexPath, 'utf8');
  assert.match(html, /<a class="cflcard warn" href="#conflicts">/);
  assert.doesNotMatch(html, /이번 변경/);
  assert.doesNotMatch(html, /class="cfl-new"/);
});

test('the change line and NEW badges come only from the newest change log, and only while it matches conflicts.json', () => {
  // A later full run rewrote conflicts.json: the last update's comparison is stale.
  const stale = conflictOut({ conflicts: JSON.stringify({ ...CONFLICTS, generatedAt: '2026-10-20T00:00:00.000Z' }) });
  // Newest by time, not by name: a change log written after the one named later.
  const older = conflictOut();
  const future = new Date(Date.now() + 60_000);
  fs.utimesSync(path.join(older, '_data/changes/2026-10-01-0000000.json'), future, future);
  for (const out of [stale, older]) {
    const html = fs.readFileSync(buildReport(out).indexPath, 'utf8');
    assert.match(html, /<a class="cflcard warn" href="#conflicts">/);
    assert.doesNotMatch(html, /이번 변경/);
    assert.doesNotMatch(html, /class="cfl-new"/);
  }
});

test('reports without a conflicts file, or with a broken one, show no conflict UI', () => {
  for (const conflicts of [null, '{ nope', JSON.stringify({ conflicts: [{ id: 'CFL-1' }] })]) {
    const out = conflictOut({ conflicts });
    const html = fs.readFileSync(buildReport(out).indexPath, 'utf8');
    assert.doesNotMatch(html, /id="conflicts"/);
    assert.doesNotMatch(html, /<span>정책 충돌<\/span>/);
    assert.doesNotMatch(html, /class="cflcard/);
    assert.doesNotMatch(html, /<a class="cfl-badge"/);
  }
});

test('zero conflicts reads as ok on home and says so in the conflict view', () => {
  const out = conflictOut({ conflicts: JSON.stringify({ generatedAt: 'x', conflicts: [] }), change: false });
  const html = fs.readFileSync(buildReport(out).indexPath, 'utf8');
  assert.match(html, /<div class="stat ok"><b>0<\/b><span>정책 충돌<\/span><\/div>/);
  assert.match(html, /<a class="cflcard ok" href="#conflicts">/);
  assert.match(html, /<section id="conflicts">[^]*발견된 충돌이 없습니다\./);
});

test('a module with no documents gets a guide section with its file count and the analyze command', () => {
  const out = withMember(sampleOut());
  const html = fs.readFileSync(buildReport(out).indexPath, 'utf8');
  const sec = html.slice(html.indexOf('<section id="mod-member"'), html.indexOf('</section>', html.indexOf('<section id="mod-member"')));
  assert.match(sec, /^<section id="mod-member" data-module="member"><p class="group">회원 · 미분석<\/p><h2>회원<\/h2>/);
  assert.match(sec, /<p class="lead">회원 관리<\/p>/);
  assert.match(sec, /파일 9개 · 아직 analyze하지 않은 모듈입니다\./);
  assert.match(sec, /<pre><code>\/groundwork:analyze &quot;[^<]+&quot; member<\/code><\/pre>/);
  assert.doesNotMatch(html, /id="mod-order"/, 'analyzed modules need no guide section');
});

test('home maps every module: analyzed cards as before, the rest dimmed with their file count, a conflict badge per module', () => {
  const html = fs.readFileSync(buildReport(withMember(conflictOut())).indexPath, 'utf8');
  const home = html.slice(html.indexOf('<section id="home">'), html.indexOf('</section>', html.indexOf('<section id="home">')));
  assert.match(home, /<div class="stat"><b>1 \/ 2<\/b><span>분석한 업무 모듈<\/span><\/div>/);
  assert.match(home, /<div class="mcard"><h3>주문<\/h3>[^]*?<div class="chips">[^]*?<span class="chip warn">충돌 1<\/span>/);
  assert.match(home, /<a class="mcard off" href="#mod-member"><h3>회원<\/h3><p>회원 관리<\/p><div class="chips"><span class="chip zero">미분석<\/span><span class="chip zero">파일 9개<\/span><\/div><\/a>/);
  assert.ok(home.indexOf('<h3>주문</h3>') < home.indexOf('<h3>회원</h3>'), 'module-map order');
});

test('the rule search sits in the report top bar; home has no second box; no rules means no box', () => {
  const html = fs.readFileSync(buildReport(sampleOut()).indexPath, 'utf8');
  const header = /<header class="top">[^]*?<\/header>/.exec(html)[0];
  assert.match(header, /<span class="proj">shop<\/span><form class="qs" id="qs" role="search"><input type="search" id="qs-in" placeholder="규칙 찾기 \(Ctrl\+K\)" autocomplete="off" aria-label="규칙 찾기"><\/form>/);
  assert.equal(html.match(/id="qs"/g).length, 1, 'one search box on the page');
  const bare = makeTree({ '_data/module-map.json': JSON.stringify({ project: { name: 'p' } }), 'overview/onboarding.md': '# 온보딩' });
  assert.doesNotMatch(fs.readFileSync(buildReport(bare).indexPath, 'utf8'), /id="qs"/);
});

// Just enough DOM for viewClient's nav switching: classes, dataset, a few queries and listeners.
function fakeNavPage() {
  const listeners = {};
  const cls = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), replace: (a, b) => { s.delete(a); s.add(b); }, toggle: (c, on) => (on ? s.add(c) : s.delete(c)) }; };
  const node = (props = {}) => ({ classList: cls(), dataset: {}, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, getAttribute(n) { return this.attrs?.[n]; }, querySelector: () => null, closest() { return this.view ?? null; }, ...props });
  const views = ['home', 'doc-1', 'mod-member'].map((id) => node({ id }));
  views[1].dataset.module = 'order';
  views[2].dataset.module = 'member';
  for (const v of views) v.view = v;
  const modName = (href) => node({ attrs: { href } });
  const blocks = [node({ dataset: { module: 'order' } }), node({ dataset: { module: 'member' } })];
  blocks[0].querySelector = () => modName('#doc-1');
  blocks[1].querySelector = () => modName('#mod-member');
  const nav = node();
  const picker = node({ value: '' });
  const start = node({ open: true });
  const mods = node({ open: true });
  const qsIn = node({ focused: false, selected: false, focus() { this.focused = true; }, select() { this.selected = true; } });
  const byId = { home: views[0], 'doc-1': views[1], 'mod-member': views[2], 'nav-mod': picker, 'qs-in': qsIn };
  const all = { 'main > section': views, 'nav .nav-mod': blocks };
  const document = {
    documentElement: node(), body: node({ dataset: {} }),
    getElementById: (id) => byId[id] ?? null,
    querySelector: (q) => ({ nav, 'nav .nav-start': start, 'nav .nav-mods': mods }[q] ?? null),
    querySelectorAll: (q) => all[q] ?? [],
  };
  const location = { hash: '' };
  const win = { document, location, addEventListener: (t, f) => { listeners[t] = f; }, requestAnimationFrame: () => {}, setTimeout: () => {}, scrollTo: () => {}, decodeURIComponent };
  const run = new Function(...Object.keys(win), `(${viewClient.toString()})();`);
  run(...Object.values(win));
  const go = (hash) => { location.hash = hash; listeners.hashchange(); };
  return { nav, picker, start, mods, blocks, qsIn, location, listeners, go };
}

test('the nav follows the open view: module documents only inside a module, 시작하기 and module names outside', () => {
  const p = fakeNavPage();
  assert.equal(p.nav.classList.contains('in-mod'), false, 'home is outside any module');
  assert.equal(p.start.open, true);
  assert.equal(p.picker.value, '');

  p.go('#doc-1');
  assert.equal(p.nav.classList.contains('in-mod'), true);
  assert.equal(p.blocks[0].classList.contains('cur'), true);
  assert.equal(p.blocks[1].classList.contains('cur'), false);
  assert.equal(p.picker.value, 'order');
  assert.equal(p.start.open, false, '시작하기 folds inside a module');

  p.go('#mod-member');
  assert.equal(p.blocks[1].classList.contains('cur'), true);
  assert.equal(p.picker.value, 'member');

  p.go('#home');
  assert.equal(p.nav.classList.contains('in-mod'), false);
  assert.equal(p.start.open, true);
});

test('a folded module list opens again when a module is opened, so its documents stay visible', () => {
  const p = fakeNavPage();
  p.mods.open = false;
  p.go('#home');
  assert.equal(p.mods.open, false, 'outside a module the reader\'s fold is kept');
  p.go('#doc-1');
  assert.equal(p.mods.open, true);
});

test('picking a module jumps to its first document, 전체 모듈 goes home, and Ctrl/Cmd+K focuses the search', () => {
  const p = fakeNavPage();
  p.picker.value = 'order';
  p.picker.listeners.change();
  assert.equal(p.location.hash, 'doc-1');
  p.picker.value = '';
  p.picker.listeners.change();
  assert.equal(p.location.hash, 'home');

  let prevented = false;
  p.listeners.keydown({ ctrlKey: true, metaKey: false, altKey: false, key: 'k', preventDefault: () => { prevented = true; } });
  assert.ok(prevented && p.qsIn.focused && p.qsIn.selected);
  p.qsIn.focused = false;
  p.listeners.keydown({ ctrlKey: false, metaKey: true, altKey: false, key: 'K', preventDefault: () => {} });
  assert.ok(p.qsIn.focused, 'Cmd+K on macOS');
});

test('Ctrl+K is ignored while an IME is composing', () => {
  const p = fakeNavPage();
  let prevented = false;
  p.listeners.keydown({ ctrlKey: true, metaKey: false, altKey: false, isComposing: true, key: 'k', preventDefault: () => { prevented = true; } });
  assert.ok(!prevented && !p.qsIn.focused);
});
