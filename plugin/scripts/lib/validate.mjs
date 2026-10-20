export const FACT_KINDS = ['api', 'entity', 'state', 'state-transition', 'validation', 'permission', 'constant', 'calculation', 'error', 'integration'];
export const CONFIDENCE = ['high', 'medium', 'low'];
export const MODULE_BASIS = ['manual', 'build-module', 'folder', 'name-prefix', 'url-prefix', 'mixed'];

const MODULE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ABBREV = /^[A-Z]{2,4}$/;
const ITEM_ID = /^[A-Z]{2,4}-\d{3}$/;
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isStrArr = (v) => Array.isArray(v) && v.every(isStr);

function checkEvidence(at, evidence, e) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    e.push(`${at}.evidence: non-empty array required`);
    return;
  }
  evidence.forEach((ev, j) => {
    const file = ev?.file;
    if (!isStr(file) || file.startsWith('/') || /^[A-Za-z]:/.test(file) || file.includes('\\')) {
      e.push(`${at}.evidence[${j}].file: relative posix path required`);
    }
    if (!Number.isInteger(ev?.line) || ev.line < 1) e.push(`${at}.evidence[${j}].line: integer >= 1 required`);
    if (typeof ev?.snippet !== 'string') e.push(`${at}.evidence[${j}].snippet: string required`);
  });
}

// Written only by verify-citations: originalConfidence is the confidence a failed citation replaced.
function checkVerifyFields(at, entry, e) {
  if (entry?.verifyFailed !== undefined && typeof entry.verifyFailed !== 'boolean') e.push(`${at}.verifyFailed: boolean required`);
  if (entry?.originalConfidence !== undefined && !CONFIDENCE.includes(entry.originalConfidence)) e.push(`${at}.originalConfidence: one of high|medium|low required`);
}

export function validateModuleMap(m) {
  if (!m || typeof m !== 'object') return ['root: object required'];
  const e = [];
  const p = m.project;
  if (!p || typeof p !== 'object') {
    e.push('project: object required');
  } else {
    for (const k of ['name', 'root', 'summary']) if (!isStr(p[k])) e.push(`project.${k}: non-empty string required`);
    if (!isStrArr(p.stacks) || p.stacks.length === 0) e.push('project.stacks: non-empty string array required');
  }
  if (!Array.isArray(m.modules) || m.modules.length === 0) {
    e.push('modules: non-empty array required');
    return e;
  }
  const ids = new Set();
  const abbrevs = new Set();
  m.modules.forEach((mod, i) => {
    const at = `modules[${i}]`;
    if (!MODULE_ID.test(mod?.id ?? '')) e.push(`${at}.id: kebab-case ascii required`);
    else if (ids.has(mod.id)) e.push(`${at}.id: duplicate "${mod.id}"`);
    else ids.add(mod.id);
    if (!ABBREV.test(mod?.abbrev ?? '')) e.push(`${at}.abbrev: 2-4 uppercase letters required`);
    else if (abbrevs.has(mod.abbrev)) e.push(`${at}.abbrev: duplicate "${mod.abbrev}"`);
    else abbrevs.add(mod.abbrev);
    for (const k of ['name', 'codeName', 'summary']) if (!isStr(mod?.[k])) e.push(`${at}.${k}: non-empty string required`);
    if (!isStrArr(mod?.paths) || mod.paths.length === 0) e.push(`${at}.paths: non-empty string array required`);
    if (!Number.isInteger(mod?.fileCount) || mod.fileCount < 0) e.push(`${at}.fileCount: non-negative integer required`);
    if (!isStrArr(mod?.dependsOn ?? null)) e.push(`${at}.dependsOn: string array required`);
    if (mod?.basis !== undefined && !MODULE_BASIS.includes(mod.basis)) e.push(`${at}.basis: one of ${MODULE_BASIS.join('|')} required`);
  });
  m.modules.forEach((mod, i) => {
    for (const d of Array.isArray(mod?.dependsOn) ? mod.dependsOn : []) {
      if (typeof d === 'string' && !ids.has(d)) e.push(`modules[${i}].dependsOn: unknown module "${d}"`);
    }
  });
  return e;
}

export function validateFacts(f) {
  if (!f || typeof f !== 'object') return ['root: object required'];
  const e = [];
  if (!MODULE_ID.test(f.module ?? '')) e.push('module: kebab-case module id required');
  if (f.modulePaths !== undefined && !isStrArr(f.modulePaths)) e.push('modulePaths: string array required');
  if (!Array.isArray(f.items)) {
    e.push('items: array required');
    return e;
  }
  const ids = new Set();
  f.items.forEach((it, i) => {
    const at = `items[${i}]`;
    if (!ITEM_ID.test(it?.id ?? '')) e.push(`${at}.id: format ABC-001 required`);
    else if (ids.has(it.id)) e.push(`${at}.id: duplicate "${it.id}"`);
    else ids.add(it.id);
    if (!FACT_KINDS.includes(it?.kind)) e.push(`${at}.kind: one of ${FACT_KINDS.join('|')} required`);
    if (!isStr(it?.summary)) e.push(`${at}.summary: non-empty string required`);
    if (!CONFIDENCE.includes(it?.confidence)) e.push(`${at}.confidence: one of high|medium|low required`);
    checkEvidence(at, it?.evidence, e);
    checkDetails(at, it?.details, e);
    checkVerifyFields(at, it, e);
  });
  return e;
}

// Only the details fields that pick-flows and build-lifecycles read are checked.
function checkDetails(at, d, e) {
  if (d === undefined) return;
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    e.push(`${at}.details: object required`);
    return;
  }
  for (const k of ['reads', 'writes']) if (d[k] !== undefined && !isStrArr(d[k])) e.push(`${at}.details.${k}: string array required`);
  for (const k of ['name', 'title', 'table', 'entity']) if (d[k] !== undefined && typeof d[k] !== 'string') e.push(`${at}.details.${k}: string required`);
}

export const FLOW_TRIGGER_KINDS = ['api', 'batch', 'event', 'ui', 'message'];
export const ACTOR_KINDS = ['client', 'component', 'db', 'external', 'batch'];

export const FLOW_LAYERS = ['screen', 'common', 'controller', 'service', 'mapper', 'db', 'external', 'other'];

export function validateFlow(f) {
  if (!f || typeof f !== 'object') return ['root: object required'];
  const e = [];
  if (!MODULE_ID.test(f.id ?? '')) e.push('id: kebab-case ascii required');
  for (const k of ['title', 'outcome']) if (!isStr(f[k])) e.push(`${k}: non-empty string required`);
  const t = f.trigger;
  if (!t || typeof t !== 'object') {
    e.push('trigger: object required');
  } else {
    if (!FLOW_TRIGGER_KINDS.includes(t.kind)) e.push(`trigger.kind: one of ${FLOW_TRIGGER_KINDS.join('|')} required`);
    if (!isStr(t.label)) e.push('trigger.label: non-empty string required');
    if (t.factId !== undefined && !ITEM_ID.test(t.factId)) e.push('trigger.factId: format ABC-001 required');
    for (const k of ['screen', 'component']) if (t[k] !== undefined && !isStr(t[k])) e.push(`trigger.${k}: non-empty string required`);
  }
  const actorIds = new Set();
  if (!Array.isArray(f.actors) || f.actors.length === 0) {
    e.push('actors: non-empty array required');
  } else {
    f.actors.forEach((a, i) => {
      if (!MODULE_ID.test(a?.id ?? '')) e.push(`actors[${i}].id: kebab-case ascii required`);
      else if (actorIds.has(a.id)) e.push(`actors[${i}].id: duplicate "${a.id}"`);
      else actorIds.add(a.id);
      if (!ACTOR_KINDS.includes(a?.kind)) e.push(`actors[${i}].kind: one of ${ACTOR_KINDS.join('|')} required`);
      if (!isStr(a?.name)) e.push(`actors[${i}].name: non-empty string required`);
      if (a?.layer !== undefined && !FLOW_LAYERS.includes(a.layer)) e.push(`actors[${i}].layer: one of ${FLOW_LAYERS.join('|')} required`);
    });
  }
  if (!Array.isArray(f.steps) || f.steps.length === 0) {
    e.push('steps: non-empty array required');
    return e;
  }
  f.steps.forEach((s, i) => {
    const at = `steps[${i}]`;
    if (s?.n !== i + 1) e.push(`${at}.n: must be ${i + 1}`);
    for (const k of ['from', 'to']) if (!actorIds.has(s?.[k])) e.push(`${at}.${k}: unknown actor "${s?.[k]}"`);
    if (!isStr(s?.action)) e.push(`${at}.action: non-empty string required`);
    if (!CONFIDENCE.includes(s?.confidence)) e.push(`${at}.confidence: one of high|medium|low required`);
    if (s?.policies !== undefined && !(Array.isArray(s.policies) && s.policies.every((p) => ITEM_ID.test(p)))) {
      e.push(`${at}.policies: array of ABC-001 ids required`);
    }
    if (s?.data !== undefined) {
      if (!s.data || typeof s.data !== 'object') e.push(`${at}.data: object required`);
      else for (const k of ['reads', 'writes']) if (s.data[k] !== undefined && !isStrArr(s.data[k])) e.push(`${at}.data.${k}: string array required`);
    }
    if (s?.branch !== undefined && !(isStr(s.branch?.condition) && isStr(s.branch?.result))) {
      e.push(`${at}.branch: condition and result required`);
    }
    if (s?.payload !== undefined) {
      const pl = s.payload;
      if (!pl || typeof pl !== 'object' || Array.isArray(pl)) e.push(`${at}.payload: object required`);
      else {
        if (!isStr(pl.name)) e.push(`${at}.payload.name: non-empty string required`);
        if (pl.fields !== undefined && !isStrArr(pl.fields)) e.push(`${at}.payload.fields: string array required`);
        if (pl.example !== undefined && typeof pl.example !== 'string') e.push(`${at}.payload.example: string required`);
      }
    }
    if (s?.branchOf !== undefined) {
      const b = s.branchOf;
      if (!Number.isInteger(b) || b < 1 || b >= i + 1) e.push(`${at}.branchOf: integer >= 1 and less than ${i + 1} required`);
      else if (f.steps[b - 1]?.branch === undefined) e.push(`${at}.branchOf: step ${b} has no branch`);
    }
    checkEvidence(at, s?.evidence, e);
    checkVerifyFields(at, s, e);
  });
  return e;
}

export const CONFLICT_TYPES = ['screen-server', 'value-mismatch', 'cross-module-timing', 'calculation-mismatch'];
export const SEVERITY = ['high', 'medium', 'low'];
const CONFLICT_ID = /^CFL-\d{3}$/;

// Policy conflicts between rules (conflict-finder). Low confidence is never stored; status is set by verify.
export function validateConflicts(doc) {
  if (!doc || typeof doc !== 'object') return ['root: object required'];
  if (!Array.isArray(doc.conflicts)) return ['conflicts: array required'];
  const e = [];
  const ids = new Set();
  doc.conflicts.forEach((c, i) => {
    const at = `conflicts[${i}]`;
    if (!CONFLICT_ID.test(c?.id ?? '')) e.push(`${at}.id: format CFL-001 required`);
    else if (ids.has(c.id)) e.push(`${at}.id: duplicate "${c.id}"`);
    else ids.add(c.id);
    for (const k of ['title', 'scenario', 'impact', 'firstSeen']) if (!isStr(c?.[k])) e.push(`${at}.${k}: non-empty string required`);
    if (!CONFLICT_TYPES.includes(c?.type)) e.push(`${at}.type: one of ${CONFLICT_TYPES.join('|')} required`);
    if (!SEVERITY.includes(c?.severity)) e.push(`${at}.severity: one of ${SEVERITY.join('|')} required`);
    if (!['high', 'medium'].includes(c?.confidence)) e.push(`${at}.confidence: one of high|medium required`);
    if (!['open', 'unverified'].includes(c?.status)) e.push(`${at}.status: one of open|unverified required`);
    if (c?.verifyFailed !== undefined && typeof c.verifyFailed !== 'boolean') e.push(`${at}.verifyFailed: boolean required`);
    if (!Array.isArray(c?.sides) || c.sides.length < 2) {
      e.push(`${at}.sides: 2 or more required`);
      return;
    }
    c.sides.forEach((s, j) => {
      const sat = `${at}.sides[${j}]`;
      if (!isStr(s?.label)) e.push(`${sat}.label: non-empty string required`);
      if (!Array.isArray(s?.ruleIds) || !s.ruleIds.every((id) => ITEM_ID.test(id ?? ''))) e.push(`${sat}.ruleIds: array of ABC-001 ids required`);
      checkEvidence(sat, s?.evidence, e);
    });
  });
  return e;
}
