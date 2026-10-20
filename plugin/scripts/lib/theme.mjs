// Shared look for every page Groundwork writes (report, flow player): one set of color tokens,
// one font stack and one top bar, so moving between pages feels like one site.
// Warm stone + amber, matching the diagram-design diagrams embedded in the report.

export const FONT = '-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Segoe UI",system-ui,sans-serif';
export const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

export const THEME_TOKENS = `
:root{--bg:#fafaf9;--card:#ffffff;--ink:#1c1917;--fg:var(--ink);--muted:#57534e;--faint:#8b857f;--line:#e7e5e4;--line2:#f0eeec;
--accent:#b45309;--accent-ink:#ffffff;--accent-soft:#fdf3e4;--accent-line:#e8b77a;--hl:#fef3c7;--hl-line:#d97706;
--warn:#b42318;--warn-soft:#fdecea;--badge:#dc2626;--code:#f5f5f4;--form:#fcfcfb;--grid-head:#f1efed;
--shadow:0 1px 2px #1c19170d,0 2px 8px #1c191708}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--card:#292524;--ink:#f5f5f4;--muted:#a8a29e;--faint:#78716c;--line:#44403c;--line2:#35302d;
--accent:#f59e0b;--accent-ink:#1c1917;--accent-soft:#3a2a12;--accent-line:#8a5a14;--hl:#4a3d0c;--hl-line:#c9a227;
--warn:#f87171;--warn-soft:#3b1d1a;--badge:#f05252;--code:#211d1b;--form:#24201e;--grid-head:#332e2b;--shadow:none}}
`;

// The bar at the top of every page: brand / page name · project, and a link to the other page.
export const TOP_BAR_STYLE = `
.top{display:flex;align-items:center;gap:12px;padding:10px 20px;border-bottom:1px solid var(--line);background:var(--card);font:14px/1.5 ${FONT};color:var(--ink)}
.top .brand{font-weight:700;letter-spacing:-.01em}
.top .sep{color:var(--faint)}
.top .proj{font-weight:600}
.top .nav-link{margin-left:auto;font-size:13px;text-decoration:none;border:1px solid var(--line);border-radius:6px;padding:3px 10px;color:var(--ink)}
.top .nav-link:hover{border-color:var(--accent);color:var(--accent)}
`;

export function topBar({ page, project, link = null, escapeHtml }) {
  const a = link ? `<a class="nav-link" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>` : '';
  return `<header class="top"><span class="brand">Groundwork</span><span class="sep">/</span><span>${escapeHtml(page)}</span><span class="sep">·</span><span class="proj">${escapeHtml(project)}</span>${a}</header>`;
}
