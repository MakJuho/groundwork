import path from 'node:path';

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function slugify(text) {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_SCHEME = /^(https?|mailto):/i;

// A leading `//`, `\\`, `/\` or `\/` is a network path (`file://host/...` from a local report, i.e. SMB on Windows).
const NETWORK_PATH = /^[\\/]{2}/;

// Returns the href to emit, or null when it is not allowed.
// Browsers ignore leading control characters and whitespace in URLs (and tabs/newlines anywhere),
// so the href is judged on its compacted form.
// Links (`asset` false) allow http, https, mailto, fragments, root and relative paths.
// Images and diagram iframes load without a click, so they allow relative paths only.
function resolveHref(href, base, { asset = false } = {}) {
  const compact = href.replace(/[\u0000- \u007f]/g, '');
  if (NETWORK_PATH.test(compact)) return null;
  if (asset && (SCHEME.test(compact) || /^[\\/]/.test(compact))) return null;
  if (SCHEME.test(compact)) return SAFE_SCHEME.test(compact) ? href : null;
  if (!base || /^[#/]/.test(href)) return href;
  return `${base.replace(/\/$/, '')}/${href}`;
}

export const DIAGRAM_OPEN = (src) =>
  `<a class="diagram-open" href="${src}" target="_blank" rel="noopener">새 창에서 크게 보기</a>`;

// In the single-page report every document is a section, so links between documents and to
// headings are rewritten to in-page anchors:
// - `idPrefix` is prepended to heading ids (and to `#fragment` links) so ids stay unique across docs.
// - `resolveDoc(relPath)` returns the section anchor (e.g. "doc-3") of a rendered document, or nothing.
//   A relative link whose normalized path is such a document becomes `#doc-3` (`#doc-3-<fragment>`).
function linkTarget(href, base, { resolveDoc, idPrefix = '' }) {
  const target = resolveHref(href, base);
  if (target === null) return null;
  if (href.startsWith('#')) return idPrefix ? `#${idPrefix}${href.slice(1)}` : href;
  if (!resolveDoc || SCHEME.test(href) || /^[\\/]/.test(href)) return target;
  const at = href.indexOf('#');
  const file = at === -1 ? href : href.slice(0, at);
  const frag = at === -1 ? '' : href.slice(at + 1);
  if (!file) return target;
  let rel = path.posix.normalize(base ? `${base}/${file}` : file);
  try {
    rel = decodeURIComponent(rel);
  } catch {}
  const anchor = resolveDoc(rel);
  if (!anchor) return target;
  return frag ? `#${anchor}-${frag}` : `#${anchor}`;
}

export function renderInline(text, base = '', opts = {}) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, href) => {
    const src = resolveHref(href, base, { asset: true });
    if (src === null) return alt;
    return /\.html?$/i.test(href)
      ? `<iframe class="diagram" src="${src}" title="${alt}" loading="lazy"></iframe>${DIAGRAM_OPEN(src)}`
      : `<img src="${src}" alt="${alt}">`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const target = linkTarget(href, base, opts);
    return target === null ? label : `<a href="${target}">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
}

const LIST_ITEM = /^\s*([-*]|\d+\.)\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const BLOCK_START = /^(#{1,6}\s|```|>|\s*([-*]|\d+\.)\s)/;
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function renderMarkdown(md, { base = '', resolveDoc, idPrefix = '' } = {}) {
  const opts = { resolveDoc, idPrefix };
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const isTableStart = (i) => lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level} id="${idPrefix}${slugify(heading[2])}">${renderInline(heading[2], base, opts)}</h${level}>`);
      i++;
      continue;
    }
    if (isTableStart(i)) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      const th = head.map((c) => `<th>${renderInline(c, base, opts)}</th>`).join('');
      const tb = rows.map((r) => `<tr>${r.map((c) => `<td>${renderInline(c, base, opts)}</td>`).join('')}</tr>`).join('');
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`);
      continue;
    }
    const item = line.match(LIST_ITEM);
    if (item) {
      const ordered = /\d/.test(item[1]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM);
        if (!m || /\d/.test(m[1]) !== ordered) break;
        items.push(`<li>${renderInline(m[2], base, opts)}</li>`);
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderInline(buf.join(' '), base, opts)}</blockquote>`);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const buf = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i]) && !isTableStart(i)) buf.push(lines[i++]);
    out.push(`<p>${renderInline(buf.join(' '), base, opts)}</p>`);
  }
  return out.join('\n');
}
