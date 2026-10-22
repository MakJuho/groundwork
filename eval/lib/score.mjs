export const STRUCTURAL_KINDS = new Set(['api', 'entity']);

export function anchorLine(text, anchor) {
  const idx = text.indexOf(anchor);
  return idx < 0 ? -1 : text.slice(0, idx).split('\n').length;
}

const ratio = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 1000 : 0);

export function score(expected, items, tolerance = 2) {
  const matches = (exp, item) =>
    item.evidence.some((ev) => exp.locations.some((loc) => loc.file === ev.file && Math.abs(loc.line - ev.line) <= tolerance));
  const found = expected.filter((exp) => items.some((item) => matches(exp, item)));
  const policyItems = items.filter((item) => !STRUCTURAL_KINDS.has(item.kind));
  const correct = policyItems.filter((item) => expected.some((exp) => matches(exp, item)));
  return {
    expected: expected.length,
    found: found.length,
    recall: ratio(found.length, expected.length),
    facts: policyItems.length,
    correct: correct.length,
    precision: ratio(correct.length, policyItems.length),
    missed: expected.filter((exp) => !found.includes(exp)).map((exp) => exp.id),
  };
}
