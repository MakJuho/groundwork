const cites = (conflict, side, tolerance) =>
  (conflict.sides ?? []).some((s) => (s.evidence ?? []).some((ev) => ev.file === side.file && Math.abs(ev.line - side.line) <= tolerance));

// An expected conflict is found when one open conflict cites at least two different expected side files,
// each within `tolerance` lines. Each actual conflict is credited to at most one expected conflict.
export function scoreConflicts(expected, actual, tolerance = 3) {
  const open = (actual ?? []).filter((c) => c.status === 'open');
  const used = new Set();
  const hits = [];
  const missed = [];
  for (const exp of expected) {
    const hit = open.find((c) => {
      if (used.has(c)) return false;
      const files = new Set(exp.sides.filter((side) => cites(c, side, tolerance)).map((side) => side.file));
      return files.size >= 2;
    });
    if (hit) {
      used.add(hit);
      hits.push({ id: exp.id, cfl: hit.id });
    } else missed.push(exp.id);
  }
  // No expected conflicts: nothing to miss, the run only measures false positives.
  const recall = expected.length ? Math.round((hits.length / expected.length) * 1000) / 1000 : 1;
  return { recall, hits, missed, extra: open.filter((c) => !used.has(c)).map((c) => ({ id: c.id, title: c.title })) };
}
