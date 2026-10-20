import fs from 'node:fs';
import path from 'node:path';

const STOP = new Set([
  'if', 'else', 'return', 'const', 'let', 'var', 'new', 'this', 'true', 'false', 'null', 'public', 'private',
  'protected', 'static', 'final', 'void', 'int', 'function', 'def', 'class', 'import', 'from', 'throw', 'throws',
  'for', 'while', 'await', 'async',
]);

export function snippetTokens(snippet) {
  const tokens = snippet.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(tokens.filter((t) => (t.length >= 2 || /\d/.test(t)) && !STOP.has(t)))];
}

export function verifyEvidence(root, ev, cache = new Map()) {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, ev.file);
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) return { ok: false, reason: 'outside-root' };
  let lines = cache.get(abs);
  if (!lines) {
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { ok: false, reason: 'file-not-found' };
    lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    cache.set(abs, lines);
  }
  if (ev.line > lines.length) return { ok: false, reason: 'line-out-of-range' };
  const tokens = snippetTokens(ev.snippet ?? '');
  if (tokens.length === 0) return { ok: true };
  const window = lines.slice(Math.max(0, ev.line - 4), ev.line + 3).join('\n');
  const hits = tokens.filter((t) => window.includes(t)).length;
  return hits >= Math.min(2, tokens.length) ? { ok: true } : { ok: false, reason: 'snippet-mismatch' };
}

function verifyEntries(root, entries, keyOf) {
  const cache = new Map();
  const failed = [];
  const out = entries.map((entry) => {
    const bad = entry.evidence
      .map((ev) => ({ ev, result: verifyEvidence(root, ev, cache) }))
      .filter(({ result }) => !result.ok);
    // A downgrade keeps the confidence it replaced, so a later passing run (e.g. after project.root is
    // fixed) can restore it instead of leaving the item low forever.
    if (bad.length === 0) {
      const { verifyFailed, originalConfidence, ...rest } = entry;
      return verifyFailed && originalConfidence ? { ...rest, confidence: originalConfidence } : rest;
    }
    for (const { ev, result } of bad) failed.push({ ...keyOf(entry), file: ev.file, line: ev.line, reason: result.reason });
    const originalConfidence = entry.verifyFailed && entry.originalConfidence ? entry.originalConfidence : entry.confidence;
    return { ...entry, confidence: 'low', verifyFailed: true, originalConfidence };
  });
  return { out, failed };
}

export function verifyFacts(root, facts) {
  const { out, failed } = verifyEntries(root, facts.items, (item) => ({ id: item.id }));
  return { facts: { ...facts, items: out }, report: { module: facts.module, total: out.length, failed } };
}

export function verifyFlow(root, flow) {
  const { out, failed } = verifyEntries(root, flow.steps, (step) => ({ step: step.n }));
  return { flow: { ...flow, steps: out }, report: { flow: flow.id, total: out.length, failed } };
}

// A conflict stands only while every side's citation still holds; otherwise it waits under "확인 필요".
export function verifyConflicts(root, doc) {
  const cache = new Map();
  const failed = [];
  const conflicts = doc.conflicts.map((c) => {
    const bad = c.sides
      .flatMap((side) => side.evidence)
      .map((ev) => ({ ev, result: verifyEvidence(root, ev, cache) }))
      .filter(({ result }) => !result.ok);
    if (bad.length === 0) {
      const { verifyFailed, ...rest } = c;
      return { ...rest, status: 'open' };
    }
    for (const { ev, result } of bad) failed.push({ id: c.id, file: ev.file, line: ev.line, reason: result.reason });
    return { ...c, status: 'unverified', verifyFailed: true };
  });
  return { conflicts: { ...doc, conflicts }, report: { total: conflicts.length, failed } };
}
