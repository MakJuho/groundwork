import fs from 'node:fs';
import path from 'node:path';
import { readJsonDir } from './jsondir.mjs';
import { validateFlow } from './validate.mjs';

export const LANES = ['screen', 'common', 'controller', 'service', 'mapper', 'db'];

// Lane of an actor: explicit layer first, then its kind, then keywords in its name or id.
export function inferLayer(actor) {
  if (actor?.layer) return actor.layer;
  if (actor?.kind === 'client') return 'screen';
  if (actor?.kind === 'db') return 'db';
  if (actor?.kind === 'external') return 'external';
  const text = `${actor?.name ?? ''} ${actor?.id ?? ''}`.toLowerCase();
  const has = (...words) => words.some((w) => text.includes(w));
  if (has('controller', '컨트롤러', '화면 처리')) return 'controller';
  if (has('service', '서비스', '처리')) return 'service';
  if (has('mapper', 'repository', 'dao', '저장소')) return 'mapper';
  if (has('common', '공통', 'gfn')) return 'common';
  return 'other';
}

// Normal path = steps with neither branch nor branchOf. A branch tab = the normal steps before the
// branching step, the step itself, then the steps that belong to it.
export function flowPaths(flow) {
  const steps = flow.steps ?? [];
  const plain = (s) => s.branch === undefined && s.branchOf === undefined;
  const paths = [{ key: 'main', label: '정상', steps: steps.filter(plain).map((s) => s.n) }];
  for (const b of steps.filter((s) => s.branch !== undefined)) {
    paths.push({
      key: `b${b.n}`,
      label: b.branch.condition,
      steps: [
        ...steps.filter((s) => plain(s) && s.n < b.n).map((s) => s.n),
        b.n,
        ...steps.filter((s) => s.branchOf === b.n).map((s) => s.n),
      ],
    });
  }
  return paths;
}

export function collectSnippets(root, flows, context = 3) {
  const out = {};
  const cache = new Map();
  const base = path.resolve(root);
  const linesOf = (file) => {
    if (cache.has(file)) return cache.get(file);
    let lines = null;
    if (typeof file === 'string' && file && !path.isAbsolute(file)) {
      const abs = path.resolve(base, file);
      const rel = path.relative(base, abs);
      if (rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)) {
        try {
          lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
        } catch { /* missing or unreadable */ }
      }
    }
    cache.set(file, lines);
    return lines;
  };
  for (const flow of flows) {
    for (const step of flow.steps ?? []) {
      for (const ev of step.evidence ?? []) {
        const key = `${ev.file}:${ev.line}`;
        if (key in out || !Number.isInteger(ev.line)) continue;
        const lines = linesOf(ev.file);
        if (!lines || ev.line < 1 || ev.line > lines.length) continue;
        const start = Math.max(1, ev.line - context);
        out[key] = { start, lines: lines.slice(start - 1, Math.min(lines.length, ev.line + context)) };
      }
    }
  }
  return out;
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const apiPath = (label) => String(label ?? '').trim().split(/\s+/).pop().split('?')[0].toLowerCase();

// Sets b.flowId (and b.flowSource) on every screen button that has a flow to play:
// 'ui'  — a flow traced from this button (/groundwork:trace "Screen.btn"), screen steps included;
// 'api' — no button flow, but an API flow (from analyze) for the URL the button calls; screen-side steps may be missing.
// Returns Map flowId -> [{ screen, button }] for linking from the report.
export function linkButtonsToFlows(screens, flows) {
  const byFlow = new Map();
  for (const sc of screens) {
    for (const b of sc.buttons ?? []) {
      delete b.flowId;
      delete b.flowSource;
      let hit = flows.find((f) => f.trigger?.kind === 'ui' && f.trigger.screen === sc.id && f.trigger.component === b.id);
      let source = 'ui';
      if (!hit && b.call?.url) {
        hit = flows.find((f) => f.trigger?.kind === 'api' && apiPath(f.trigger.label) === apiPath(b.call.url));
        source = 'api';
      }
      if (!hit) continue;
      b.flowId = hit.id;
      b.flowSource = source;
      if (!byFlow.has(hit.id)) byFlow.set(hit.id, []);
      byFlow.get(hit.id).push({ screen: sc, button: b });
    }
  }
  return byFlow;
}

export function buildPlayerData(outDir) {
  const data = path.join(outDir, '_data');
  const map = readJson(path.join(data, 'module-map.json'));
  const project = { name: map?.project?.name ?? '', root: map?.project?.root ?? '' };
  const screens = readJson(path.join(data, 'screens.json'))?.screens ?? [];
  const rawFlows = readJsonDir(path.join(data, 'flows'), validateFlow);
  const flows = rawFlows.map((f) => ({
    ...f,
    lanes: Object.fromEntries(f.actors.map((a) => [a.id, inferLayer(a)])),
    paths: flowPaths(f),
  }));
  linkButtonsToFlows(screens, flows);
  return { project, screens, flows, snippets: project.root ? collectSnippets(project.root, flows) : {} };
}
