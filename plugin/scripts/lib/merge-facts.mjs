// 큰 모듈은 조각마다 따로 분석한다. 조각별 facts를 모듈 facts 하나로 합친다.
// 조각 경계에 걸친 같은 API·엔티티·규칙은 하나로 합치고, 번호는 처음부터 다시 매긴다
// (이전 번호는 match-facts가 근거 위치로 되돌린다).

const CONFIDENCE = { high: 3, medium: 2, low: 1 };
const lower = (v) => String(v ?? '').toLowerCase();

function mergeKey(it) {
  const d = it.details ?? {};
  switch (it.kind) {
    case 'api':
      return d.method && d.path ? `api|${lower(d.method)}|${lower(d.path)}` : null;
    case 'entity':
      return d.name ? `entity|${d.name}` : null;
    case 'state':
      return d.entity ? `state|${d.entity}` : null;
    case 'state-transition':
      return d.entity && d.from != null && d.to != null ? `transition|${d.entity}|${d.from}|${d.to}` : null;
    default:
      return null;
  }
}

const evidenceKey = (e) => `${e.file}:${e.line}`;

function union(a, b, keyOf) {
  const seen = new Set(a.map(keyOf));
  return [...a, ...b.filter((x) => !seen.has(keyOf(x)))];
}

function mergeDetails(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (out[k] === undefined) out[k] = v;
    else if (Array.isArray(out[k]) && Array.isArray(v)) out[k] = union(out[k], v, (x) => JSON.stringify(x));
  }
  return out;
}

function absorb(into, it) {
  into.evidence = union(into.evidence, it.evidence, evidenceKey);
  into.details = mergeDetails(into.details, it.details);
  if (CONFIDENCE[it.confidence] > CONFIDENCE[into.confidence]) into.confidence = it.confidence;
}

export function mergeFactsParts(parts, { module, abbrev, modulePaths, generatedAt = new Date().toISOString() }) {
  const merged = [];
  const byKey = new Map();
  const byEvidence = new Map();
  let duplicates = 0;
  for (const part of parts) {
    for (const raw of part.items) {
      const it = structuredClone(raw);
      const key = mergeKey(it);
      let target = key ? byKey.get(key) : undefined;
      // 규칙류(검증·상수·계산 ...)는 같은 종류가 같은 근거 줄을 인용하면 같은 규칙이다.
      if (!target && !key) target = it.evidence.map((e) => byEvidence.get(`${it.kind}|${evidenceKey(e)}`)).find(Boolean);
      if (target) {
        absorb(target, it);
        duplicates++;
      } else {
        merged.push(it);
        if (key) byKey.set(key, it);
      }
      const owner = target ?? it;
      for (const e of it.evidence) byEvidence.set(`${it.kind}|${evidenceKey(e)}`, owner);
    }
  }
  merged.forEach((it, i) => {
    it.id = `${abbrev}-${String(i + 1).padStart(3, '0')}`;
  });
  return { facts: { module, generatedAt, modulePaths, items: merged }, duplicates };
}
