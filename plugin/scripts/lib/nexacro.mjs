// Nexacro .xfdl 화면 해석: 자체 최소 태그 파서로 컴포넌트를 폼 기준 절대 좌표로 펼친다.

// 컴포넌트가 아닌 구조·서식 태그
const NON_COMPONENT = new Set([
  'FDL', 'Form', 'Layouts', 'Layout', 'Objects', 'Dataset', 'ColumnInfo', 'Column', 'Columns',
  'Rows', 'Row', 'Cell', 'Formats', 'Format', 'Band', 'Bind', 'BindItem', 'Script', 'InitValue',
  'Contents', 'Includes', 'Include', 'Style', 'Styles',
]);
// 안쪽 태그를 통째로 무시하는 영역
const SKIP_INSIDE = new Set(['Formats', 'Objects', 'Bind', 'Script', 'Contents']);

const ATTR_RE = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
const TAG_RE = /<!--[\s\S]*?-->|<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;

function parseAttrs(s) {
  const out = {};
  for (const m of s.matchAll(ATTR_RE)) out[m[1]] = unescapeXml(m[3] ?? m[4] ?? '');
  return out;
}

function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

const num = (v) => (v !== undefined && v !== '' && /^-?\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : null);

// 값 하나를 부모 크기 기준 숫자로 (px 또는 %)
function size(v, parent) {
  const n = num(v);
  if (n !== null) return n;
  const m = /^(-?\d+(?:\.\d+)?)%$/.exec(String(v ?? '').trim());
  return m ? (Number(m[1]) / 100) * parent : null;
}

// 한 축(가로/세로)의 시작 위치와 길이를 계산한다. 불가능하면 approx.
function axis(start, len, end, parent) {
  const s = size(start, parent), l = size(len, parent), e = size(end, parent);
  if (s !== null && l !== null) return { pos: s, len: l };
  if (s !== null && e !== null) return { pos: s, len: parent - s - e };
  if (e !== null && l !== null) return { pos: parent - e - l, len: l };
  return { pos: s ?? 0, len: l ?? 0, approx: true };
}

function resolveBox(a, pw, ph) {
  if (a.position) {
    const p = a.position.trim().split(/\s+/);
    if (p[0] === 'absolute' && p.length >= 5) {
      const [l, t, r, b] = p.slice(1, 5).map(Number);
      if ([l, t, r, b].every(Number.isFinite)) return { left: l, top: t, width: r - l, height: b - t };
    }
  }
  const x = axis(a.left, a.width, a.right, pw);
  const y = axis(a.top, a.height, a.bottom, ph);
  const box = { left: x.pos, top: y.pos, width: x.len, height: y.len };
  if (x.approx || y.approx) box.approx = true;
  return box;
}

export function parseXfdl(text) {
  // 스크립트는 CDATA 안의 '<'가 태그로 읽히지 않게 먼저 떼어낸다
  let script = null;
  let body = text;
  const sm = /<Script\b[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/Script>/.exec(text);
  if (sm) {
    const cdataAt = sm.index + sm[0].indexOf('<![CDATA[') + 9;
    script = { text: sm[1], startLine: text.slice(0, cdataAt).split('\n').length };
    body = text.slice(0, sm.index) + text.slice(sm.index + sm[0].length);
  }

  const form = { id: '', title: '', width: 0, height: 0 };
  const components = [];
  const datasets = [];
  const stack = []; // { name, comp?, dataset? }
  let skipDepth = 0;

  const parentBox = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].comp) return stack[i].comp;
    return null;
  };

  for (const m of body.matchAll(TAG_RE)) {
    if (m[0].startsWith('<!--')) continue;
    const [, closing, name, attrStr, selfClose] = m;
    if (closing) {
      const top = stack.pop();
      if (top && SKIP_INSIDE.has(top.name)) skipDepth--;
      continue;
    }
    const a = parseAttrs(attrStr);

    if (name === 'Form' && !form.id && !stack.some((s) => s.comp)) {
      form.id = a.id ?? '';
      form.title = a.titletext ?? '';
      form.width = num(a.width) ?? 0;
      form.height = num(a.height) ?? 0;
    } else if (name === 'Dataset' && skipDepth > 0 && a.id && !selfClose) {
      datasets.push({ id: a.id, columns: [] });
    } else if (name === 'Column' && a.id && datasets.length && stack.some((s) => s.name === 'Dataset')) {
      datasets[datasets.length - 1].columns.push(a.id);
    } else if (skipDepth === 0 && !NON_COMPONENT.has(name) && a.id) {
      const par = parentBox();
      const pw = par ? par.width : form.width;
      const ph = par ? par.height : form.height;
      const box = resolveBox(a, pw, ph);
      const comp = {
        id: a.id, type: name, text: a.text ?? '',
        left: box.left + (par ? par.left : 0), top: box.top + (par ? par.top : 0),
        width: box.width, height: box.height, events: {}, parent: par ? par.id : null,
      };
      for (const [k, v] of Object.entries(a)) if (/^on\w+$/.test(k)) comp.events[k] = v;
      if (a.binddataset) comp.binddataset = a.binddataset;
      if (box.approx) comp.approx = true;
      components.push(comp);
      if (!selfClose) { stack.push({ name, comp }); continue; }
      continue;
    }

    if (!selfClose) {
      stack.push({ name });
      if (SKIP_INSIDE.has(name)) skipDepth++;
    }
  }
  return { ...form, components, datasets, script };
}

// ---- 스크립트: 함수 목록, 서버 호출 연결 ----

// text[i]가 여는 문자열/주석이면 끝 다음 위치를, 아니면 i를 돌려준다
function skipLiteral(text, i) {
  const c = text[i];
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
    return j + 1;
  }
  if (c === '/' && text[i + 1] === '/') {
    const j = text.indexOf('\n', i);
    return j < 0 ? text.length : j;
  }
  if (c === '/' && text[i + 1] === '*') {
    const j = text.indexOf('*/', i + 2);
    return j < 0 ? text.length : j + 2;
  }
  return i;
}

// 주석(과 선택적으로 문자열 안쪽)을 공백으로 가린다. 길이와 줄바꿈은 그대로라 위치가 같다.
export function maskCode(text, { strings = true } = {}) {
  let out = '';
  for (let i = 0; i < text.length;) {
    const j = skipLiteral(text, i);
    if (j === i) { out += text[i++]; continue; }
    const seg = text.slice(i, j);
    const quoted = seg[0] === '"' || seg[0] === "'";
    if (quoted && !strings) out += seg;
    else if (quoted) out += seg[0] + seg.slice(1, -1).replace(/[^\n]/g, ' ') + (seg.length > 1 ? seg.slice(-1) : '');
    else out += seg.replace(/[^\n]/g, ' ');
    i = j;
  }
  return out;
}

const lineAt = (script, i) => script.startLine + (script.text.slice(0, i).match(/\n/g) || []).length;

// `this.<이름> = function(` 꼴 함수를 모두 찾는다. body는 중괄호 안쪽(중괄호 제외).
export function listFunctions(script) {
  if (!script) return [];
  const text = script.text;
  const out = [];
  const masked = maskCode(text);
  const re = /this\.(\w+)\s*=\s*function\s*\(/g;
  let m;
  while ((m = re.exec(masked))) {
    let i = masked.indexOf('{', m.index + m[0].length);
    if (i < 0) continue;
    const start = i + 1;
    let depth = 0;
    while (i < text.length) {
      if (masked[i] === '{') depth++;
      else if (masked[i] === '}' && --depth === 0) break;
      i++;
    }
    out.push({ name: m[1], line: lineAt(script, m.index), body: text.slice(start, i), start, end: i });
    re.lastIndex = Math.max(re.lastIndex, i);
  }
  return out.map(({ name, line, body, start }) => ({ name, line, body, start }));
}

// 여는 괄호 다음 위치에서 최상위 인자를 나눈다. 문자열 리터럴이면 값, 아니면 null.
function parseArgs(text, from) {
  const args = [];
  let depth = 0, cur = '', i = from;
  const push = () => {
    const t = cur.trim();
    const lit = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')$/.exec(t);
    args.push(lit ? (lit[1] ?? lit[2]) : null);
    cur = '';
  };
  while (i < text.length) {
    const j = skipLiteral(text, i);
    if (j !== i) { cur += text.slice(i, j); i = j; continue; }
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) { if (cur.trim() || args.length) push(); break; }
      depth--;
    } else if (c === ',' && depth === 0) { push(); i++; continue; }
    cur += c;
    i++;
  }
  return args;
}

const COMMON_FN = /^gfn_\w*(callapi|transaction|tran)\w*$/i;
const CALL_RE = /this\.(\w+)\s*\(/g;

// 문자열 리터럴 "a=b a2=b2:U" 에서 한쪽 이름만 뽑는다 (side: 0 왼쪽, 1 오른쪽)
function dsNames(arg, side) {
  if (!arg) return [];
  return arg.trim().split(/\s+/).filter(Boolean)
    .map((p) => (p.split('=')[side] ?? '').replace(/:\w$/, ''))
    .filter(Boolean);
}

function serverCallIn(script, fn) {
  const masked = maskCode(fn.body);
  for (const m of masked.matchAll(CALL_RE)) {
    const name = m[1];
    const isTran = name === 'transaction';
    if (!isTran && !COMMON_FN.test(name)) continue;
    const a = parseArgs(fn.body, m.index + m[0].length);
    const line = lineAt(script, fn.start + m.index);
    return isTran
      ? { fn: fn.name, line, via: 'transaction', svcKey: a[0] ?? null, url: null, inDatasets: dsNames(a[2], 1), outDatasets: dsNames(a[3], 0), callback: a[5] ?? null }
      : { fn: fn.name, line, via: 'common', svcKey: a[0] ?? null, url: null, inDatasets: dsNames(a[1], 1), outDatasets: dsNames(a[2], 0), callback: a[3] ?? null };
  }
  return null;
}

function localCallees(fn, byName) {
  const out = [];
  for (const m of maskCode(fn.body).matchAll(CALL_RE)) if (byName.has(m[1]) && !out.includes(m[1])) out.push(m[1]);
  return out;
}

// 핸들러 본문 → 같은 화면 함수(깊이 maxDepth까지) 순서로 첫 서버 호출을 찾는다
export function findServerCall(script, handlerName, maxDepth = 2) {
  if (!script) return null;
  const fns = listFunctions(script);
  const byName = new Map(fns.map((f) => [f.name, f]));
  const seen = new Set();
  const visit = (name, depth) => {
    const fn = byName.get(name);
    if (!fn || seen.has(name)) return null;
    seen.add(name);
    const own = serverCallIn(script, fn);
    if (own) return own;
    if (depth >= maxDepth) return null;
    for (const callee of localCallees(fn, byName)) {
      const r = visit(callee, depth + 1);
      if (r) return r;
    }
    return null;
  };
  return visit(handlerName, 0);
}

// apiUrl.xjs 의 "키" : "/경로" 항목
export function parseApiUrlMap(text) {
  const map = {};
  for (const m of text.matchAll(/"([^"\n]+)"\s*:\s*"([^"\n]*)"/g)) map[m[1]] = m[2];
  return map;
}

export function resolveUrl(svcKeyOrUrl, apiMap) {
  if (svcKeyOrUrl == null) return null;
  const k = String(svcKeyOrUrl);
  if (apiMap && Object.hasOwn(apiMap, k)) return apiMap[k];
  if (k.startsWith('svc::')) return k.slice(5);
  return k.startsWith('/') ? k : null;
}
