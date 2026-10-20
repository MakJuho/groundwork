// Inputs for the conflict-finder agent: a one-line-per-rule digest with the layers each rule's evidence
// lives in, and cheap candidate signals (cross-layer rules, numbers shared across modules, one entity's
// state rules spread over modules). The agent judges the candidates by re-reading the code.

const SCREEN_EXT = new Set(['.xfdl', '.xjs', '.vue', '.jsx', '.tsx', '.html']);
const CODE_EXT = new Set(['.java', '.kt', '.py', '.js', '.ts', '.mjs']);

const extOf = (p) => {
  const m = /\.[^./]+$/.exec(p);
  return m ? m[0].toLowerCase() : '';
};

export function layerOf(file, text = '') {
  const p = '/' + String(file).replace(/\\/g, '/');
  const base = p.slice(p.lastIndexOf('/') + 1);
  const ext = extOf(base);
  if (/^application.*\.(ya?ml|properties)$/i.test(base) || p.includes('/sql/data/')) return 'config';
  if (ext === '.sql' || (ext === '.xml' && p.includes('/mapper/'))) return 'db';
  if (SCREEN_EXT.has(ext)) return 'screen';
  if (CODE_EXT.has(ext)) return String(text ?? '').includes('@Scheduled') ? 'batch' : 'server';
  return 'other';
}

const NUMBER_UNIT = /(\d[\d,]*(?:\.\d+)?)\s*(영업일|일|%|원|개월|시간|P|포인트)/g;
const MAX_SHARED = 6; // a value used by more rules than this is noise (e.g. "1일", "100%")
const ENTITY_KINDS = new Set(['state', 'state-transition', 'validation']);
const SIGNAL_ORDER = { 'cross-layer': 0, 'shared-number': 1, 'same-entity': 2 };

const uniq = (list) => [...new Set(list)];

export function numbersIn(summary) {
  return uniq([...String(summary ?? '').matchAll(NUMBER_UNIT)].map((m) => `${m[1].replace(/,/g, '')}${m[2]}`));
}

const isServerSide = (l) => l === 'server' || l === 'batch';

export function buildRuleDigest({ facts, moduleMap = null, readText = () => '' }) {
  void moduleMap; // reserved: module names are not needed in the digest yet
  const layerCache = new Map();
  const layer = (file) => {
    if (!layerCache.has(file)) {
      let text = '';
      if (CODE_EXT.has(extOf(file))) {
        try { text = readText(file) ?? ''; } catch { text = ''; }
      }
      layerCache.set(file, layerOf(file, text));
    }
    return layerCache.get(file);
  };

  const rules = [];
  for (const doc of facts ?? []) {
    for (const it of doc.items ?? []) {
      if (it.verifyFailed) continue;
      const files = uniq((it.evidence ?? []).map((e) => e.file).filter(Boolean));
      const rule = {
        id: it.id, module: doc.module, kind: it.kind, summary: it.summary, confidence: it.confidence,
        files, layers: uniq(files.map(layer)).sort(),
      };
      if (it.details?.entity) rule.entity = it.details.entity;
      rules.push(rule);
    }
  }
  rules.sort((a, b) => a.id.localeCompare(b.id));

  const signals = [];
  const add = (type, ids, reason) => signals.push({ type, ruleIds: uniq(ids).sort(), reason });
  const nums = new Map(rules.map((r) => [r.id, numbersIn(r.summary)]));

  // cross-layer (a): one rule cited from the screen (or config) and from server/batch code.
  for (const r of rules) {
    const server = r.layers.some(isServerSide);
    if (server && r.layers.includes('screen')) add('cross-layer', [r.id], `${r.id} 근거가 화면과 서버에 함께 있음`);
    else if (server && r.layers.includes('config')) add('cross-layer', [r.id], `${r.id} 근거가 설정값과 서버에 함께 있음`);
  }
  // cross-layer (b): a screen-only and a server-only rule of one module stating the same number.
  const screenOnly = rules.filter((r) => r.layers.length && r.layers.every((l) => l === 'screen'));
  const serverOnly = rules.filter((r) => r.layers.length && r.layers.every(isServerSide));
  for (const s of screenOnly) {
    for (const v of serverOnly) {
      if (s.module !== v.module) continue;
      const shared = nums.get(s.id).filter((n) => nums.get(v.id).includes(n));
      if (shared.length) add('cross-layer', [s.id, v.id], `같은 모듈의 화면 규칙 ${s.id}와 서버 규칙 ${v.id}가 ${shared[0]}을 함께 말함`);
    }
  }

  // shared-number: one number+unit stated by rules of different modules.
  const byNumber = new Map();
  for (const r of rules) {
    for (const n of nums.get(r.id)) {
      if (!byNumber.has(n)) byNumber.set(n, []);
      byNumber.get(n).push(r);
    }
  }
  for (const [n, group] of byNumber) {
    if (group.length > MAX_SHARED) continue;
    const modules = uniq(group.map((r) => r.module));
    if (modules.length < 2) continue;
    add('shared-number', group.map((r) => r.id), `${n}이 여러 모듈(${modules.join(', ')})의 규칙에 나옴`);
  }

  // same-entity: state/validation rules about one entity living in several modules.
  const byEntity = new Map();
  for (const r of rules) {
    if (!ENTITY_KINDS.has(r.kind) || !r.entity) continue;
    const key = String(r.entity).toLowerCase();
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key).push(r);
  }
  for (const group of byEntity.values()) {
    const modules = uniq(group.map((r) => r.module));
    if (modules.length < 2) continue;
    add('same-entity', group.map((r) => r.id), `${group[0].entity}의 상태·검증 규칙이 여러 모듈(${modules.join(', ')})에 있음`);
  }

  signals.sort((a, b) => SIGNAL_ORDER[a.type] - SIGNAL_ORDER[b.type] || a.ruleIds.join().localeCompare(b.ruleIds.join()));
  return { rules, signals };
}
