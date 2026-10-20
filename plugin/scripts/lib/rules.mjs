import fs from 'node:fs';
import path from 'node:path';
import { readJsonDir } from './jsondir.mjs';
import { validateConflicts, validateFacts, validateFlow } from './validate.mjs';
import { linkButtonsToFlows } from './player.mjs';

export const KIND_LABEL = {
  api: 'API', entity: '엔티티', state: '상태', 'state-transition': '상태 전이', validation: '검증',
  permission: '권한', constant: '상수', calculation: '계산', error: '오류', integration: '외부 연동',
};

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const uniq = (list) => [...new Set(list.filter(Boolean))];

// _data/conflicts.json (conflict-finder), or null when it is missing, unreadable or invalid: the report
// and the finder then show no conflict UI at all (older outputs have no such file).
export function readConflicts(outDir) {
  const file = path.join(outDir, '_data', 'conflicts.json');
  if (!fs.existsSync(file)) return null;
  const doc = readJson(file);
  const errors = doc ? validateConflicts(doc) : ['unreadable JSON'];
  if (errors.length) {
    console.error(`WARN skipped ${file}: ${errors.slice(0, 3).join('; ')}`);
    return null;
  }
  return doc;
}

// One record per facts item, joined with everything that points at it: the flows whose steps cite it,
// the screens/buttons and endpoints those flows start from, and the entity/table it is about.
// Built only from the verified JSON under _data, so every card keeps its file:line evidence.
export function buildRuleIndex(outDir) {
  const data = path.join(outDir, '_data');
  const moduleMap = readJson(path.join(data, 'module-map.json'));
  const moduleName = new Map((moduleMap?.modules ?? []).map((m) => [m.id, m.name]));
  const facts = readJsonDir(path.join(data, 'facts'), validateFacts);
  const flows = readJsonDir(path.join(data, 'flows'), validateFlow);
  const lifecycles = readJsonDir(path.join(data, 'lifecycles'));
  const screensDoc = readJson(path.join(data, 'screens.json'));
  // Only open conflicts: unverified ones are 확인 필요 in the report, never badges or finder hits.
  const conflicts = (readConflicts(outDir)?.conflicts ?? []).filter((c) => c.status === 'open');
  const conflictsOf = new Map();
  for (const c of conflicts) {
    for (const id of new Set(c.sides.flatMap((s) => s.ruleIds))) conflictsOf.set(id, [...(conflictsOf.get(id) ?? []), c.id]);
  }

  // Screen buttons by flow trigger, so a ui flow can name the button text and its server URL.
  const buttonOf = new Map();
  for (const sc of screensDoc?.screens ?? []) {
    for (const b of sc.buttons ?? []) buttonOf.set(`${sc.id}.${b.id}`, { screen: sc, button: b });
  }
  // Entity name (code or business) -> table, from lifecycles.
  const tableOf = new Map();
  for (const lc of lifecycles) {
    for (const key of [lc.name, lc.id, lc.title]) if (key && lc.table) tableOf.set(String(key).toLowerCase(), lc.table);
  }

  // Buttons that play each flow in the player (button flows, or API flows for the URL a button calls).
  const playable = screensDoc ? linkButtonsToFlows(structuredClone(screensDoc.screens ?? []), flows) : new Map();

  const flowRefs = new Map(); // fact id -> [{flow, steps:[n], calls:[]}]
  const ref = (id, flow) => {
    if (!flowRefs.has(id)) flowRefs.set(id, new Map());
    const m = flowRefs.get(id);
    if (!m.has(flow.id)) m.set(flow.id, { flow, steps: [], calls: [] });
    return m.get(flow.id);
  };
  for (const flow of flows) {
    if (flow.trigger?.factId) ref(flow.trigger.factId, flow);
    for (const step of flow.steps ?? []) {
      for (const id of step.policies ?? []) {
        const r = ref(id, flow);
        r.steps.push(step.n);
        if (step.call) r.calls.push(step.call);
      }
    }
  }

  const rules = [];
  for (const doc of facts) {
    for (const item of doc.items ?? []) {
      const d = item.details ?? {};
      const entity = d.entity || (item.kind === 'entity' ? d.name : null) || null;
      const api = d.path ? `${d.method ? d.method + ' ' : ''}${d.path}` : null;
      const refs = [...(flowRefs.get(item.id)?.values() ?? [])];
      const linked = refs.map(({ flow, steps, calls }) => {
        const t = flow.trigger ?? {};
        const play = playable.get(flow.id)?.[0];
        const key = t.kind === 'ui' && t.screen && t.component ? `${t.screen}.${t.component}` : play ? `${play.screen.id}.${play.button.id}` : null;
        const btn = key ? buttonOf.get(key) : null;
        return {
          id: flow.id, title: flow.title, kind: t.kind, label: t.label,
          screen: key, buttonText: btn?.button.text ?? null, url: btn?.button.call?.url ?? null,
          steps: uniq(steps).sort((a, b) => a - b), calls: uniq(calls),
        };
      });
      const table = d.table || (entity ? tableOf.get(String(entity).toLowerCase()) : null) || null;
      // APIs name the entities they read/write; those count as "about" the entity too.
      const entities = uniq([entity, ...(d.reads ?? []), ...(d.writes ?? [])]);
      const tables = uniq([table, ...entities.map((e) => tableOf.get(String(e).toLowerCase()))]);
      rules.push({
        id: item.id,
        module: doc.module,
        moduleName: moduleName.get(doc.module) ?? doc.module,
        kind: item.kind,
        kindLabel: KIND_LABEL[item.kind] ?? item.kind,
        summary: item.summary,
        confidence: item.confidence,
        evidence: (item.evidence ?? []).map((e) => ({ file: e.file, line: e.line, snippet: e.snippet ?? '' })),
        entity,
        table,
        entities,
        tables,
        api,
        transition: item.kind === 'state-transition' && d.from ? { from: d.from, to: d.to, trigger: d.trigger ?? null } : null,
        flows: linked,
        endpoints: uniq([api?.split(' ').pop(), ...linked.map((f) => f.url), ...linked.filter((f) => f.kind === 'api').map((f) => f.label?.split(' ').pop())]),
        screens: uniq(linked.map((f) => f.screen)),
        calls: uniq(linked.flatMap((f) => f.calls)),
        conflicts: conflictsOf.get(item.id) ?? [],
      });
    }
  }
  rules.sort((a, b) => a.id.localeCompare(b.id));
  return { generatedAt: new Date().toISOString(), rules, conflicts };
}

// "OrderService.java:33" / "src/x/OrderService.java" -> { file, line }
export function parseFileRef(text) {
  const m = /^(.+?\.[A-Za-z0-9]+)(?::(\d+))?$/.exec(String(text).trim());
  return m ? { file: m[1].replace(/\\/g, '/'), line: m[2] ? Number(m[2]) : null } : null;
}

export const fileMatches = (evFile, want) => {
  const a = evFile.toLowerCase();
  const b = want.toLowerCase().replace(/^\.?\//, '');
  return a === b || a.endsWith('/' + b);
};

// How close a rule's evidence is to a file (and line). 0 = no match; higher = closer.
export function fileScore(rule, file, line = null, window = 3) {
  let best = 0;
  for (const ev of rule.evidence) {
    if (!fileMatches(ev.file, file)) continue;
    if (line == null) { best = Math.max(best, 1); continue; }
    const d = Math.abs(ev.line - line);
    if (d === 0) best = Math.max(best, 3);
    else if (d <= window) best = Math.max(best, 2);
  }
  return best;
}

// Whether a conflict cites the file (and line, within `window`) on any side.
export function conflictHits(conflict, file, line = null, window = 3) {
  return conflict.sides.some((s) => s.evidence.some((ev) => fileMatches(ev.file, file) && (line == null || Math.abs(ev.line - line) <= window)));
}

export function haystack(rule) {
  return [
    rule.id, rule.module, rule.moduleName, rule.kind, rule.kindLabel, rule.summary, ...rule.entities, ...rule.tables, rule.api,
    rule.transition && `${rule.transition.from} ${rule.transition.to} ${rule.transition.trigger ?? ''}`,
    ...rule.evidence.map((e) => `${e.file} ${e.snippet}`),
    ...rule.flows.map((f) => `${f.title} ${f.label ?? ''} ${f.screen ?? ''} ${f.buttonText ?? ''}`),
    ...rule.endpoints, ...rule.screens, ...rule.calls,
  ].filter(Boolean).join('\n').toLowerCase();
}

// Filters: file ("Foo.java" or "Foo.java:33"), entity, screen ("OrderMng" or "OrderMng.btn_cancel"),
// endpoint ("/order/cancel.do"), module, kind, id, text (all words must appear). All given filters must match.
// Results are sorted by file closeness when a file is given, then by id.
export function queryRules(index, q = {}) {
  const fref = q.file ? parseFileRef(q.file) ?? { file: q.file, line: null } : null;
  const line = q.line != null ? Number(q.line) : fref?.line ?? null;
  const words = String(q.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const lc = (s) => String(s ?? '').toLowerCase();
  const out = [];
  for (const rule of index.rules) {
    if (q.id && lc(rule.id) !== lc(q.id)) continue;
    if (q.module && lc(rule.module) !== lc(q.module)) continue;
    if (q.kind && lc(rule.kind) !== lc(q.kind)) continue;
    if (q.entity && ![...rule.entities, ...rule.tables].some((v) => lc(v) === lc(q.entity))) continue;
    if (q.screen && !rule.screens.some((s) => lc(s) === lc(q.screen) || lc(s).startsWith(lc(q.screen) + '.'))) continue;
    if (q.endpoint && !rule.endpoints.some((e) => lc(e) === lc(q.endpoint))) continue;
    let score = 0;
    if (fref) {
      score = fileScore(rule, fref.file, line);
      if (!score) continue;
    }
    if (words.length) {
      const hay = haystack(rule);
      if (!words.every((w) => hay.includes(w))) continue;
    }
    out.push({ rule, score });
  }
  out.sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id));
  const rules = out.map((r) => r.rule);
  // Conflicts cited at the file/line asked about, as an extra property: the list (and its JSON) stays as it was.
  rules.conflicts = fref ? (index.conflicts ?? []).filter((c) => conflictHits(c, fref.file, line)) : [];
  return rules;
}

const CONF = { high: '●●● 코드에 명시', medium: '●●○ 추론', low: '●○○ 확인 필요' };

export function renderRulesMarkdown(rules, { title = '관련 규칙' } = {}) {
  if (!rules.length) return `## ${title}\n\n해당하는 규칙이 없습니다.\n`;
  const out = [`## ${title} (${rules.length}건)`, ''];
  for (const r of rules) {
    out.push(`### ${r.id} ${r.summary}`);
    out.push(`- 모듈: ${r.moduleName} · 종류: ${r.kindLabel} · 신뢰도: ${CONF[r.confidence] ?? r.confidence}`);
    if (r.entity || r.table) out.push(`- 데이터: ${[r.entity, r.table].filter(Boolean).join(' / ')}`);
    if (r.transition) out.push(`- 상태 변화: ${r.transition.from} → ${r.transition.to}${r.transition.trigger ? ` (${r.transition.trigger})` : ''}`);
    out.push('- 근거:');
    for (const e of r.evidence) out.push(`  - \`${e.file}:${e.line}\` — \`${e.snippet.replace(/`/g, "'")}\``);
    if (r.flows.length) {
      out.push('- 이 규칙이 적용되는 흐름:');
      for (const f of r.flows) {
        const start = f.screen ? `${f.screen}${f.buttonText ? ` "${f.buttonText}"` : ''}` : f.label;
        out.push(`  - ${f.title} (${start})${f.steps.length ? ` · 단계 ${f.steps.join(', ')}` : ''}`);
      }
    }
    out.push('');
  }
  return out.join('\n');
}
