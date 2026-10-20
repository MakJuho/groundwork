const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function kebab(s) {
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

// Model-written details may carry the wrong types; read them defensively so one bad item never aborts a run.
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' ? [v] : []);
const str = (v) => (typeof v === 'string' && v ? v : null);

const apiLabel = (it) => `${String(it.details?.method ?? '').toUpperCase()} ${it.details?.path ?? ''}`.trim();

export function pickFlows(factsList, { max = 3, exclude = [] } = {}) {
  const candidates = [];
  for (const facts of factsList) {
    const items = Array.isArray(facts?.items) ? facts.items : [];
    const hasTransition = items.some((it) => it.kind === 'state-transition');
    for (const it of items) {
      const writes = arr(it.details?.writes);
      if (it.kind !== 'api' || !WRITE_METHODS.has(String(it.details?.method ?? '').toUpperCase()) || writes.length === 0) continue;
      const id = String(it.id).toLowerCase();
      if (exclude.includes(id)) continue;
      const score = writes.length + (hasTransition ? 1 : 0) + (it.confidence === 'high' ? 1 : 0);
      candidates.push({ id, module: facts.module, factId: it.id, label: apiLabel(it), score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.factId.localeCompare(b.factId));
  const picked = [];
  const usedModules = new Set();
  for (const c of candidates) {
    if (picked.length < max && !usedModules.has(c.module)) {
      picked.push(c);
      usedModules.add(c.module);
    }
  }
  for (const c of candidates) if (picked.length < max && !picked.includes(c)) picked.push(c);
  return picked.map(({ score, ...rest }) => rest);
}

const norm = (s) => String(s ?? '').split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

export function buildLifecycles(factsList, flows = []) {
  const all = factsList.flatMap((f) => (Array.isArray(f?.items) ? f.items : []).map((it) => ({ ...it, module: f.module })));
  // The same entity is often declared by common (shared schema) and by its own module; one lifecycle per id, owned by the business module.
  const groups = new Map();
  for (const it of all.filter((it) => it.kind === 'entity' && str(it.details?.name))) {
    const id = kebab(it.details.name);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(it);
  }
  return [...groups.entries()]
    .map(([id, copies]) => {
      const ent = copies.find((c) => c.module !== 'common') ?? copies[0];
      const keys = new Set(copies.flatMap((c) => [norm(c.details.name), norm(str(c.details.table))]).filter(Boolean));
      const hit = (names) => arr(names).some((n) => keys.has(norm(n)));
      const ref = (it) => ({ factId: it.id, module: it.module, label: it.details?.method ? apiLabel(it) : it.summary, summary: it.summary });
      const transitions = all
        .filter((it) => it.kind === 'state-transition' && hit(it.details?.entity))
        .map((it) => ({ factId: it.id, from: it.details?.from ?? null, to: it.details?.to ?? null, trigger: it.details?.trigger ?? null }));
      const writers = all.filter((it) => it.kind === 'api' && hit(it.details?.writes)).map(ref);
      return {
        id,
        name: ent.details.name,
        title: str(ent.details.title) ?? ent.details.name,
        table: str(ent.details.table) ?? copies.map((c) => str(c.details.table)).find(Boolean) ?? null,
        module: ent.module,
        modules: [...new Set(copies.map((c) => c.module))],
        entityFact: ent.id,
        entityFacts: copies.map((c) => c.id),
        states: all.filter((it) => it.kind === 'state' && hit(it.details?.entity)).map((it) => it.id),
        transitions,
        writers,
        readers: all.filter((it) => it.kind === 'api' && hit(it.details?.reads)).map(ref),
        flows: flows.filter((fl) => (Array.isArray(fl?.steps) ? fl.steps : []).some((s) => hit(s.data?.writes) || hit(s.data?.reads))).map((fl) => fl.id),
        documented: writers.length > 0 || transitions.length > 0,
      };
    });
}
