import { FONT, MONO } from './theme.mjs';

// The report reads as an app, not one long page: every <main> section is a view, and only the one the
// hash points at is shown (#home by default). Inside documents, the browser script turns the generated
// markdown into something easier to scan: policy rules become cards with folded evidence, empty
// sections shrink to one line, summary tables become chips, and long code paths show only the file name.
// The HTML stays complete without the script: every section is in the page and every link still works.

export const VIEW_STYLE = `
*{box-sizing:border-box}
html{scroll-padding-top:60px}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.65 ${FONT}}
a{color:var(--accent)}
.top{position:sticky;top:0;z-index:20}
.top .home-link{color:inherit;text-decoration:none}
.layout{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:calc(100vh - 47px)}
nav{border-right:1px solid var(--line);background:var(--card);padding:6px 10px 40px;position:sticky;top:47px;height:calc(100vh - 47px);overflow:auto;font-size:14px;display:flex;flex-direction:column}
nav h2,nav summary{margin:14px 0 6px;padding:14px 10px 0;border-top:1px solid var(--line);font-size:15.5px;font-weight:700;color:var(--ink);letter-spacing:-.01em}
nav a{display:block;padding:5px 10px;border-radius:7px;color:var(--ink);text-decoration:none;line-height:1.4}
nav a:hover{background:var(--grid-head)}
nav a.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
nav select{margin:12px 10px 4px;font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.no-js #nav-mod{display:none}
nav summary{display:flex;justify-content:space-between;align-items:center;cursor:pointer;list-style:none}
nav summary::-webkit-details-marker{display:none}
nav summary::after{content:'';width:8px;height:8px;margin-right:4px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(-45deg);transition:transform .15s}
nav details[open] > summary::after{transform:rotate(45deg) translate(-2px,-2px)}
nav summary:hover::after{border-color:var(--accent)}
nav .nav-mod.off .mod-name{color:var(--faint)}
nav .mod-docs a{padding-left:22px}
.js nav .mod-docs{display:none}
.js nav .nav-mod.cur .mod-docs{display:block}
.js nav.in-mod .nav-mod:not(.cur),.js nav.in-mod .nav-mods > summary,.js nav.in-mod .nav-group{display:none}
.js nav.in-mod .nav-start{order:1}
.js nav.in-mod .nav-mod.cur .mod-name{font-size:18px;font-weight:700;margin-top:8px}
main{min-width:0;padding:28px 40px 80px}
main > section{max-width:1180px}
.js main > section{display:none}
.js main > section.on{display:block}
.no-js main > section{margin-bottom:56px}
/* home */
.hero{padding:4px 0 18px}
.eyebrow{margin:0;color:var(--accent);font-weight:700;font-size:13px;letter-spacing:.05em}
.hero h1{font-size:34px;margin:4px 0 6px;letter-spacing:-.02em}
.lead{margin:0 0 18px;color:var(--muted);max-width:760px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:22px 0 8px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}
.stat b{display:block;font-size:28px;line-height:1.1;letter-spacing:-.02em}
.stat span{font-size:13px;color:var(--muted)}
.stat.ok b{color:var(--muted)}
.stat.warn b{color:var(--warn)}
.sh{font-size:16px;margin:28px 0 12px}
.mgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}
.mcard{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;box-shadow:var(--shadow)}
.mcard:hover{border-color:var(--accent-line)}
.mcard.off{display:block;text-decoration:none;color:var(--ink);background:var(--grid-head);box-shadow:none}
.mcard.off h3,.mcard.off p{color:var(--muted)}
.mcard h3{margin:0;font-size:18px}
.mcard p{margin:6px 0 10px;color:var(--muted);font-size:14px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:12.5px;background:var(--grid-head);border-radius:999px;padding:1px 10px;color:var(--ink)}
.chip.warn{background:var(--warn-soft);color:var(--warn)}
.chip.zero{opacity:.45}
.mlinks{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:12px;font-size:14px;font-weight:600}
.mlinks a{text-decoration:none}
.mlinks a.sub{font-weight:400;color:var(--muted)}
.start{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.scard{display:block;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;text-decoration:none;color:var(--ink);box-shadow:var(--shadow)}
.scard:hover{border-color:var(--accent-line)}
.scard b{display:block}
.scard span{font-size:13px;color:var(--muted)}
/* documents */
.group{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:13px;color:var(--muted)}
.group a{color:var(--muted);text-decoration:none}
.group a:hover{color:var(--accent)}
.doc-grid{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:40px;align-items:start}
.doc-body{min-width:0}
.doc-body h1,#overview > h2,#rules > h2,#conflicts > h2,main > section[id^="mod-"] > h2{font-size:28px;margin:0 0 6px;letter-spacing:-.02em}
.stub{color:var(--muted)}
.doc-body h2{font-size:19px;margin:36px 0 12px;padding-top:14px;border-top:1px solid var(--line)}
.doc-body h3{font-size:16px;margin:20px 0 8px}
.doc-body blockquote{margin:0 0 18px;padding:0;border:0;color:var(--faint);font-size:13px}
table{border-collapse:collapse;width:100%;margin:12px 0;display:block;overflow-x:auto;font-size:14px}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top;word-break:keep-all}
th{font-size:12.5px;color:var(--muted);font-weight:600;background:var(--grid-head)}
code{font:12.5px ${MONO};background:var(--code);border:1px solid var(--line2);border-radius:4px;padding:0 4px;overflow-wrap:anywhere}
code.path{color:var(--muted);cursor:help}
pre{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto}
pre code{border:0;padding:0;background:none}
iframe.diagram{width:100%;height:520px;border:1px solid var(--line);border-radius:10px;background:#fff}
.diagram-open{display:inline-block;margin:4px 0 16px;font-size:13px;color:var(--accent)}
.badge{display:inline-block;background:var(--accent);color:var(--bg);border-radius:999px;padding:0 8px;font-size:12px}
.play{margin:0 0 14px;font-size:14px}
.play a{display:inline-block;margin:2px 6px 2px 0;padding:5px 12px;border:1px solid var(--accent);border-radius:8px;text-decoration:none;font-weight:600}
.play a:hover{background:var(--accent);color:var(--accent-ink)}
.toc{position:sticky;top:70px;font-size:13px;border-left:1px solid var(--line);padding-left:14px;max-height:calc(100vh - 100px);overflow:auto}
.toc:empty{display:none}
.toc p{margin:0 0 6px;font-size:11.5px;font-weight:700;color:var(--faint);letter-spacing:.06em}
.toc a{display:block;color:var(--muted);text-decoration:none;padding:3px 0;line-height:1.35}
.toc a.sub{padding-left:12px;font-size:12.5px}
.toc a:hover{color:var(--accent)}
.empty-sec{display:flex;gap:10px;align-items:baseline;margin:22px 0 0;padding-top:12px;border-top:1px solid var(--line);color:var(--faint);font-size:14px}
.empty-sec b{color:var(--muted);font-weight:600}
.sumchips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}
.sumchips .chip{font-size:13px;padding:3px 12px}
.sumchips .chip b{margin-left:6px}
.rcard{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:14px 16px;margin:12px 0;box-shadow:var(--shadow)}
.rcard:target{border-color:var(--accent)}
.rcard .rh{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rcard .rid{font:600 12.5px ${MONO};color:var(--accent);background:var(--accent-soft);border-radius:5px;padding:1px 7px}
.rcard .rt{font-weight:700;font-size:16px}
.rcard .conf{margin-left:auto;font-size:12px;color:var(--muted);white-space:nowrap}
.rcard .rp{margin:8px 0 6px}
.rcard .rmeta{font-size:13px;color:var(--muted);margin:4px 0}
.rcard details{margin-top:8px;font-size:13px}
.rcard summary{cursor:pointer;color:var(--muted);user-select:none}
.rcard summary:hover{color:var(--accent)}
.rcard ul.ev{list-style:none;margin:6px 0 0;padding:0}
.rcard ul.ev li{font:12.5px ${MONO};padding:3px 8px;border-left:3px solid var(--line);margin:2px 0;overflow-wrap:anywhere;color:var(--muted)}
.rcard .rflows{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.rcard .rflows a{font-size:12.5px;text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:1px 10px}
.rcard .rflows a:hover{border-color:var(--accent)}
#rules .finder{top:47px}
/* policy conflicts: home card, conflict view, CFL badges (policy cards, rule finder) */
.cflcard{display:flex;align-items:center;gap:14px 20px;flex-wrap:wrap;margin:14px 0 4px;padding:16px 20px;background:var(--card);border:1px solid var(--line);border-left:5px solid var(--warn);border-radius:12px;box-shadow:var(--shadow);color:var(--ink);text-decoration:none}
.cflcard:hover{border-color:var(--warn)}
.cflcard.ok{border-left-color:var(--line)}
.cflcard.ok:hover{border-color:var(--accent-line)}
.cfl-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.cfl-n{font-size:19px;font-weight:700;letter-spacing:-.01em}
.cfl-n b{font-size:28px;color:var(--warn);margin:0 2px}
.cflcard.ok .cfl-n b{color:var(--muted)}
.cfl-note{font-size:13px;color:var(--muted)}
.cfl-side{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin-left:auto}
.sevs{display:flex;gap:6px}
.sev{font-size:13px;font-weight:600;border-radius:999px;padding:2px 11px;background:var(--grid-head);color:var(--muted);white-space:nowrap}
.sev.sev-high{background:var(--warn-soft);color:var(--warn)}
.sev.sev-medium{background:var(--accent-soft);color:var(--accent)}
.cfl-delta{display:inline-block;font-size:14.5px;font-weight:700;color:var(--ink);background:var(--hl);border:1px solid var(--hl-line);border-radius:8px;padding:4px 12px;white-space:nowrap}
.cfl-go{font-size:20px;color:var(--faint)}
.cflcard:hover .cfl-go{color:var(--warn)}
#conflicts .lead{margin:0 0 12px}
#conflicts p.cfl-delta{margin:0 0 6px}
.cfl-empty{margin:18px 0;padding:14px 16px;border:1px dashed var(--line);border-radius:12px;color:var(--muted)}
.cfl{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--line);border-radius:12px;padding:16px 18px;margin:14px 0;box-shadow:var(--shadow)}
.cfl.sev-high{border-left-color:var(--warn)}
.cfl.sev-medium{border-left-color:var(--accent)}
.cfl:target{border-color:var(--accent);border-left-width:5px}
.cfl.unverified{border-style:dashed;border-left-style:solid;border-left-color:var(--faint);box-shadow:none}
.cfl-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cfl-h h3{margin:0;font-size:17px;line-height:1.4}
.cid{font:600 12.5px ${MONO};color:var(--accent);background:var(--accent-soft);border-radius:5px;padding:1px 7px}
.cfl-new{font:800 11.5px/1.6 ${FONT};letter-spacing:.08em;color:#fff;background:var(--badge);border-radius:5px;padding:1px 8px}
.cfl-tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}
.cfl-tags .tag{font-size:12.5px;border:1px solid var(--line);border-radius:999px;padding:1px 10px;color:var(--muted)}
.cfl-tags .sev{font-size:12.5px;padding:1px 10px}
.cfl-story{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 14px;margin:10px 0 12px}
.cfl-story dt{font-size:13px;font-weight:700;color:var(--muted);padding-top:1px}
.cfl-story dd{margin:0}
.cfl-sides{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
.cfl-sidebox{background:var(--form);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
.cfl-label{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;margin:0 0 6px}
.cfl-label b{font-size:14px}
.cfl-rules{font-size:12.5px;color:var(--muted)}
.cfl-rules a{font:600 12.5px ${MONO};text-decoration:none;margin-left:2px}
.cfl ul.ev{list-style:none;margin:0;padding:0}
.cfl ul.ev li{padding:4px 8px;border-left:3px solid var(--warn);margin:4px 0;background:var(--code);border-radius:0 6px 6px 0}
.cfl.sev-medium ul.ev li{border-left-color:var(--accent)}
.cfl ul.ev .loc{display:block;font:12px ${MONO};color:var(--muted);cursor:help}
.cfl ul.ev code{display:block;border:0;background:none;padding:0;font-size:13px;color:var(--ink);white-space:pre-wrap}
#conflicts .cfl-note{margin:0 0 4px;font-size:13px}
.cfl-badge{display:inline-block;vertical-align:middle;font:700 11.5px/1.5 ${MONO};color:var(--warn);background:var(--warn-soft);border:1px solid var(--warn);border-radius:5px;padding:0 6px;text-decoration:none;white-space:nowrap}
.cfl-badge:hover{background:var(--warn);color:var(--card)}
@media (max-width:1100px){.doc-grid{grid-template-columns:minmax(0,1fr)}.toc{display:none}}
@media (max-width:760px){.layout{grid-template-columns:minmax(0,1fr)}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:20px 16px}}
`;

// Runs in the browser, serialized with Function.prototype.toString: no closures over this module.
export function viewClient() {
  document.documentElement.classList.replace('no-js', 'js');
  const views = [...document.querySelectorAll('main > section')];
  const navLinks = [...document.querySelectorAll('nav a[href^="#"]:not(.mod-name)')];
  const nav = document.querySelector('nav');
  const picker = document.getElementById('nav-mod');
  const start = document.querySelector('nav .nav-start');
  const mods = document.querySelector('nav .nav-mods');
  const modBlocks = [...document.querySelectorAll('nav .nav-mod')];
  // Inside a module the nav shows that module's documents only and folds 시작하기 (CSS does the hiding).
  // The open module's block sits inside the module list, so a list the reader folded opens again.
  function showModule(id) {
    if (nav) nav.classList.toggle('in-mod', !!id);
    for (const b of modBlocks) b.classList.toggle('cur', b.dataset.module === id);
    if (picker) picker.value = id || '';
    if (start) start.open = !id;
    if (mods && id) mods.open = true;
  }
  let rules = [];
  try { rules = JSON.parse(document.getElementById('gw-rules').textContent).rules; } catch { /* no rules */ }
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const el = (tag, cls, ...kids) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    for (const k of kids.flat()) if (k !== null && k !== undefined) e.append(k);
    return e;
  };
  const link = (href, text, attrs = {}) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
    return a;
  };

  // Brand and project name in the top bar go home.
  for (const s of document.querySelectorAll('.top .brand, .top .proj')) {
    const a = link('#home', s.textContent, { class: 'home-link' });
    s.replaceChildren(a);
  }

  for (const body of document.querySelectorAll('.doc-body')) {
    // Long code paths: show "File.java:33", keep the full path in the tooltip.
    for (const c of body.querySelectorAll('code')) {
      const m = /^(?:[\w.-]+\/)+([\w.-]+\.[A-Za-z0-9]+)(:\d+)?$/.exec(c.textContent);
      if (m) { c.title = c.textContent; c.textContent = m[1] + (m[2] || ''); c.classList.add('path'); }
    }
    // "분류 | 개수" summary tables -> chips.
    for (const table of body.querySelectorAll('table')) {
      const head = [...table.querySelectorAll('th')].map((th) => th.textContent.trim());
      if (head.length !== 2 || head[0] !== '분류' || head[1] !== '개수') continue;
      const chips = el('div', 'sumchips');
      for (const tr of table.querySelectorAll('tbody tr')) {
        const [a, b] = [...tr.children].map((td) => td.textContent.trim());
        if (a !== '합계') chips.append(el('span', 'chip' + (b === '0' ? ' zero' : ''), a, el('b', null, b)));
      }
      table.replaceWith(chips);
    }
    // A heading followed only by "해당 없음" -> one quiet line.
    for (const h2 of [...body.querySelectorAll('h2')]) {
      const next = h2.nextElementSibling;
      const after = next && next.nextElementSibling;
      if (next && next.tagName === 'P' && /^(해당 없음|없음)\.?$/.test(next.textContent.trim()) && (!after || after.tagName === 'H2')) {
        const line = el('div', 'empty-sec', el('b', null, h2.textContent), '해당 없음');
        line.id = h2.id;
        h2.replaceWith(line);
        next.remove();
      }
    }
    // Policy rules "### ORD-004 제목" + bullets -> a card; evidence folded, flows linked to the player.
    for (const h3 of [...body.querySelectorAll('h3')]) {
      // CFL badges (report.mjs adds them after the title) move into the card header, not into its title.
      const badges = [...h3.querySelectorAll('.cfl-badge')];
      const text = [...h3.childNodes].filter((n) => !badges.includes(n)).map((n) => n.textContent).join('');
      const m = /^([A-Z]{2,4}-\d{3})\s+(.*)$/.exec(text.trim());
      const list = h3.nextElementSibling && h3.nextElementSibling.tagName === 'UL' ? h3.nextElementSibling : null;
      if (!m || !list) continue;
      const conf = el('span', 'conf');
      const card = el('div', 'rcard', el('div', 'rh', el('span', 'rid', m[1]), el('span', 'rt', m[2]), badges, conf));
      card.id = h3.id;
      let evidence = [];
      for (const li of [...list.children]) {
        const key = li.textContent.split(':')[0].trim();
        if (key === '신뢰도') { conf.textContent = li.textContent.replace(/^신뢰도:\s*/, ''); continue; }
        if (key === '근거') { evidence = [...li.querySelectorAll('code')]; continue; }
        const p = el('p', key === '정책' ? 'rp' : 'rmeta', ...li.childNodes);
        if (key === '정책' && p.firstChild && p.firstChild.nodeType === 3) p.firstChild.textContent = p.firstChild.textContent.replace(/^정책:\s*/, '');
        card.append(p);
      }
      if (evidence.length) {
        card.append(el('details', null, el('summary', null, '근거 코드 ' + evidence.length + '곳'),
          el('ul', 'ev', evidence.map((c) => el('li', null, c.title || c.textContent)))));
      }
      // The page names the player file only when there is one (body data-player).
      const player = document.body.dataset.player;
      const flows = player ? ((ruleById.get(m[1]) || {}).flows || []).filter((f) => f.screen) : [];
      if (flows.length) {
        card.append(el('div', 'rflows', flows.map((f) => link(player + '#' + f.screen,
          '▶ ' + f.title + (f.steps.length ? ' · 단계 ' + f.steps.join(', ') : ''), { target: '_blank', rel: 'noopener' }))));
      }
      h3.replaceWith(card);
      list.remove();
    }
    // Table of contents: sections, with rule cards under them.
    const toc = body.parentElement.querySelector('.toc');
    const items = [...body.querySelectorAll('h2, .rcard, .empty-sec')].filter((x) => x.id);
    if (toc && items.length > 2) {
      toc.append(el('p', null, '이 문서의 목차'));
      for (const it of items) {
        const card = it.classList.contains('rcard');
        const text = card ? it.querySelector('.rid').textContent + ' ' + it.querySelector('.rt').textContent
          : it.tagName === 'H2' ? it.textContent : it.querySelector('b').textContent;
        toc.append(link('#' + it.id, text, card ? { class: 'sub' } : {}));
      }
    }
  }

  // Breadcrumb: "홈 ›" before each document's group line.
  for (const g of document.querySelectorAll('main > section > p.group')) {
    g.prepend(link('#home', '홈'), ' › ');
  }

  // Router: #home, #<section>, #<anything inside a section>, #rule=… / #find=… (rule finder).
  function route() {
    let id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { id = ''; }
    const finder = /^(rule|find)=/.test(id);
    let target = finder ? document.getElementById('rules') : id ? document.getElementById(id) : null;
    let view = target && target.closest('main > section');
    if (!view) { view = document.getElementById('home') || views[0]; target = null; }
    for (const v of views) v.classList.toggle('on', v === view);
    for (const a of navLinks) a.classList.toggle('on', a.getAttribute('href') === '#' + view.id);
    showModule(view.dataset.module || '');
    if (target && target !== view && !finder) {
      const go = () => target.scrollIntoView({ block: 'start' });
      requestAnimationFrame(go);
      setTimeout(go, 400);
    } else scrollTo(0, 0);
  }
  addEventListener('hashchange', route);
  route();

  const qs = document.getElementById('qs');
  if (qs) qs.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('qs-in').value.trim();
    location.hash = q ? 'find=' + encodeURIComponent(q) : 'rules';
  });

  if (picker) picker.addEventListener('change', () => {
    const block = modBlocks.find((b) => b.dataset.module === picker.value);
    const name = block && block.querySelector('.mod-name');
    location.hash = name ? name.getAttribute('href').slice(1) : 'home';
  });

  const qsIn = document.getElementById('qs-in');
  if (qsIn) addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.isComposing && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      qsIn.focus();
      qsIn.select();
    }
  });
}
