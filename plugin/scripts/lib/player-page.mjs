import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml } from './markdown.mjs';
import { REPORT_CSP } from './report.mjs';
import { LANES, buildPlayerData } from './player.mjs';
import { FONT, THEME_TOKENS, TOP_BAR_STYLE, topBar } from './theme.mjs';

// JSON inside <script> must not contain "</script" or "<!--"; escaping every "<" covers both.
// "/" is escaped too (a legal JSON escape) so embedded code never spells out a URL scheme like
// "http://" in the page source — the page itself loads nothing remote either way (CSP).
export function embedJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\//g, '\\/')
    .replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
}

const STYLE = `
${THEME_TOKENS}
${TOP_BAR_STYLE}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 ${FONT}}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
a{color:var(--accent)}
.app{display:grid;grid-template-columns:minmax(0,40%) minmax(0,1fr);gap:16px;padding:14px 20px 24px;align-items:start}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow)}
.left{display:flex;flex-direction:column;gap:12px;min-width:0}
.right{display:flex;flex-direction:column;gap:12px;min-width:0}
.sec-title{font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:.02em;margin:0 0 6px}
.screens{padding:10px 12px}
.sgroup{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px}
.sgroup .g{font-size:12px;color:var(--faint);min-width:56px}
.chip{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:2px 10px;font:inherit;font-size:12.5px;cursor:pointer}
.chip:hover{border-color:var(--accent)}
.chip.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}
.chip .cnt{margin-left:6px;font-size:11px;opacity:.75}
.preview{padding:10px 12px 12px}
.pv-head{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}
.pv-head b{font-size:15px}
.pv-head span{font-size:12px;color:var(--faint)}
.form{position:relative;width:100%;border:1px solid var(--line);border-radius:6px;background:var(--form);overflow:hidden;container-type:inline-size;--fs:clamp(9px,1.2cqw,12px)}
.c{position:absolute;display:flex;align-items:center;font-size:var(--fs);line-height:1.1;overflow:hidden;white-space:nowrap;border-radius:3px}
.c.approx{outline:1.5px dashed var(--warn);outline-offset:-1px}
.c-div{border:1px solid var(--line2);background:color-mix(in srgb,var(--grid-head) 45%,transparent)}
.c-static{color:var(--ink);padding:0 2px}
.c-static.title{font-weight:700;font-size:calc(var(--fs) + 2px)}
.c-edit,.c-box{border:1px solid var(--line);background:var(--card);color:var(--faint);padding:0 4px;font-size:calc(var(--fs) - 1px)}
.c-btn{justify-content:center;border:1px solid var(--line);background:var(--grid-head);color:var(--ink);cursor:pointer;font:inherit;font-size:var(--fs);font-weight:600;line-height:1;overflow:visible;padding:0;z-index:2}
.c-btn:hover{border-color:var(--accent)}
.c-btn.server{border-color:var(--accent-line);background:var(--accent-soft);color:var(--accent);font-weight:600}
.c-btn.sel{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 35%,transparent)}
.c-btn .n{position:absolute;top:-12px;right:-11px;background:var(--badge);color:#fff;border-radius:9px;font-size:10px;font-weight:700;line-height:16px;min-width:16px;padding:0 4px;text-align:center}
.c-grid{flex-direction:column;align-items:stretch;border:1px solid var(--line);background:var(--card)}
.c-grid .gh,.c-grid .gr{display:flex;border-bottom:1px solid var(--line2)}
.c-grid .gh{background:var(--grid-head);font-weight:600;font-size:calc(var(--fs) - 1px)}
.c-grid .gh span,.c-grid .gr span{flex:1;min-width:0;padding:2px 4px;overflow:hidden;text-overflow:ellipsis;border-right:1px solid var(--line2)}
.c-grid .gr{height:calc(var(--fs) + 8px)}
.c-grid .gcap{margin-top:auto;padding:3px 6px;font-size:calc(var(--fs) - 1px);color:var(--faint)}
.legend{display:flex;gap:14px;margin-top:8px;font-size:11.5px;color:var(--muted);flex-wrap:wrap}
.legend i{display:inline-block;width:12px;height:10px;border-radius:2px;vertical-align:-1px;margin-right:4px;border:1px solid var(--line)}
.legend .l-srv{background:var(--accent-soft);border-color:var(--accent-line)}
.legend .l-n{background:var(--badge);border-color:var(--badge);border-radius:6px}
.legend .l-ap{border:1.5px dashed var(--warn)}
.info{padding:10px 14px;font-size:13px}
.info dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0}
.info dt{color:var(--muted)}
.info dd{margin:0;min-width:0;overflow-wrap:anywhere}
.k{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:var(--code);border:1px solid var(--line2);border-radius:4px;padding:0 5px}
.loc{color:var(--faint);font-size:12px;margin-left:4px}
.arrow{color:var(--faint);margin:0 4px}
.muted{color:var(--muted)}
.flow-head{padding:12px 16px}
.flow-head h1{font-size:18px;margin:0 0 2px;letter-spacing:-.01em}
.flow-head p{margin:0;color:var(--muted);font-size:13px}
.flow-head p.api-note{margin-top:8px;padding:6px 10px;border-radius:0 6px 6px 0;border-left:3px solid var(--accent-line);background:var(--code);color:var(--muted)}
.flow-head p.api-note code{color:inherit}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.tab{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:3px 12px;font:inherit;font-size:13px;cursor:pointer}
.tab:hover{border-color:var(--accent)}
.tab.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);font-weight:600}
.tab .tn{font-size:11px;opacity:.7;margin-left:5px}
.stage{padding:14px 16px 16px}
.lanes{display:grid;gap:8px}
.lane{position:relative;border:1px solid var(--line);border-radius:8px;padding:8px 5px 12px;text-align:center;min-height:84px;background:var(--card);transition:opacity .2s,background .2s,border-color .2s}
.lane .lh{font-size:11.5px;font-weight:700;color:var(--muted);letter-spacing:.02em;margin-bottom:5px}
.lane .ln{font-size:12px;line-height:1.35;overflow-wrap:break-word}
.lane .ln + .ln{margin-top:2px}
.lane.empty .ln{color:var(--faint)}
.lane.done{opacity:.42}
.lane.from{background:var(--accent-soft);border-color:var(--accent-line)}
.lane.to{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.lane.to .lh{color:var(--accent-ink);opacity:.85}
.lane .tag{position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);font-size:10.5px;font-weight:700;background:var(--card);color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:0 7px;white-space:nowrap}
.progress{display:flex;gap:4px;margin:20px 0 14px}
.progress button{flex:1;height:8px;border-radius:4px;border:0;padding:0;background:var(--line);cursor:pointer}
.progress button.d{background:color-mix(in srgb,var(--accent) 45%,var(--line))}
.progress button.cur{background:var(--accent)}
.panel{border:1px solid var(--line);border-radius:8px;padding:12px 14px;background:var(--card)}
.ph{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px}
.ph .cnt{font-weight:700;font-size:15px}
.ph .lt{background:var(--accent-soft);color:var(--accent);border-radius:4px;padding:0 7px;font-weight:600}
.ph .dir{color:var(--muted)}
.ph .sn{color:var(--faint);font-size:12px}
.need{background:var(--warn-soft);color:var(--warn);border-radius:4px;padding:0 7px;font-weight:700;font-size:12px}
.action{font-size:17px;font-weight:600;margin:8px 0 4px;line-height:1.45}
.branch{margin:6px 0;padding:6px 10px;border-left:3px solid var(--warn);background:var(--warn-soft);border-radius:0 6px 6px 0;font-size:13px}
.row{margin-top:8px;font-size:13px}
.row > b{color:var(--muted);font-weight:600;margin-right:6px}
.fields{display:inline-flex;flex-wrap:wrap;gap:4px;vertical-align:middle}
.ex{margin-top:5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:var(--code);border:1px dashed var(--line);border-radius:6px;padding:5px 8px;overflow-wrap:anywhere}
.ex .et{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:11px;font-weight:700;color:var(--warn);margin-right:6px}
.code{margin-top:10px;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.code .ch{display:flex;justify-content:space-between;gap:8px;padding:4px 10px;background:var(--grid-head);font-size:12px;color:var(--muted);border-bottom:1px solid var(--line)}
.code .ch b{color:var(--ink);font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;overflow-wrap:anywhere}
.code pre{margin:0;padding:6px 0;background:var(--code);overflow:auto;max-height:220px;font-size:12.5px;line-height:1.6}
.code .cl{display:flex;padding:0 10px 0 0;white-space:pre}
.code .cl .no{flex:none;width:44px;text-align:right;padding-right:12px;color:var(--faint);user-select:none}
.code .cl.hl{background:var(--hl);box-shadow:inset 3px 0 0 var(--hl-line)}
.code .cl.hl .no{color:var(--ink);font-weight:700}
.pol{text-decoration:none;display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:600;border:1px solid var(--accent-line);color:var(--accent);background:var(--accent-soft);border-radius:4px;padding:0 6px;margin-right:4px}
a.pol:hover{background:var(--accent);color:var(--accent-ink)}
.ctl{display:flex;gap:8px;align-items:center;margin-top:14px}
.btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:5px 14px;font:inherit;font-size:13px;cursor:pointer}
.btn:hover:not(:disabled){border-color:var(--accent)}
.btn:disabled{opacity:.4;cursor:default}
.btn.pri{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}
.btn.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.ctl .hint{margin-left:auto;font-size:12px;color:var(--faint)}
.empty-state{padding:22px 20px}
.empty-state h2{margin:0 0 6px;font-size:17px}
.cmd{display:flex;gap:8px;align-items:center;margin-top:12px}
.cmd code{flex:1;min-width:0;display:block;background:var(--code);border:1px solid var(--line);border-radius:6px;padding:8px 10px;overflow-wrap:anywhere;user-select:all}
@media (max-width:900px){.app{grid-template-columns:minmax(0,1fr);padding:12px 16px}}
@media (prefers-reduced-motion:reduce){.lane{transition:none}}
`;

// Runs in the browser. Serialized with Function.prototype.toString, so it must not close over
// anything from this module. Every value from the data is put into the DOM with textContent.
function client() {
  const DATA = JSON.parse(document.getElementById('gw-data').textContent);
  const LANE_LABEL = { screen: '화면', common: '공통', controller: 'Controller', service: 'Service', mapper: 'Mapper', db: 'DB', external: '외부', other: '기타' };
  const BASE_LANES = DATA.lanes;
  const flowsById = new Map(DATA.flows.map((f) => [f.id, f]));
  const screens = DATA.screens;
  const st = { screen: null, button: null, path: 'main', idx: 0, timer: null };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === undefined || kid === null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const k = (t) => h('span', { class: 'k' }, t);
  const base = (file) => String(file || '').split('/').pop();
  const loc = (file, line) => (file ? h('span', { class: 'loc' }, base(file) + (line ? ':' + line : '')) : null);

  const screenById = (id) => screens.find((s) => s.id === id);
  const flowOf = (b) => (b && b.flowId ? flowsById.get(b.flowId) : null);
  const curScreen = () => screenById(st.screen);
  const curButton = () => (curScreen()?.buttons || []).find((b) => b.id === st.button) || null;
  const curFlow = () => flowOf(curButton());
  const curPath = () => {
    const f = curFlow();
    return f ? (f.paths.find((p) => p.key === st.path) || f.paths[0]) : null;
  };

  function stop() {
    if (st.timer) clearInterval(st.timer);
    st.timer = null;
  }
  function select(screenId, buttonId) {
    stop();
    st.screen = screenId;
    st.button = buttonId;
    st.path = 'main';
    st.idx = 0;
    try { history.replaceState(null, '', '#' + encodeURIComponent(screenId + (buttonId ? '.' + buttonId : ''))); } catch { /* file: without history */ }
    renderLeft();
    renderRight();
  }
  function firstButton(sc) {
    const bs = sc?.buttons || [];
    return (bs.find((b) => b.flowId) || bs.find((b) => b.call) || bs[0] || {}).id || null;
  }

  // ---------- left column ----------
  function renderScreens() {
    const box = document.getElementById('screens');
    box.replaceChildren(h('p', { class: 'sec-title' }, '화면 목록'));
    const groups = new Map();
    for (const s of screens) {
      const g = s.group || '(기타)';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    }
    for (const [g, list] of groups) {
      box.append(h('div', { class: 'sgroup' }, h('span', { class: 'g' }, g),
        list.map((s) => {
          const n = (s.buttons || []).filter((b) => b.flowId).length;
          return h('button', { class: 'chip' + (s.id === st.screen ? ' on' : ''), title: s.file, onclick: () => select(s.id, firstButton(s)) },
            s.title || s.id, n ? h('span', { class: 'cnt' }, '흐름 ' + n) : null);
        })));
    }
  }

  function renderComponent(sc, c) {
    const W = sc.width || 1;
    const H = sc.height || 1;
    const pct = (v, total) => (Math.max(0, v) / total * 100).toFixed(3) + '%';
    const style = 'left:' + pct(c.left, W) + ';top:' + pct(c.top, H) + ';width:' + pct(c.width, W) + ';height:' + pct(c.height, H);
    const approx = c.approx ? ' approx' : '';
    const tip = c.id + ' (' + c.type + ')' + (c.approx ? ' · 위치 추정' : '');
    if (c.type === 'Button') {
      const b = (sc.buttons || []).find((x) => x.id === c.id);
      const f = flowOf(b);
      const cls = 'c c-btn' + approx + (b?.call ? ' server' : '') + (st.button === c.id ? ' sel' : '');
      return h('button', { class: cls, style, title: tip + (b?.call ? ' · 서버 호출 ' + (b.call.url || b.call.svcKey) : ''),
        onclick: b ? () => select(sc.id, b.id) : undefined }, c.text || c.id, f ? h('span', { class: 'n' }, f.steps.length) : null);
    }
    if (c.type === 'Grid') {
      const ds = (sc.datasets || []).find((d) => d.id === c.binddataset);
      const cols = ds?.columns?.length ? ds.columns : ['(컬럼 정보 없음)'];
      const row = (cls, cells) => h('div', { class: cls }, cells.map((t) => h('span', null, t)));
      return h('div', { class: 'c c-grid' + approx, style, title: tip },
        row('gh', cols), row('gr', cols.map(() => '')), row('gr', cols.map(() => '')),
        h('div', { class: 'gcap' }, c.id + (c.binddataset ? ' ← ' + c.binddataset : '')));
    }
    if (c.type === 'Div' || c.type === 'Tab' || c.type === 'Tabpage' || c.type === 'GroupBox') {
      return h('div', { class: 'c c-div' + approx, style, title: tip });
    }
    if (c.type === 'Static') {
      const big = c.height >= 28 && c.top < 40;
      return h('div', { class: 'c c-static' + (big ? ' title' : '') + approx, style, title: tip }, c.text || '');
    }
    return h('div', { class: 'c ' + (c.type === 'Edit' ? 'c-edit' : 'c-box') + approx, style, title: tip }, c.text || c.id);
  }

  function renderPreview() {
    const box = document.getElementById('preview');
    const sc = curScreen();
    if (!sc) {
      box.replaceChildren(h('p', { class: 'muted' }, '화면이 없습니다. screens.json을 먼저 만드세요 (/groundwork:scan).'));
      return;
    }
    const form = h('div', { class: 'form', style: 'aspect-ratio:' + (sc.width || 4) + ' / ' + (sc.height || 3) });
    const order = (c) => (c.type === 'Div' || c.type === 'Tab' || c.type === 'GroupBox' ? 0 : c.type === 'Button' ? 2 : 1);
    for (const c of [...(sc.components || [])].sort((a, b) => order(a) - order(b))) form.append(renderComponent(sc, c));
    box.replaceChildren(
      h('div', { class: 'pv-head' }, h('b', null, sc.title || sc.id), h('span', null, sc.id + ' · ' + sc.file)),
      form,
      h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'l-srv' }), '서버를 부르는 버튼'),
        h('span', null, h('i', { class: 'l-n' }), '숫자 = 추적한 흐름의 단계 수'),
        (sc.components || []).some((c) => c.approx) ? h('span', null, h('i', { class: 'l-ap' }), '점선 = 위치 추정') : null,
        h('span', null, '버튼을 누르면 오른쪽 흐름이 바뀝니다')));
  }

  function renderInfo() {
    const box = document.getElementById('info');
    const sc = curScreen();
    const b = curButton();
    if (!b) {
      box.replaceChildren(h('p', { class: 'sec-title' }, '선택한 버튼'), h('p', { class: 'muted' }, '이 화면에는 onclick이 달린 버튼이 없습니다.'));
      return;
    }
    box.replaceChildren(h('p', { class: 'sec-title' }, '선택한 버튼'), buttonFacts(sc, b));
  }

  function buttonFacts(sc, b) {
    const rows = [];
    const add = (dt, ...dd) => rows.push(h('dt', null, dt), h('dd', null, ...dd));
    add('버튼', k(b.id), ' "' + (b.text || '') + '"');
    add('이벤트', k(b.event || 'onclick'), h('span', { class: 'arrow' }, '→'), k(b.handler || '?'), loc(sc.file, b.handlerLine));
    if (b.call) {
      add('서버 호출', k(b.call.fn), loc(sc.file, b.call.line), b.call.via === 'common' ? h('span', { class: 'muted' }, ' · 공통 함수 경유') : null);
      add('보내는 Dataset', (b.call.inDatasets || []).length ? b.call.inDatasets.map((d) => [k(d), ' ']) : h('span', { class: 'muted' }, '없음'));
      add('받는 Dataset', (b.call.outDatasets || []).length ? b.call.outDatasets.map((d) => [k(d), ' ']) : h('span', { class: 'muted' }, '없음'));
      add('서비스 키', k(b.call.svcKey || '?'), h('span', { class: 'arrow' }, '→'), b.call.url ? k(b.call.url) : h('span', { class: 'need' }, 'URL 못 찾음'));
      add('Controller', b.endpoint ? [k(b.endpoint.className + '.' + b.endpoint.method), loc(b.endpoint.file, b.endpoint.line)] : h('span', { class: 'muted' }, '찾지 못함'));
      if (b.call.callback) add('콜백', k(b.call.callback));
    } else {
      add('서버 호출', h('span', { class: 'muted' }, '없음 — 화면 안에서만 동작하는 버튼'));
    }
    return h('dl', null, rows);
  }

  function renderLeft() {
    renderScreens();
    renderPreview();
    renderInfo();
  }

  // ---------- right column ----------
  function renderNoFlow(box, sc, b) {
    if (!sc || !b) {
      box.replaceChildren(h('div', { class: 'card empty-state' }, h('h2', null, '버튼을 고르세요'),
        h('p', { class: 'muted' }, '왼쪽 화면 미리보기에서 버튼을 누르면 그 버튼의 데이터 흐름이 여기에 재생됩니다.')));
      return;
    }
    const cmd = '/groundwork:trace "' + (DATA.outDir || 'OUT') + '" "' + sc.id + '.' + b.id + '"';
    const copy = h('button', { class: 'btn', onclick: () => {
      const done = () => { copy.textContent = '복사됨'; setTimeout(() => { copy.textContent = '복사'; }, 1500); };
      try { navigator.clipboard.writeText(cmd).then(done, () => {}); } catch { /* no clipboard on this page */ }
    } }, '복사');
    box.replaceChildren(h('div', { class: 'card empty-state' },
      h('h2', null, (b.text || b.id) + ' 버튼의 흐름은 아직 추적하지 않았습니다'),
      h('p', { class: 'muted' }, b.call
        ? '화면 파일에서 읽은 1층 정보만 있습니다. 아래 명령으로 Controller → Service → Mapper → DB까지 추적하면 이 자리에 단계별 재생이 나옵니다.'
        : '이 버튼은 서버를 부르지 않습니다. 화면 안에서 끝나는 동작이라 추적할 서버 흐름이 없을 수 있습니다.'),
      h('div', { class: 'info', style: 'padding:10px 0 0' }, buttonFacts(sc, b)),
      b.call ? h('div', { class: 'cmd' }, h('code', null, cmd), copy) : null));
  }

  function lanesOf(flow) {
    const used = new Set(Object.values(flow.lanes || {}));
    return [...BASE_LANES, ...['external', 'other'].filter((l) => used.has(l))];
  }

  function renderRight() {
    const box = document.getElementById('right');
    const sc = curScreen();
    const b = curButton();
    const flow = flowOf(b);
    if (!flow) {
      stop();
      renderNoFlow(box, sc, b);
      return;
    }
    const p = curPath();
    const stepByN = new Map(flow.steps.map((s) => [s.n, s]));
    const steps = p.steps.map((n) => stepByN.get(n)).filter(Boolean);
    st.idx = Math.min(Math.max(0, st.idx), Math.max(0, steps.length - 1));
    const step = steps[st.idx];
    const laneOf = (actorId) => flow.lanes?.[actorId] || 'other';
    const lanes = lanesOf(flow);

    const head = h('div', { class: 'card flow-head' },
      h('h1', null, flow.title),
      h('p', null, flow.outcome),
      b.flowSource === 'api' ? h('p', { class: 'api-note' }, '이 버튼에서 추적한 흐름이 아니라, 버튼이 부르는 API(' + (b.call && b.call.url || '') + ')의 흐름입니다. 화면 쪽 단계가 빠졌을 수 있습니다. 버튼 기준으로 추적하려면 ',
        h('code', null, '/groundwork:trace <출력 폴더> "' + sc.id + '.' + b.id + '"'), ' 를 실행하세요.') : null,
      h('div', { class: 'tabs' }, flow.paths.map((q) => h('button', {
        class: 'tab' + (q.key === p.key ? ' on' : ''),
        onclick: () => { stop(); st.path = q.key; st.idx = 0; renderRight(); },
      }, q.key === 'main' ? '정상 흐름' : q.label, h('span', { class: 'tn' }, q.steps.length + '단계')))));

    const fromL = step ? laneOf(step.from) : null;
    const toL = step ? laneOf(step.to) : null;
    const passed = new Set();
    for (const s of steps.slice(0, st.idx)) { passed.add(laneOf(s.from)); passed.add(laneOf(s.to)); }
    const laneEls = lanes.map((l) => {
      const names = flow.actors.filter((a) => laneOf(a.id) === l).map((a) => a.name);
      const isFrom = l === fromL;
      const isTo = l === toL;
      const cls = 'lane' + (isTo ? ' to' : isFrom ? ' from' : passed.has(l) ? ' done' : '') + (names.length ? '' : ' empty');
      const tag = isFrom && isTo ? '안에서 처리' : isFrom ? '보냄' : isTo ? '받음' : null;
      return h('div', { class: cls },
        h('div', { class: 'lh' }, LANE_LABEL[l] || l),
        names.length ? names.map((n) => h('div', { class: 'ln' }, n)) : h('div', { class: 'ln' }, '—'),
        tag ? h('span', { class: 'tag' }, tag) : null);
    });
    const lanesEl = h('div', { class: 'lanes', style: 'grid-template-columns:repeat(' + lanes.length + ',minmax(0,1fr))' }, laneEls);

    const progress = h('div', { class: 'progress', role: 'tablist' }, steps.map((s, i) => h('button', {
      class: i < st.idx ? 'd' : i === st.idx ? 'cur' : '',
      title: (i + 1) + '. ' + s.action,
      'aria-label': (i + 1) + '단계',
      onclick: () => { stop(); st.idx = i; renderRight(); },
    })));

    const panel = step ? renderStep(flow, step, steps.length, laneOf) : h('div', { class: 'panel muted' }, '단계가 없습니다.');

    const playing = !!st.timer;
    const ctl = h('div', { class: 'ctl' },
      h('button', { class: 'btn', disabled: st.idx <= 0, onclick: () => { stop(); go(-1); } }, '◀ 이전'),
      h('button', { class: 'btn pri', disabled: st.idx >= steps.length - 1, onclick: () => { stop(); go(1); } }, '다음 ▶'),
      h('button', { class: 'btn' + (playing ? ' on' : ''), onclick: togglePlay }, playing ? '⏸ 멈춤' : '⏵ 자동 재생'),
      h('span', { class: 'hint' }, '← → 키로 이동 · 막대를 눌러 건너뛰기'));

    box.replaceChildren(head, h('div', { class: 'card stage' }, lanesEl, progress, panel, ctl));
  }

  function renderStep(flow, step, total, laneOf) {
    const fl = LANE_LABEL[laneOf(step.from)] || laneOf(step.from);
    const tl = LANE_LABEL[laneOf(step.to)] || laneOf(step.to);
    const actorName = (id) => flow.actors.find((a) => a.id === id)?.name || id;
    const needs = step.confidence === 'low' || step.verifyFailed;
    const kids = [
      h('div', { class: 'ph' },
        h('span', { class: 'cnt' }, (st.idx + 1) + ' / ' + total),
        h('span', { class: 'lt' }, fl),
        h('span', { class: 'dir' }, step.from === step.to ? actorName(step.from) + ' 안에서' : actorName(step.from) + ' → ' + actorName(step.to)),
        fl !== tl ? h('span', { class: 'sn' }, '(' + fl + ' → ' + tl + ')') : null,
        needs ? h('span', { class: 'need', title: '근거가 약하거나 인용 확인에 실패했습니다' }, '확인 필요') : null,
        h('span', { class: 'sn', style: 'margin-left:auto' }, '흐름 단계 #' + step.n)),
      h('div', { class: 'action' }, step.action),
    ];
    if (step.branch) kids.push(h('div', { class: 'branch' }, h('b', null, '분기 '), step.branch.condition, h('span', { class: 'arrow' }, '→'), step.branch.result));
    if (step.payload) {
      const pl = step.payload;
      kids.push(h('div', { class: 'row' }, h('b', null, '오가는 값'), k(pl.name), ' ',
        (pl.fields || []).length ? h('span', { class: 'fields' }, pl.fields.map((f) => k(f))) : null,
        pl.example ? h('div', { class: 'ex' }, h('span', { class: 'et' }, '예시'), pl.example) : null));
    }
    if (step.data && ((step.data.reads || []).length || (step.data.writes || []).length)) {
      kids.push(h('div', { class: 'row' },
        (step.data.reads || []).length ? [h('b', null, '읽음'), step.data.reads.map((x) => [k(x), ' '])] : null,
        (step.data.writes || []).length ? [h('b', { style: 'margin-left:8px' }, '씀'), step.data.writes.map((x) => [k(x), ' '])] : null));
    }
    for (const ev of step.evidence || []) kids.push(renderCode(ev));
    if ((step.policies || []).length) kids.push(h('div', { class: 'row' }, h('b', null, '정책'), step.policies.map((id) => h('a', { class: 'pol', href: 'index.html#rule=' + id, target: '_blank', rel: 'noopener', title: id + ' 규칙 카드 열기' }, id))));
    return h('div', { class: 'panel' }, kids);
  }

  function renderCode(ev) {
    const snip = DATA.snippets[ev.file + ':' + ev.line];
    const lines = snip ? snip.lines.map((t, i) => ({ no: snip.start + i, t })) : [{ no: ev.line, t: ev.snippet || '' }];
    return h('div', { class: 'code' },
      h('div', { class: 'ch' }, h('b', null, ev.file + ':' + ev.line), snip ? null : h('span', null, '원본 파일을 읽지 못해 인용만 표시')),
      h('pre', null, lines.map((l) => h('div', { class: 'cl' + (l.no === ev.line ? ' hl' : '') }, h('span', { class: 'no' }, l.no), l.t))));
  }

  function stepsLen() {
    const f = curFlow();
    const p = curPath();
    return f && p ? p.steps.length : 0;
  }
  function go(d) {
    const n = stepsLen();
    if (!n) return false;
    const next = Math.min(n - 1, Math.max(0, st.idx + d));
    if (next === st.idx) return false;
    st.idx = next;
    renderRight();
    return true;
  }
  function togglePlay() {
    if (st.timer) { stop(); renderRight(); return; }
    if (st.idx >= stepsLen() - 1) st.idx = 0;
    st.timer = setInterval(() => { if (!go(1)) { stop(); renderRight(); } }, 1500);
    renderRight();
  }
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight') { stop(); go(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { stop(); go(-1); e.preventDefault(); }
  });

  // ---------- start ----------
  let start = null;
  try {
    const want = decodeURIComponent(location.hash.slice(1));
    const dot = want.indexOf('.');
    const sid = dot >= 0 ? want.slice(0, dot) : want;
    const sc = screenById(sid);
    if (sc) start = [sc.id, (sc.buttons || []).some((b) => b.id === want.slice(dot + 1)) ? want.slice(dot + 1) : firstButton(sc)];
  } catch { /* bad hash */ }
  if (!start) {
    const sc = screens.find((s) => (s.buttons || []).some((b) => b.flowId)) || screens[0];
    start = [sc ? sc.id : null, sc ? firstButton(sc) : null];
  }
  select(start[0], start[1]);
}

export function renderPlayerPage(data) {
  const name = data.project?.name || 'Groundwork';
  const payload = { ...data, lanes: LANES };
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(name)} · 데이터 흐름 플레이어</title>
<style>${STYLE}</style>
</head>
<body>
${topBar({ page: '데이터 흐름 플레이어', project: name, link: { href: 'index.html', label: '분석 리포트 열기' }, escapeHtml })}
<div class="app">
<aside class="left">
<section class="card screens" id="screens"></section>
<section class="card preview" id="preview"></section>
<section class="card info" id="info"></section>
</aside>
<main class="right" id="right"></main>
</div>
<script type="application/json" id="gw-data">${embedJson(payload)}</script>
<script>(${client.toString()})();</script>
</body>
</html>
`;
}

// Writes OUT/player.html. The caller has already checked that OUT is outside the target.
export function buildPlayer(outDir) {
  const data = buildPlayerData(outDir);
  const html = renderPlayerPage({ ...data, outDir: path.resolve(outDir) });
  const playerPath = path.join(outDir, 'player.html');
  fs.writeFileSync(playerPath, html);
  return { playerPath, screens: data.screens.length, flows: data.flows.length };
}
