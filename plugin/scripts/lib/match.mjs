// Policy ids never change once given (design §3 "정책 번호 고정"). The analyzer is asked to keep them,
// and this restores them when it did not: same kind + an evidence line in the same file within ±3 lines
// means the same rule.

const WINDOW = 3;
const ID = /^([A-Z]{2,4})-(\d{3})$/;

const parse = (id) => {
  const m = ID.exec(String(id ?? ''));
  return m ? { prefix: m[1], n: Number(m[2]) } : null;
};
const format = (prefix, n) => `${prefix}-${String(n).padStart(3, '0')}`;
const evidenceOf = (it) => (Array.isArray(it?.evidence) ? it.evidence : []);

// Smallest line distance between two items' evidence in the same file, or Infinity.
function distance(a, b) {
  let best = Infinity;
  for (const x of evidenceOf(a)) {
    for (const y of evidenceOf(b)) {
      if (x?.file === y?.file && Number.isInteger(x?.line) && Number.isInteger(y?.line)) best = Math.min(best, Math.abs(x.line - y.line));
    }
  }
  return best;
}

// Names in the cited code (and the detail name). Values are left out on purpose: 50 -> 30 is the same rule.
const KEYWORDS = new Set(['export', 'const', 'let', 'var', 'return', 'throw', 'new', 'function', 'this', 'public', 'private', 'protected', 'static', 'final', 'class', 'def', 'self', 'true', 'false', 'null', 'else']);
function names(it) {
  const text = [...evidenceOf(it).map((e) => String(e?.snippet ?? '')), typeof it?.details?.name === 'string' ? it.details.name : ''].join(' ');
  return new Set((text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).filter((w) => w.length >= 3 && !KEYWORDS.has(w)));
}
// null when either side cites no names (then only the line can tell), otherwise the Jaccard overlap.
function similarity(a, b) {
  const x = names(a);
  const y = names(b);
  if (!x.size || !y.size) return null;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

export function matchFacts(prev, next, { retired = [], abbrev } = {}) {
  const prevItems = Array.isArray(prev?.items) ? prev.items : [];
  const nextItems = Array.isArray(next?.items) ? next.items : [];
  const prefix = prevItems.map((it) => parse(it.id)?.prefix).find(Boolean) ?? abbrev ?? nextItems.map((it) => parse(it.id)?.prefix).find(Boolean);
  const warnings = [];
  if (abbrev && prefix && abbrev !== prefix) warnings.push(`module abbrev ${abbrev} differs from the ids already given (${prefix}); keeping ${prefix}`);

  // 1. Evidence pairs within the window; the same cited names first, then the closest line. Dense rules
  // (constants on consecutive lines) shift together when a line is inserted, so nearest-line alone would
  // hand every one of them its neighbour's id. Each previous item pairs once.
  const pairs = [];
  nextItems.forEach((it, i) => {
    prevItems.forEach((p, j) => {
      if (it.kind !== p.kind) return;
      const d = distance(it, p);
      const s = similarity(it, p);
      // Two rules that cite entirely different names are different rules, however close the lines.
      if (d <= WINDOW && s !== 0) pairs.push({ i, j, d, s: s ?? 0 });
    });
  });
  pairs.sort((a, b) => b.s - a.s || a.d - b.d || a.j - b.j || a.i - b.i);
  const assigned = new Array(nextItems.length).fill(null);
  const usedPrev = new Set();
  for (const { i, j } of pairs) {
    if (assigned[i] !== null || usedPrev.has(j)) continue;
    assigned[i] = prevItems[j].id;
    usedPrev.add(j);
  }

  // 2. An agent id that names a still-unpaired previous rule of the same kind is trusted.
  const prevIndex = new Map(prevItems.map((p, j) => [p.id, j]));
  nextItems.forEach((it, i) => {
    if (assigned[i] !== null) return;
    const j = prevIndex.get(it.id);
    if (j === undefined || usedPrev.has(j) || prevItems[j].kind !== it.kind) return;
    assigned[i] = it.id;
    usedPrev.add(j);
  });

  // 3. Everything else is a new rule and gets the next unused number.
  const taken = [...prevItems.map((p) => p.id), ...retired, ...assigned.filter(Boolean)];
  let max = Math.max(0, ...taken.map((id) => parse(id)).filter((p) => p && p.prefix === prefix).map((p) => p.n));
  const fresh = new Array(nextItems.length).fill(false);
  nextItems.forEach((it, i) => {
    if (assigned[i] !== null) return;
    assigned[i] = format(prefix, ++max);
    fresh[i] = true;
  });

  const report = { kept: [], restored: [], renumbered: [], added: [], retired: [], warnings };
  nextItems.forEach((it, i) => {
    const to = assigned[i];
    if (fresh[i]) {
      report.added.push(to);
      if (it.id !== to) report.renumbered.push({ from: it.id, to });
    } else if (it.id === to) {
      report.kept.push(to);
    } else {
      report.restored.push({ from: it.id, to });
    }
  });
  prevItems.forEach((p, j) => {
    if (!usedPrev.has(j)) report.retired.push({ id: p.id, kind: p.kind, summary: p.summary });
  });
  return { facts: { ...next, items: nextItems.map((it, i) => ({ ...it, id: assigned[i] })) }, report };
}

// Conflict ids (CFL-nnn) stay fixed the same way (spec §4.7 "번호 유지"). Same conflict: the agent's own id
// when it still shares a cited file or a rule id with that previous conflict (it is told to keep ids);
// otherwise the same type sharing a rule id and a cited file (a hub rule alone is not enough), or
// evidence lines within ±3 in two or more different files.
const CONFLICT = /^CFL-(\d{3})$/;
const conflictNumber = (id) => {
  const m = CONFLICT.exec(String(id ?? ''));
  return m ? Number(m[1]) : null;
};
const sidesOf = (c) => (Array.isArray(c?.sides) ? c.sides : []);
const ruleIdsOf = (c) => new Set(sidesOf(c).flatMap((s) => (Array.isArray(s?.ruleIds) ? s.ruleIds : [])));
const conflictEvidence = (c) => sidesOf(c).flatMap((s) => evidenceOf(s));
const filesOf = (c) => new Set(conflictEvidence(c).map((e) => e?.file).filter(Boolean));
const shares = (xs, ys) => [...xs].some((x) => ys.has(x));

function conflictScore(a, b) {
  const prevRules = ruleIdsOf(b);
  const sameFile = shares(filesOf(a), filesOf(b));
  const sharedRules = a.type === b.type && sameFile ? [...ruleIdsOf(a)].filter((id) => prevRules.has(id)).length : 0;
  const theirs = conflictEvidence(b);
  const overlapping = conflictEvidence(a).filter((x) =>
    theirs.some((y) => x?.file === y?.file && Number.isInteger(x?.line) && Number.isInteger(y?.line) && Math.abs(x.line - y.line) <= WINDOW));
  const files = new Set(overlapping.map((x) => x.file)).size;
  return sharedRules > 0 || files >= 2 ? sharedRules + overlapping.length : 0;
}

// Ids from CFL-900 up are temporary (the agent's placeholders for new conflicts); with no previous
// result to match against they still get the next free number, never one already retired.
export const TEMPORARY_FROM = 900;
export function numberTemporary(conflicts, retired = []) {
  const isTemporary = (id) => (conflictNumber(id) ?? 0) >= TEMPORARY_FROM;
  const kept = [...conflicts.map((c) => c.id), ...retired].filter((id) => !isTemporary(id));
  let max = Math.max(0, ...kept.map(conflictNumber).filter((n) => n !== null));
  return conflicts.map((c) => (isTemporary(c.id) ? { ...c, id: `CFL-${String(++max).padStart(3, '0')}` } : c));
}

export function matchConflicts(prev, next, { retired = [], seen } = {}) {
  const prevList = Array.isArray(prev?.conflicts) ? prev.conflicts : [];
  const nextList = Array.isArray(next?.conflicts) ? next.conflicts : [];

  const matched = new Array(nextList.length).fill(null);
  const usedPrev = new Set();

  // 1. The agent's id, when it still shares a cited file or a rule id with the previous conflict of that id.
  const prevIndex = new Map(prevList.map((p, j) => [p.id, j]));
  nextList.forEach((c, i) => {
    const j = prevIndex.get(c.id);
    if (j === undefined || usedPrev.has(j)) return;
    const p = prevList[j];
    if (!shares(filesOf(c), filesOf(p)) && !shares(ruleIdsOf(c), ruleIdsOf(p))) return;
    matched[i] = j;
    usedPrev.add(j);
  });

  // 2. Highest score first, one previous conflict per new one.
  const pairs = [];
  nextList.forEach((c, i) => {
    if (matched[i] !== null) return;
    prevList.forEach((p, j) => {
      if (usedPrev.has(j)) return;
      const score = conflictScore(c, p);
      if (score > 0) pairs.push({ i, j, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score || a.j - b.j || a.i - b.i);
  for (const { i, j } of pairs) {
    if (matched[i] !== null || usedPrev.has(j)) continue;
    matched[i] = j;
    usedPrev.add(j);
  }

  // 3. Everything else is new and gets the next unused number; retired numbers are never given again.
  const taken = [...prevList.map((p) => p.id), ...retired, ...matched.filter((j) => j !== null).map((j) => prevList[j].id)];
  let max = Math.max(0, ...taken.map(conflictNumber).filter((n) => n !== null));
  const report = { kept: [], restored: [], added: [], retired: [] };
  const conflicts = nextList.map((c, i) => {
    if (matched[i] === null) {
      const id = `CFL-${String(++max).padStart(3, '0')}`;
      report.added.push(id);
      return { ...c, id, firstSeen: seen ?? c.firstSeen };
    }
    const p = prevList[matched[i]];
    if (c.id === p.id) report.kept.push(p.id);
    else report.restored.push({ from: c.id, to: p.id });
    return { ...c, id: p.id, firstSeen: p.firstSeen };
  });
  prevList.forEach((p, j) => {
    if (!usedPrev.has(j)) report.retired.push({ id: p.id, title: p.title });
  });
  return { doc: { ...next, conflicts }, report };
}
