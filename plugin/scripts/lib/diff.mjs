// Policy change log (design §3 "정책 변경 내역"): compares facts before and after an update by policy id.
// Ids are stable (match-facts), so the same id on both sides is the same rule.

const TYPE_ORDER = { changed: 0, added: 1, removed: 2 };
const evidenceOf = (it) => (Array.isArray(it?.evidence) ? it.evidence : []);
const locations = (it) => evidenceOf(it).map((e) => `${e.file}:${e.line}`).sort();
const snippets = (it) => evidenceOf(it).map((e) => String(e.snippet ?? '').replace(/\s+/g, ' ').trim()).sort();
// verify-citations lowers a failed item to low; that belongs to 확인 필요, not to the rule itself.
const confidenceOf = (it) => it.originalConfidence ?? it.confidence;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (isObject(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v;
}

// Leaf-level differences; arrays count as one value.
export function detailChanges(before, after, prefix = '') {
  const a = isObject(before) ? before : {};
  const b = isObject(after) ? after : {};
  const out = [];
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const p = prefix ? `${prefix}.${key}` : key;
    if (isObject(a[key]) && isObject(b[key])) out.push(...detailChanges(a[key], b[key], p));
    else if (!same(stable(a[key]), stable(b[key]))) out.push({ path: p, before: a[key] ?? null, after: b[key] ?? null });
  }
  return out;
}

const view = (it) => (it ? { summary: it.summary, details: it.details ?? null, evidence: evidenceOf(it), confidence: confidenceOf(it) } : null);

function index(list) {
  const map = new Map();
  for (const doc of list ?? []) for (const it of Array.isArray(doc?.items) ? doc.items : []) map.set(it.id, { ...it, module: doc.module });
  return map;
}

export function diffFacts(prevList, nextList) {
  const prev = index(prevList);
  const next = index(nextList);
  const items = [];
  for (const [id, b] of prev) {
    const a = next.get(id);
    if (!a) {
      items.push({ type: 'removed', id, module: b.module, kind: b.kind, before: view(b), after: null, fields: [], detailChanges: [], codeChanged: null });
      continue;
    }
    const fields = [];
    if (a.summary !== b.summary) fields.push('summary');
    const dc = detailChanges(b.details, a.details);
    if (dc.length) fields.push('details');
    if (!same(locations(a), locations(b))) fields.push('evidence');
    if (!same(snippets(a), snippets(b))) fields.push('code');
    if (confidenceOf(a) !== confidenceOf(b)) fields.push('confidence');
    if (!fields.length) continue;
    items.push({ type: 'changed', id, module: a.module, kind: a.kind, before: view(b), after: view(a), fields, detailChanges: dc, codeChanged: fields.includes('code') });
  }
  for (const [id, a] of next) {
    if (!prev.has(id)) items.push({ type: 'added', id, module: a.module, kind: a.kind, before: null, after: view(a), fields: [], detailChanges: [], codeChanged: null });
  }
  return items.sort((x, y) => x.module.localeCompare(y.module) || TYPE_ORDER[x.type] - TYPE_ORDER[y.type] || x.id.localeCompare(y.id));
}

// Which data lifecycle documents need rewriting: lifecycle JSON compared whole, by entity id.
export function diffLifecycles(prevList, nextList) {
  const byId = (list) => new Map((list ?? []).map((lc) => [lc.id, lc]));
  const prev = byId(prevList);
  const next = byId(nextList);
  return {
    added: [...next.keys()].filter((id) => !prev.has(id)).sort(),
    changed: [...next.keys()].filter((id) => prev.has(id) && !same(stable(prev.get(id)), stable(next.get(id)))).sort(),
    removed: [...prev.keys()].filter((id) => !next.has(id)).sort(),
  };
}

const stepsOf = (fl) => (Array.isArray(fl?.steps) ? fl.steps : []);
const policiesOf = (fl) => [...new Set(stepsOf(fl).flatMap((s) => (Array.isArray(s.policies) ? s.policies : [])))].sort();
const minus = (xs, ys) => xs.filter((x) => !ys.includes(x));

export function diffFlows(prevFlows, nextFlows, retraced = []) {
  const byId = (list) => new Map((list ?? []).map((f) => [f.id, f]));
  const prev = byId(prevFlows);
  const next = byId(nextFlows);
  return [...retraced].sort().map((id) => {
    const b = prev.get(id) ?? null;
    const a = next.get(id) ?? null;
    const actions = (fl) => stepsOf(fl).map((s) => s.action);
    const addedSteps = minus(actions(a), actions(b));
    const removedSteps = minus(actions(b), actions(a));
    const policies = { added: minus(policiesOf(a), policiesOf(b)), removed: minus(policiesOf(b), policiesOf(a)) };
    let status = 'unchanged';
    if (!b && a) status = 'added';
    else if (b && !a) status = 'removed';
    else if (addedSteps.length || removedSteps.length || policies.added.length || policies.removed.length || stepsOf(a).length !== stepsOf(b).length) status = 'changed';
    return { id, title: (a ?? b)?.title ?? id, status, stepsBefore: stepsOf(b).length, stepsAfter: stepsOf(a).length, addedSteps, removedSteps, policies };
  });
}

// Policy conflicts before and after an update, by CFL id (match-conflicts keeps ids). Only open conflicts
// are counted on the home card. A conflict on both sides is not new or resolved whatever its status:
// open -> unverified means its evidence needs checking (needsReview), unverified -> open is simply kept.
const CONFLICT_FIELDS = ['title', 'scenario', 'impact', 'severity', 'type'];
const allConflicts = (doc) => new Map((Array.isArray(doc?.conflicts) ? doc.conflicts : []).map((c) => [c.id, c]));
const isOpen = (c) => c?.status === 'open';
const conflictRef = (c) => ({ id: c.id, title: c.title, severity: c.severity });

export function diffConflicts(prevDoc, nextDoc) {
  const prev = allConflicts(prevDoc);
  const next = allConflicts(nextDoc);
  const byId = (a, b) => a.id.localeCompare(b.id);
  const added = [];
  const resolved = [];
  const changed = [];
  const kept = [];
  const needsReview = [];
  for (const [id, a] of next) {
    const b = prev.get(id);
    if (!isOpen(a)) {
      if (isOpen(b)) needsReview.push({ id, title: a.title });
      continue;
    }
    if (!b) {
      added.push(conflictRef(a));
      continue;
    }
    const fields = isOpen(b) ? CONFLICT_FIELDS.filter((f) => a[f] !== b[f]) : [];
    if (fields.length) changed.push({ id, title: a.title, fields });
    else kept.push(id);
  }
  for (const [id, b] of prev) if (isOpen(b) && !next.has(id)) resolved.push(conflictRef(b));
  return { added: added.sort(byId), resolved: resolved.sort(byId), changed: changed.sort(byId), kept: kept.sort(), needsReview: needsReview.sort(byId) };
}
