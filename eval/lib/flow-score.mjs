export const normLabel = (s) => String(s).trim().replace(/\s+/g, ' ').toUpperCase();

export function scoreFlow(expected, flow, tolerance = 2) {
  const evidence = flow.steps.flatMap((s) => s.evidence ?? []);
  const missed = expected
    .filter((exp) => !evidence.some((ev) => ev.file === exp.file && Math.abs(ev.line - exp.line) <= tolerance))
    .map((exp) => exp.id);
  const found = expected.length - missed.length;
  return { expected: expected.length, found, recall: expected.length ? Math.round((found / expected.length) * 100) / 100 : 0, missed };
}

export function findFlowForTrigger(expectedTrigger, flows) {
  const want = normLabel(expectedTrigger);
  return flows.find((f) => {
    const t = f.trigger ?? {};
    if (normLabel(t.label ?? '') === want) return true;
    return t.screen && t.component && normLabel(`${t.screen}.${t.component}`) === want;
  });
}
