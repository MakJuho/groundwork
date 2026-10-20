import { conflictHits, fileMatches, fileScore, haystack, parseFileRef } from './rules.mjs';

// Same escaping as player-page.mjs embedJson (kept local: player-page imports report.mjs, which imports this).
const embedJson = (value) => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/\//g, '\\/')
  .replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);

// "규칙 찾기": one search box over every verified rule, so a developer reads only the rules behind the
// file, screen, API or table they are touching instead of whole policy documents.
// The page reuses the matching functions from rules.mjs (serialized into the script) so the report and
// query-rules.mjs always agree on what matches.

export const FINDER_STYLE = `
#rules .finder{position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0 10px;border-bottom:1px solid var(--line)}
#rules input[type=search]{width:100%;font:inherit;font-size:16px;padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg)}
#rules input[type=search]:focus{outline:2px solid var(--accent);outline-offset:-1px}
#rules .hint{font-size:13px;color:var(--muted);margin:6px 0 0}
#rules .hint button{font:inherit;font-size:12px;border:1px dashed var(--line);background:none;color:var(--muted);border-radius:6px;padding:0 6px;margin:2px 2px 0 0;cursor:pointer}
#rules .hint button:hover{color:var(--accent);border-color:var(--accent)}
#rules .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
#rules .chip{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:1px 10px;cursor:pointer}
#rules .chip.on{background:var(--accent);border-color:var(--accent);color:var(--bg)}
#rules .chip .n{opacity:.7;font-size:11px;margin-left:4px}
#rules .count{font-size:13px;color:var(--muted);margin:12px 0 6px}
.rule{border:1px solid var(--line);border-radius:8px;background:var(--card);padding:12px 16px;margin:10px 0}
.rule.hit{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 25%,transparent)}
.rule .rh{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}
.rule .rid{font:600 13px ui-monospace,Consolas,monospace;color:var(--accent)}
.rule .tag{font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:4px;padding:0 6px}
.rule .conf{font-size:12px;color:var(--muted);margin-left:auto}
.rule .conf.low{color:var(--accent);font-weight:600}
.rule .sum{margin:6px 0 8px;font-weight:600}
.rule .meta{font-size:13px;color:var(--muted);margin:2px 0}
.rule ul.ev{list-style:none;margin:6px 0;padding:0}
.rule ul.ev li{font:12.5px ui-monospace,Consolas,monospace;padding:3px 8px;border-left:3px solid var(--line);margin:2px 0;overflow-wrap:anywhere}
.rule ul.ev li.near{border-left-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent)}
.rule ul.ev .loc{color:var(--muted);margin-right:8px}
.rule .links{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;margin-top:6px}
.rule .links a{color:var(--accent)}
.rule .rh .cfl-badge{margin-left:2px}
#rules .cfl-hits{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0 4px;padding:10px 14px;border:1px solid var(--warn);border-radius:10px;background:var(--warn-soft)}
#rules .cfl-hits b{color:var(--warn);font-size:14px;margin-right:4px}
#rules .cfl-hits .ct{font-size:13.5px;color:var(--ink);margin-right:10px}
`;

function client() {
  const DATA = JSON.parse(document.getElementById('gw-rules').textContent);
  const rules = DATA.rules;
  const conflicts = DATA.conflicts || [];
  const conflictById = new Map(conflicts.map((c) => [c.id, c]));
  const hay = new Map(rules.map((r) => [r.id, haystack(r)]));
  const st = { q: '', module: null, kind: null };
  const box = document.getElementById('rules-list');
  const input = document.getElementById('rules-q');
  const count = document.getElementById('rules-count');

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) e.setAttribute(k, v);
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid instanceof Node ? kid : String(kid));
    return e;
  }

  // Query words; a word that looks like File.ext[:line] becomes a file filter.
  function parse(q) {
    const words = [];
    let file = null;
    for (const w of q.trim().split(/\s+/).filter(Boolean)) {
      // "/order/cancel.do" is an API path, not a file.
      const f = !file && !w.startsWith('/') && /\.[A-Za-z0-9]+(:\d+)?$/.test(w) ? parseFileRef(w) : null;
      if (f) file = f; else words.push(w.toLowerCase());
    }
    return { file, words };
  }

  function search() {
    const { file, words } = parse(st.q);
    const out = [];
    for (const r of rules) {
      if (st.module && r.module !== st.module) continue;
      if (st.kind && r.kind !== st.kind) continue;
      let score = 0;
      if (file) { score = fileScore(r, file.file, file.line); if (!score) continue; }
      const h = hay.get(r.id);
      if (!words.every((w) => h.includes(w))) continue;
      out.push({ r, score });
    }
    out.sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id));
    const list = out.map((x) => x.r);
    // Conflicts touched by this search: cited at the file/line, or citing a rule in the result.
    const touched = new Set(file ? conflicts.filter((c) => conflictHits(c, file.file, file.line)).map((c) => c.id) : []);
    if (st.q.trim() || st.module || st.kind) for (const r of list) for (const id of r.conflicts || []) touched.add(id);
    return { list, file, hits: conflicts.filter((c) => touched.has(c.id)) };
  }

  const badge = (id) => el('a', { class: 'cfl-badge', href: '#cfl-' + id, title: (conflictById.get(id) || {}).title }, id);

  const CONF = { high: '●●● 코드에 명시', medium: '●●○ 추론', low: '●○○ 확인 필요' };

  function card(r, file) {
    const exact = st.q.trim().toUpperCase() === r.id;
    const ev = r.evidence.map((e) => {
      const near = file && fileMatches(e.file, file.file) && (file.line == null || Math.abs(e.line - file.line) <= 3);
      return el('li', { class: near ? 'near' : null }, el('span', { class: 'loc' }, e.file + ':' + e.line), e.snippet);
    });
    const meta = [];
    if (r.entities.length || r.tables.length) meta.push(el('p', { class: 'meta' }, '데이터: ' + [...r.entities, ...r.tables].join(' · ')));
    if (r.transition) meta.push(el('p', { class: 'meta' }, '상태 변화: ' + r.transition.from + ' → ' + r.transition.to + (r.transition.trigger ? ' (' + r.transition.trigger + ')' : '')));
    if (r.endpoints.length) meta.push(el('p', { class: 'meta' }, 'API: ' + r.endpoints.join(' · ')));
    const links = [];
    const spec = (DATA.specAnchor[r.module] || {})[r.kind];
    if (DATA.policyAnchor[r.id]) links.push(el('a', { href: '#' + DATA.policyAnchor[r.id] }, '정책서에서 보기'));
    else if (spec) links.push(el('a', { href: '#' + spec }, '명세서에서 보기'));
    for (const f of r.flows) {
      const label = f.title + (f.steps.length ? ' · 단계 ' + f.steps.join(', ') : '');
      if (f.screen && DATA.player) links.push(el('a', { href: 'player.html#' + f.screen, target: '_blank', rel: 'noopener' }, '▶ ' + label + ' (' + (f.buttonText || f.screen) + ')'));
      else if (DATA.flowAnchor[f.id]) links.push(el('a', { href: '#' + DATA.flowAnchor[f.id] }, '흐름 · ' + label));
      else links.push(el('span', null, '흐름 · ' + label));
    }
    return el('article', { class: 'rule' + (exact ? ' hit' : ''), id: 'rule-' + r.id },
      el('div', { class: 'rh' }, el('span', { class: 'rid' }, r.id), el('span', { class: 'tag' }, r.moduleName), el('span', { class: 'tag' }, r.kindLabel),
        (r.conflicts || []).map(badge),
        el('span', { class: 'conf' + (r.confidence === 'low' ? ' low' : '') }, CONF[r.confidence] || r.confidence)),
      el('p', { class: 'sum' }, r.summary), meta, el('ul', { class: 'ev' }, ev),
      links.length ? el('div', { class: 'links' }, links) : null);
  }

  function chips(id, values, key, label) {
    const holder = document.getElementById(id);
    const counts = new Map();
    for (const r of rules) counts.set(r[key], (counts.get(r[key]) || 0) + 1);
    const render = () => holder.replaceChildren(
      el('span', { class: 'hint' }, label),
      ...values.map((v) => {
        const b = el('button', { class: 'chip' + (st[key] === v.id ? ' on' : ''), type: 'button' }, v.name, el('span', { class: 'n' }, counts.get(v.id) || 0));
        b.addEventListener('click', () => { st[key] = st[key] === v.id ? null : v.id; render(); update(); });
        return b;
      }));
    render();
  }

  function update() {
    const { list, file, hits } = search();
    const active = st.q.trim() || st.module || st.kind;
    count.textContent = active ? '규칙 ' + list.length + '건 / 전체 ' + rules.length + '건' : '전체 규칙 ' + rules.length + '건';
    const bar = hits.length ? [el('div', { class: 'cfl-hits' }, el('b', null, '걸린 정책 충돌 ' + hits.length + '건'),
      hits.map((c) => [badge(c.id), el('span', { class: 'ct' }, c.title)]))] : [];
    box.replaceChildren(...bar, ...(list.length ? list.map((r) => card(r, file)) : [el('p', { class: 'meta' }, '맞는 규칙이 없습니다. 파일 이름, 화면·버튼, API 경로, 테이블, 업무 용어로 찾아보세요.')]));
  }

  const mods = [...new Map(rules.map((r) => [r.module, { id: r.module, name: r.moduleName }])).values()];
  const kinds = [...new Set(rules.map((r) => r.kind))].map((k) => ({ id: k, name: (rules.find((r) => r.kind === k) || {}).kindLabel || k }));
  chips('rules-mod', mods, 'module', '모듈');
  chips('rules-kind', kinds, 'kind', '종류');

  input.addEventListener('input', () => { st.q = input.value; update(); });
  for (const b of document.querySelectorAll('#rules .hint button[data-q]')) {
    b.addEventListener('click', () => { input.value = b.dataset.q; st.q = input.value; update(); input.focus(); });
  }
  // index.html#rule=ORD-004 or #find=OrderService.java:33 opens the finder pre-filled.
  function fromHash() {
    const m = /^#(rule|find)=(.+)$/.exec(location.hash);
    if (!m) return;
    input.value = decodeURIComponent(m[2]);
    st.q = input.value;
    update();
    // The finder is the first section, so the top of the page shows it. (scrollIntoView during load
    // landed thousands of pixels too low in Chrome while the diagram iframes were still laying out.)
    scrollTo(0, 0);
  }
  addEventListener('hashchange', fromHash);
  update();
  fromHash();
  // Diagram iframes and the browser's own scroll handling settle after load; land on the finder again.
  addEventListener('load', fromHash);
}

// Example queries come from the project's own data so the hints always return something.
function examples(rules) {
  const ex = [];
  const ruleish = ['state-transition', 'validation', 'calculation', 'permission'];
  const withLine = rules.find((r) => ruleish.includes(r.kind) && r.evidence.length) || rules.find((r) => r.evidence.length);
  if (withLine) {
    const e = withLine.evidence[Math.floor(withLine.evidence.length / 2)];
    ex.push(e.file.split('/').pop() + ':' + e.line);
  }
  const screen = rules.flatMap((r) => r.screens)[0];
  if (screen) ex.push(screen);
  const ep = rules.flatMap((r) => r.endpoints)[0];
  if (ep) ex.push(ep);
  const table = rules.flatMap((r) => r.tables)[0];
  if (table) ex.push(table);
  return [...new Set(ex)].slice(0, 4);
}

export function renderRuleFinder(index, { policyAnchor = {}, specAnchor = {}, flowAnchor = {}, player = false } = {}) {
  if (!index.rules.length) return null;
  const ex = examples(index.rules);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const section = `<section id="rules"><h2>규칙 찾기</h2>
<div class="finder">
<input type="search" id="rules-q" placeholder="파일:줄, 화면.버튼, API 경로, 테이블, 업무 용어로 찾기" autocomplete="off" aria-label="규칙 검색">
<p class="hint">예: ${ex.map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</p>
<div class="chips" id="rules-mod"></div>
<div class="chips" id="rules-kind"></div>
</div>
<p class="count" id="rules-count"></p>
<div id="rules-list"></div>
</section>`;
  const payload = { rules: index.rules, conflicts: index.conflicts ?? [], policyAnchor, specAnchor, flowAnchor, player };
  const lib = [parseFileRef, fileScore, conflictHits, haystack].map((f) => f.toString()).join('\n')
    + `\nconst fileMatches = ${fileMatches.toString()};`;
  const script = `<script type="application/json" id="gw-rules">${embedJson(payload)}</script>
<script>(function(){${lib}\n(${client.toString()})();})();</script>`;
  return { nav: '<h2>개발자용</h2><a href="#rules">규칙 찾기</a>', section, script };
}
