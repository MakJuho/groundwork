import fs from 'node:fs';
import path from 'node:path';
import { loadJsonDir, warnSkipped } from './jsondir.mjs';
import { DIAGRAM_OPEN, escapeHtml, renderMarkdown } from './markdown.mjs';
import { validateFacts, validateFlow } from './validate.mjs';
import { buildRuleIndex, readConflicts } from './rules.mjs';
import { FINDER_STYLE, renderRuleFinder } from './rule-finder.mjs';
import { writeJsonAtomic } from './jsondir.mjs';
import { linkButtonsToFlows } from './player.mjs';
import { THEME_TOKENS, TOP_BAR_STYLE, topBar } from './theme.mjs';
import { VIEW_STYLE, viewClient } from './report-view.mjs';

const FONT_LINK = /<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*/gi;
const FONT_IMPORT = /@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\);?/gi;

export function stripExternalFonts(html) {
  return html.replace(FONT_LINK, '').replace(FONT_IMPORT, '');
}

// diagram-design templates set `svg{min-width:1000px}` (beats max-width) and `body{min-height:100vh}`
// (pins the measured height to the iframe height), so both have to be reset explicitly.
const FIT_MARKER = '<!-- groundwork:fit v3 -->';
const OLD_FIT_BLOCK = /<!-- groundwork:fit[^>]*-->[\s\S]*?<\/script>/g;
const FIT_BLOCK = `${FIT_MARKER}<style>svg{min-width:0!important;max-width:100%!important;height:auto!important}html,body{min-height:0!important;height:auto!important}</style><script>(function(){var w=-1;function send(){var b=document.body;if(!b)return;var s=getComputedStyle(b);var h=Math.ceil(b.getBoundingClientRect().height+(parseFloat(s.marginTop)||0)+(parseFloat(s.marginBottom)||0));w=innerWidth;parent.postMessage({type:'groundwork:diagram-height',height:h},'*');}addEventListener('load',send);addEventListener('resize',function(){if(innerWidth!==w)send();});})();</script>`;

export function injectDiagramFit(html) {
  if (html.includes(FIT_BLOCK)) return html;
  html = html.replace(OLD_FIT_BLOCK, '');
  const i = html.search(/<\/head>/i);
  return i === -1 ? FIT_BLOCK + html : html.slice(0, i) + FIT_BLOCK + html.slice(i);
}

// The report is opened from file:// and diagrams are model-written HTML with scripts, so both pages
// forbid every remote load. Inline styles/scripts stay allowed (the report and the diagram-design
// templates are self-contained) and index.html may frame the local diagram files. Links are
// navigations, which CSP does not govern. Note: on file:// pages Chrome lets 'self' match any file:
// URL, including file://host/... — markdown.mjs rejects network paths before they get here.
export const REPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; base-uri 'none'; form-action 'none'";
export const DIAGRAM_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; base-uri 'none'; form-action 'none'";
const cspMeta = (policy) => `<meta http-equiv="Content-Security-Policy" content="${policy}">`;

// The CSP meta only covers what follows it, so it goes right after <head>.
export function injectDiagramCsp(html) {
  const meta = cspMeta(DIAGRAM_CSP);
  if (html.includes(meta)) return html;
  const head = html.match(/<head(\s[^>]*)?>/i);
  return head ? html.slice(0, head.index + head[0].length) + meta + html.slice(head.index + head[0].length) : meta + html;
}

const HEIGHT_LISTENER = `window.addEventListener('message',function(e){var d=e.data;if(!d||d.type!=='groundwork:diagram-height'||typeof d.height!=='number'||!isFinite(d.height))return;var h=Math.min(4000,Math.max(100,d.height));var frames=document.querySelectorAll('iframe.diagram');for(var i=0;i<frames.length;i++){var f=frames[i];if(f.contentWindow===e.source){f.style.height=(h+(f.offsetHeight - f.clientHeight)+2)+'px';}}});`;

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`WARN skipped ${file}: unreadable JSON: ${err.message}`);
    return null;
  }
}

const isLifecycle = (lc) => (lc && typeof lc === 'object' && typeof lc.id === 'string' && lc.id ? [] : ['id: string required']);
const DATA_VALIDATORS = { facts: validateFacts, flows: validateFlow, lifecycles: isLifecycle };

function readDataDir(outDir, sub) {
  const { entries, skipped } = loadJsonDir(path.join(outDir, '_data', sub), DATA_VALIDATORS[sub]);
  warnSkipped(skipped);
  return entries.map((e) => e.data);
}

// Docs are grouped the way readers look for them: 시작하기, 최근 변경, then one group per business
// module (its policy, spec, data and flows), so the reader picks the module first and the document second.
export function collectDocs(outDir) {
  const moduleMap = readJson(path.join(outDir, '_data', 'module-map.json'));
  const names = new Map((moduleMap?.modules ?? []).map((m) => [m.id, m.name]));
  const docs = [];
  if (fs.existsSync(path.join(outDir, 'overview', 'onboarding.md'))) {
    docs.push({ group: '시작하기', kind: 'onboarding', relPath: 'overview/onboarding.md', moduleId: null, module: null, title: '온보딩 가이드' });
  }
  // changes/<YYYY-MM-DD>-<commit7>.md, newest first: what changed is what readers come back for.
  const changesDir = path.join(outDir, 'changes');
  if (fs.existsSync(changesDir)) {
    for (const name of fs.readdirSync(changesDir).filter((f) => f.endsWith('.md')).sort().reverse()) {
      const m = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/.exec(name);
      docs.push({ group: '최근 변경', kind: 'changes', relPath: `changes/${name}`, moduleId: null, module: null, title: m ? `${m[1]} (${m[2]})` : name.slice(0, -3) });
    }
  }

  const byModule = new Map();
  const add = (module, doc) => {
    if (!byModule.has(module)) byModule.set(module, []);
    byModule.get(module).push(doc);
  };
  const docIds = (dir, file) => {
    const abs = path.join(outDir, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs).sort().filter((id) => fs.existsSync(path.join(abs, id, file)));
  };
  for (const id of docIds('policy', 'policy.md')) add(id, { kind: 'policy', relPath: `policy/${id}/policy.md`, moduleId: id, module: id, title: '서비스 정책서' });
  for (const id of docIds('spec', 'spec.md')) add(id, { kind: 'spec', relPath: `spec/${id}/spec.md`, moduleId: id, module: id, title: '기술 명세서' });
  const lifecycles = new Map(readDataDir(outDir, 'lifecycles').map((lc) => [lc.id, lc]));
  for (const id of docIds('data', 'data.md')) {
    const lc = lifecycles.get(id);
    add(lc?.module ?? null, { kind: 'data', relPath: `data/${id}/data.md`, moduleId: null, module: lc?.module ?? null, title: `데이터 · ${lc?.title ?? id}` });
  }
  // API flows first, then the screen buttons that play them. A button is named by its label without
  // the screen part ("주문 관리 · 주문 취소" → "주문 취소"): the group already says which module it is.
  const flows = new Map(readDataDir(outDir, 'flows').map((f) => [f.id, f]));
  const isUi = (id) => flows.get(id)?.trigger?.kind === 'ui';
  for (const id of docIds('flows', 'flow.md').sort((a, b) => isUi(a) - isUi(b))) {
    const f = flows.get(id);
    const title = isUi(id) ? `버튼 · ${String(f.trigger.label ?? f.title).split(' · ').pop()}` : `흐름 · ${f?.title ?? id}`;
    add(f?.trigger?.module ?? null, { kind: 'flow', relPath: `flows/${id}/flow.md`, moduleId: null, module: f?.trigger?.module ?? null, title });
  }

  const known = [...names.keys()].filter((id) => byModule.has(id));
  const other = [...byModule.keys()].filter((id) => id !== null && !names.has(id)).sort();
  for (const id of [...known, ...other]) {
    for (const doc of byModule.get(id)) docs.push({ group: names.get(id) ?? id, ...doc });
  }
  for (const doc of byModule.get(null) ?? []) docs.push({ group: '기타', ...doc });
  return docs;
}

// Every module a reader can pick: module-map order, then module ids that only documents mention.
// `docs` holds indexes into the collectDocs list (the N of #doc-N); no documents means not analyzed yet.
export function listModules(moduleMap, docs) {
  const mapped = (moduleMap?.modules ?? []).map((m) => ({ id: m.id, name: m.name ?? m.id, summary: m.summary ?? '', fileCount: m.fileCount ?? null }));
  const known = new Set(mapped.map((m) => m.id));
  const extra = [...new Set(docs.map((d) => d.module).filter((id) => id && !known.has(id)))].sort()
    .map((id) => ({ id, name: id, summary: '', fileCount: null }));
  return [...mapped, ...extra].map((m) => ({ ...m, docs: docs.flatMap((d, i) => (d.module === m.id ? [i] : [])) }));
}

// A module scan found but analyze has not covered yet: what it is and how to analyze it.
function renderModuleStub(m, outDir) {
  const files = m.fileCount === null ? '' : `파일 ${m.fileCount}개 · `;
  return `<section id="mod-${escapeHtml(m.id)}" data-module="${escapeHtml(m.id)}"><p class="group">${escapeHtml(m.name)} · 미분석</p><h2>${escapeHtml(m.name)}</h2>
${m.summary ? `<p class="lead">${escapeHtml(m.summary)}</p>` : ''}<p class="stub">${files}아직 analyze하지 않은 모듈입니다. 분석하려면 다음 명령을 실행합니다.</p>
<pre><code>/groundwork:analyze ${escapeHtml(`"${path.resolve(outDir)}"`)} ${escapeHtml(m.id)}</code></pre></section>`;
}

export function countNeedsReview(outDir) {
  const low = (list) => (list ?? []).filter((it) => it.confidence === 'low').length;
  return readDataDir(outDir, 'facts').reduce((sum, f) => sum + low(f.items), 0)
    + readDataDir(outDir, 'flows').reduce((sum, f) => sum + low(f.steps), 0);
}

// Only the places Groundwork writes diagrams: overview/*.html and {policy,spec,flows,data}/<id>/diagrams/*.html.
// Any other HTML under the folder is never touched.
function listDiagramHtml(outDir) {
  const htmlIn = (dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((ent) => ent.isFile() && ent.name.endsWith('.html'))
      .map((ent) => path.join(dir, ent.name));
  };
  const subdirs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name)) : []);
  const found = htmlIn(path.join(outDir, 'overview'));
  for (const group of ['policy', 'spec', 'flows', 'data']) {
    for (const docDir of subdirs(path.join(outDir, group))) found.push(...htmlIn(path.join(docDir, 'diagrams')));
  }
  return found;
}

const STYLE = `
${THEME_TOKENS}
${TOP_BAR_STYLE}
${VIEW_STYLE}
`;

const CONFLICT_TYPE_LABEL = {
  'screen-server': '화면·서버 불일치', 'value-mismatch': '기준값 불일치',
  'cross-module-timing': '모듈 간 시점 어긋남', 'calculation-mismatch': '계산 방식 불일치',
};
const SEVERITY_LABEL = { high: '높음', medium: '보통', low: '낮음' };
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

// The newest change log (by write time, then name) carries what the last update did to conflicts, if
// diff-conflicts ran. It counts only while conflicts.json is still the one it compared (`at`): a later
// full run or a rollback rewrites conflicts.json, and the old delta would then be wrong.
function latestConflictChange(outDir, doc) {
  const dir = path.join(outDir, '_data', 'changes');
  if (!fs.existsSync(dir)) return null;
  const logs = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }));
  const last = logs.sort((a, b) => a.mtime - b.mtime || a.name.localeCompare(b.name)).at(-1);
  const c = last ? readJson(path.join(dir, last.name))?.conflicts : null;
  if (!c || typeof c !== 'object' || !c.at || c.at !== doc?.generatedAt) return null;
  return { added: Array.isArray(c.added) ? c.added : [], resolved: Array.isArray(c.resolved) ? c.resolved : [] };
}

// Home card under the stats: how many open conflicts, by severity, and what the last update changed.
function renderConflictCard({ open, change }) {
  const bySeverity = ['high', 'medium', 'low'].map((sev) => [sev, open.filter((c) => c.severity === sev).length]).filter(([, n]) => n);
  const chips = bySeverity.map(([sev, n]) => `<span class="sev sev-${sev}">${SEVERITY_LABEL[sev]} ${n}</span>`).join('');
  const delta = change ? `<span class="cfl-delta">이번 변경: 새 충돌 ${change.added.length} · 해소 ${change.resolved.length}</span>` : '';
  const note = open.length ? '규칙끼리 어긋나는 곳 · 근거 코드 확인됨' : '규칙끼리 어긋나는 곳이 없습니다';
  return `<a class="cflcard ${open.length ? 'warn' : 'ok'}" href="#conflicts"><span class="cfl-main"><span class="cfl-n">정책 충돌 <b>${open.length}</b>건</span><span class="cfl-note">${note}</span></span>`
    + `<span class="cfl-side">${chips ? `<span class="sevs">${chips}</span>` : ''}${delta}</span><span class="cfl-go" aria-hidden="true">→</span></a>`;
}

// One conflict: what goes wrong, for whom, and the code on each side with its policy numbers.
function renderConflict(c, { isNew, policyAnchor, finder }) {
  const ruleLink = (id) => {
    if (policyAnchor[id]) return `<a href="#${policyAnchor[id]}">${escapeHtml(id)}</a>`;
    return finder ? `<a href="#rule=${escapeHtml(id)}">${escapeHtml(id)}</a>` : escapeHtml(id);
  };
  const sides = c.sides.map((s) => {
    const rules = s.ruleIds.length ? `<span class="cfl-rules">관련 정책 ${s.ruleIds.map(ruleLink).join(' ')}</span>` : '';
    const ev = s.evidence.map((e) => {
      const loc = `${e.file}:${e.line}`;
      return `<li><span class="loc" title="${escapeHtml(loc)}">${escapeHtml(`${e.file.split('/').pop()}:${e.line}`)}</span><code>${escapeHtml(e.snippet ?? '')}</code></li>`;
    }).join('');
    return `<div class="cfl-sidebox"><p class="cfl-label"><b>${escapeHtml(s.label)}</b>${rules}</p><ul class="ev">${ev}</ul></div>`;
  }).join('');
  const conf = c.confidence === 'medium' ? '<span class="tag">●●○ 추론</span>' : '<span class="tag">●●● 코드에 명시</span>';
  return `<article class="cfl sev-${escapeHtml(c.severity)}${c.status === 'open' ? '' : ' unverified'}" id="cfl-${escapeHtml(c.id)}">
<div class="cfl-h"><span class="cid">${escapeHtml(c.id)}</span>${isNew ? '<span class="cfl-new">NEW</span>' : ''}<h3>${escapeHtml(c.title)}</h3></div>
<div class="cfl-tags"><span class="sev sev-${escapeHtml(c.severity)}">심각도 ${SEVERITY_LABEL[c.severity] ?? escapeHtml(c.severity)}</span><span class="tag">${CONFLICT_TYPE_LABEL[c.type] ?? escapeHtml(c.type)}</span>${conf}</div>
<dl class="cfl-story"><dt>시나리오</dt><dd>${escapeHtml(c.scenario)}</dd><dt>영향</dt><dd>${escapeHtml(c.impact)}</dd></dl>
<div class="cfl-sides">${sides}</div>
</article>`;
}

function renderConflictSection({ doc, change, policyAnchor, finder }) {
  const added = new Set((change?.added ?? []).map((c) => c.id));
  const bySeverity = (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || a.id.localeCompare(b.id);
  const open = doc.conflicts.filter((c) => c.status === 'open').sort(bySeverity);
  const unverified = doc.conflicts.filter((c) => c.status !== 'open').sort(bySeverity);
  const one = (c) => renderConflict(c, { isNew: added.has(c.id), policyAnchor, finder });
  const delta = change ? `<p class="cfl-delta">이번 변경: 새 충돌 ${change.added.length} · 해소 ${change.resolved.length}</p>` : '';
  return `<section id="conflicts"><p class="group">시작하기 · 정책 충돌</p><h2>정책 충돌 ${open.length}건</h2>
<p class="lead">규칙과 규칙이 서로 어긋나 고객이나 회사가 손해를 볼 수 있는 곳입니다. 양쪽 근거 코드 줄을 확인한 충돌만 셉니다.</p>${delta}
${open.length ? open.map(one).join('\n') : '<p class="cfl-empty">발견된 충돌이 없습니다.</p>'}
${unverified.length ? `<h3 class="sh">확인 필요</h3><p class="cfl-note">근거 코드 줄 확인에 실패해 충돌 수에서 뺐습니다. 담당 개발자 확인이 필요합니다.</p>\n${unverified.map(one).join('\n')}` : ''}
</section>`;
}

// Open conflicts per module, counted once per conflict: a conflict touches a module when one of its
// sides cites a rule of that module (buildRuleIndex keeps only open conflicts on rules).
function openConflictsByModule(index) {
  const by = new Map();
  for (const r of index.rules) {
    for (const id of r.conflicts ?? []) {
      if (!by.has(r.module)) by.set(r.module, new Set());
      by.get(r.module).add(id);
    }
  }
  return by;
}

// The first screen: what this project is, how big the analysis is, and a map of every module.
function renderHome({ outDir, title, summary, modules, docs, index, needsReview, overview, player, conflicts }) {
  const verify = readJson(path.join(outDir, '_data', 'verify-report.json'));
  const analyzed = modules.filter((m) => m.docs.length);
  const stat = (n, label, cls = '') => `<div class="stat${cls ? ` ${cls}` : ''}"><b>${n}</b><span>${label}</span></div>`;
  const stats = [
    stat(`${analyzed.length} / ${modules.length}`, '분석한 업무 모듈'),
    index.rules.length ? stat(index.rules.length, '업무 규칙') : '',
    conflicts ? stat(conflicts.open.length, '정책 충돌', conflicts.open.length ? 'warn' : 'ok') : '',
    stat(docs.filter((d) => d.kind === 'flow').length, '흐름 문서'),
    stat(needsReview, '확인 필요', needsReview ? 'warn' : 'ok'),
    verify ? stat(verify.failedTotal ?? 0, '인용 검증 실패', verify.failedTotal ? 'warn' : 'ok') : '',
  ].join('');
  const anchor = (doc) => `#doc-${docs.indexOf(doc)}`;
  const short = { policy: '정책서', spec: '명세서', data: '데이터' };
  const conflictsBy = conflicts ? openConflictsByModule(index) : new Map();
  const cards = modules.map((m) => {
    if (!m.docs.length) {
      const files = m.fileCount === null ? '' : `<span class="chip zero">파일 ${m.fileCount}개</span>`;
      return `<a class="mcard off" href="#mod-${escapeHtml(m.id)}"><h3>${escapeHtml(m.name)}</h3><p>${escapeHtml(m.summary)}</p><div class="chips"><span class="chip zero">미분석</span>${files}</div></a>`;
    }
    const own = m.docs.map((i) => docs[i]);
    const rules = index.rules.filter((r) => r.module === m.id);
    const low = rules.filter((r) => r.confidence === 'low').length;
    const cfl = conflictsBy.get(m.id)?.size ?? 0;
    const docLinks = own.filter((d) => short[d.kind]).map((d) => `<a href="${anchor(d)}">${escapeHtml(d.kind === 'data' ? d.title : short[d.kind])}</a>`);
    const flowLinks = own.filter((d) => d.kind === 'flow').map((d) => `<a class="sub" href="${anchor(d)}">${escapeHtml(d.title)}</a>`);
    return `<div class="mcard"><h3>${escapeHtml(m.name)}</h3><p>${escapeHtml(m.summary)}</p>
<div class="chips"><span class="chip${rules.length ? '' : ' zero'}">규칙 ${rules.length}</span><span class="chip${flowLinks.length ? '' : ' zero'}">흐름 ${flowLinks.length}</span>${cfl ? `<span class="chip warn">충돌 ${cfl}</span>` : ''}${low ? `<span class="chip warn">확인 필요 ${low}</span>` : ''}</div>
<div class="mlinks">${[...docLinks, ...flowLinks].join('')}</div></div>`;
  }).join('\n');
  const onboarding = docs.find((d) => d.kind === 'onboarding');
  const start = [
    onboarding ? `<a class="scard" href="${anchor(onboarding)}"><b>온보딩 가이드</b><span>한 장 요약, 처음 읽을 파일, 실행 방법</span></a>` : '',
    overview ? '<a class="scard" href="#overview"><b>구조도</b><span>화면 → 모듈 → DB, 모듈 의존 관계</span></a>' : '',
    player ? '<a class="scard" href="player.html"><b>데이터 흐름 플레이어</b><span>화면 버튼을 누르면 코드가 단계별로 재생</span></a>' : '',
  ].join('');
  return `<section id="home"><div class="hero"><p class="eyebrow">분석 리포트</p><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(summary)}</p></div>
<div class="stats">${stats}</div>
${conflicts ? renderConflictCard(conflicts) : ''}
${cards ? `<h2 class="sh">업무 모듈</h2><div class="mgrid">${cards}</div>` : ''}
${start ? `<h2 class="sh">처음이라면</h2><div class="start">${start}</div>` : ''}
</section>`;
}

export function buildReport(outDir) {
  for (const file of listDiagramHtml(outDir)) {
    const html = fs.readFileSync(file, 'utf8');
    const clean = injectDiagramCsp(injectDiagramFit(stripExternalFonts(html)));
    if (clean !== html) fs.writeFileSync(file, clean);
  }

  const moduleMap = readJson(path.join(outDir, '_data', 'module-map.json'));
  const title = moduleMap?.project?.name ?? path.basename(path.resolve(outDir));
  const summary = moduleMap?.project?.summary ?? '';
  const docs = collectDocs(outDir);
  const needsReview = countNeedsReview(outDir);
  const modules = listModules(moduleMap, docs);

  const overviewDiagrams = ['architecture', 'dependency']
    .filter((name) => fs.existsSync(path.join(outDir, 'overview', `${name}.html`)))
    .map((name) => `<iframe class="diagram" src="overview/${name}.html" title="${name}" loading="lazy"></iframe>${DIAGRAM_OPEN(`overview/${name}.html`)}`);

  const sections = [];
  if (overviewDiagrams.length) {
    sections.push(`<section id="overview"><p class="group">시작하기 · 구조도</p><h2>프로젝트 구조</h2>${overviewDiagrams.join('\n')}</section>`);
  }
  const anchors = new Map(docs.map((doc, i) => [doc.relPath, `doc-${i}`]));
  const resolveDoc = (relPath) => anchors.get(relPath);
  // Flow player: which flows a screen button can play, so the report can link straight to them.
  const screens = readJson(path.join(outDir, '_data', 'screens.json'))?.screens ?? null;
  const playable = screens ? linkButtonsToFlows(screens, readDataDir(outDir, 'flows')) : new Map();
  const playLink = (flowId) => (playable.get(flowId) ?? []).map(({ screen, button }) =>
    `<a href="player.html#${encodeURIComponent(screen.id)}.${encodeURIComponent(button.id)}">${escapeHtml(`${screen.title || screen.id} · ${button.text || button.id}`)}</a>`);

  const bodies = docs.map((doc, i) => {
    const md = fs.readFileSync(path.join(outDir, doc.relPath), 'utf8');
    return renderMarkdown(md, { base: path.posix.dirname(doc.relPath), resolveDoc, idPrefix: `doc-${i}-` });
  });

  // Rule finder: rules -> their heading in the module policy, flows -> their flow doc.
  const index = buildRuleIndex(outDir);
  const policyAnchor = {};
  const flowAnchor = {};
  const specAnchor = {};
  docs.forEach((doc, i) => {
    if (doc.kind === 'policy') {
      for (const m of bodies[i].matchAll(new RegExp(`id="(doc-${i}-([a-z]{2,4}-\\d{3})[^"]*)"`, 'g'))) {
        policyAnchor[m[2].toUpperCase()] ??= m[1];
      }
    }
    if (doc.kind === 'spec' && doc.moduleId) {
      // Spec sections by their fixed numbers: 2 API, 3 data model, 5 constants (write-spec structure).
      const sec = (n) => new RegExp(`id="(doc-${i}-${n}-[^"]*)"`).exec(bodies[i])?.[1];
      specAnchor[doc.moduleId] = { api: sec(2), entity: sec(3), constant: sec(5) };
    }
    const flowId = /^flows\/([^/]+)\/flow\.md$/.exec(doc.relPath)?.[1];
    if (flowId) flowAnchor[flowId] = `doc-${i}`;
  });
  // Policy conflicts (conflict-finder): a badge after each cited rule heading in the policy documents.
  const conflictDoc = readConflicts(outDir);
  const ruleConflicts = new Map(index.rules.filter((r) => r.conflicts?.length).map((r) => [r.id, r.conflicts]));
  if (conflictDoc && ruleConflicts.size) {
    docs.forEach((doc, i) => {
      if (doc.kind !== 'policy') return;
      bodies[i] = bodies[i].replace(new RegExp(`(<(h[1-6]) id="(doc-${i}-([a-z]{2,4}-\\d{3})[^"]*)">)([\\s\\S]*?)(</\\2>)`, 'g'), (all, open, tag, id, rule, inner, close) => {
        const ids = ruleConflicts.get(rule.toUpperCase());
        if (!ids || policyAnchor[rule.toUpperCase()] !== id) return all;
        return `${open}${inner} ${ids.map((c) => `<a class="cfl-badge" href="#cfl-${escapeHtml(c)}">${escapeHtml(c)}</a>`).join(' ')}${close}`;
      });
    });
  }
  const finder = renderRuleFinder(index, { policyAnchor, specAnchor, flowAnchor, player: fs.existsSync(path.join(outDir, '_data', 'screens.json')) });
  if (index.rules.length) writeJsonAtomic(path.join(outDir, '_data', 'rule-index.json'), index);
  // First in the page: nothing above it resizes (diagram iframes grow after load), so #rule= links land on it.
  if (finder) sections.unshift(finder.section);
  const conflictChange = conflictDoc ? latestConflictChange(outDir, conflictDoc) : null;
  if (conflictDoc) sections.push(renderConflictSection({ doc: conflictDoc, change: conflictChange, policyAnchor, finder }));

  docs.forEach((doc, i) => {
    const flowId = /^flows\/([^/]+)\/flow\.md$/.exec(doc.relPath)?.[1];
    const plays = flowId ? playLink(flowId) : [];
    const play = plays.length ? `<p class="play">▶ 플레이어에서 재생: ${plays.join(' · ')}</p>` : '';
    const kicker = doc.moduleId || doc.kind === 'data' || doc.kind === 'flow' ? `${doc.group} · ${doc.title}` : doc.group;
    const mod = doc.module ? ` data-module="${escapeHtml(doc.module)}"` : '';
    sections.push(`<section id="doc-${i}"${mod}><p class="group">${escapeHtml(kicker)}</p><div class="doc-grid"><article class="doc-body">${play}${bodies[i]}</article><aside class="toc" aria-label="이 문서의 목차"></aside></div></section>`);
  });
  for (const m of modules.filter((x) => !x.docs.length)) sections.push(renderModuleStub(m, outDir));
  // Nav: everything is in the HTML, so a reader without JavaScript gets the full list. report-view.mjs
  // shows only the current module's documents and folds 시작하기 while one is open.
  const docLink = (i) => `<a href="#doc-${i}">${escapeHtml(docs[i].title)}</a>`;
  const groupLinks = (group) => docs.flatMap((doc, i) => (doc.group === group && !doc.module ? [docLink(i)] : []));
  const startLinks = [
    ...groupLinks('시작하기'),
    overviewDiagrams.length ? '<a href="#overview">구조도</a>' : '',
    conflictDoc ? '<a href="#conflicts">정책 충돌</a>' : '',
    finder ? '<a href="#rules">규칙 찾기</a>' : '',
    playable.size ? '<a href="player.html">데이터 흐름 플레이어</a>' : '',
  ].filter(Boolean);
  const navGroup = (title, links) => (links.length ? `<div class="nav-group"><h2>${title}</h2>${links.join('\n')}</div>` : '');
  const modBlock = (m) => `<div class="nav-mod${m.docs.length ? '' : ' off'}" data-module="${escapeHtml(m.id)}">`
    + `<a class="mod-name" href="${m.docs.length ? `#doc-${m.docs[0]}` : `#mod-${escapeHtml(m.id)}`}">${escapeHtml(m.name)}</a>`
    + (m.docs.length ? `<div class="mod-docs">${m.docs.map(docLink).join('\n')}</div>` : '') + '</div>';
  const picker = modules.length
    ? `<select id="nav-mod" aria-label="모듈 선택"><option value="">전체 모듈</option>${modules.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}${m.docs.length ? '' : ' (미분석)'}</option>`).join('')}</select>`
    : '';
  const navHtml = [
    picker,
    startLinks.length ? `<details class="nav-start" open><summary>시작하기</summary>${startLinks.join('\n')}</details>` : '',
    navGroup('최근 변경', groupLinks('최근 변경')),
    modules.length ? `<details class="nav-mods" open><summary>모듈</summary>${modules.map(modBlock).join('\n')}</details>` : '',
    navGroup('기타', groupLinks('기타')),
  ].filter(Boolean).join('\n');

  sections.unshift(renderHome({ outDir, title, summary, modules, docs, index, needsReview, overview: overviewDiagrams.length > 0, player: playable.size > 0,
    conflicts: conflictDoc ? { open: conflictDoc.conflicts.filter((c) => c.status === 'open'), change: conflictChange } : null }));
  const html = `<!doctype html>
<html lang="ko" class="no-js">
<head>
<meta charset="utf-8">
${cspMeta(REPORT_CSP)}
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Groundwork</title>
<style>${STYLE}${finder ? FINDER_STYLE : ''}</style>
</head>
<body${playable.size ? ' data-player="player.html"' : ''}>
${topBar({ page: '분석 리포트', project: title, link: playable.size ? { href: 'player.html', label: '▶ 데이터 흐름 플레이어' } : null, escapeHtml,
  search: finder ? '<form class="qs" id="qs" role="search"><input type="search" id="qs-in" placeholder="규칙 찾기 (Ctrl+K)" autocomplete="off" aria-label="규칙 찾기"></form>' : '' })}
<div class="layout">
<nav>${navHtml}</nav>
<main>
${sections.join('\n')}
</main>
</div>
<script>${HEIGHT_LISTENER}</script>
${finder ? finder.script : ''}
<script>(${viewClient.toString()})();</script>
</body>
</html>
`;
  const indexPath = path.join(outDir, 'index.html');
  fs.writeFileSync(indexPath, html);
  return { indexPath, docs: docs.length };
}
