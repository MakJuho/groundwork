import fs from 'node:fs';
import path from 'node:path';
import { createMatcher, DEFAULT_EXCLUDES, isGeneratedOrMinified, MAX_FILE_BYTES, parseIgnoreFile } from './ignore.mjs';
import { detectStacks, MANIFEST_NAMES } from './detect-stack.mjs';
import { detectLayout } from './layout.mjs';

const ENTRY_POINT = /((^|\/)(main|index|app|server|application)\.(js|ts|mjs|py)$|Application\.java$|(^|\/)manage\.py$)/i;

function readHead(abs) {
  const fd = fs.openSync(abs, 'r');
  try {
    const buf = Buffer.alloc(2048);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

export function walkFiles(root, matcher) {
  const files = [];
  const skipped = [];
  const pending = [''];
  while (pending.length) {
    const rel = pending.pop();
    const abs = path.join(root, rel);
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) {
        if (!matcher(childRel, true)) pending.push(childRel);
        continue;
      }
      if (!ent.isFile() || matcher(childRel, false)) continue;
      const childAbs = path.join(abs, ent.name);
      const bytes = fs.statSync(childAbs).size;
      if (bytes > MAX_FILE_BYTES) {
        skipped.push({ path: childRel, reason: 'too-large' });
        continue;
      }
      const head = readHead(childAbs);
      if (head.includes(0)) {
        skipped.push({ path: childRel, reason: 'binary' });
        continue;
      }
      if (isGeneratedOrMinified(childRel, head.toString('utf8'))) {
        skipped.push({ path: childRel, reason: 'generated' });
        continue;
      }
      files.push({ path: childRel, bytes });
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped };
}

export function buildInventory(root) {
  const ignoreFile = path.join(root, '.groundworkignore');
  const userIgnorePatterns = fs.existsSync(ignoreFile) ? parseIgnoreFile(fs.readFileSync(ignoreFile, 'utf8')) : [];
  const matcher = createMatcher([...DEFAULT_EXCLUDES, ...userIgnorePatterns]);
  const { files, skipped } = walkFiles(root, matcher);
  const paths = files.map((f) => f.path);

  const dirCounts = new Map();
  for (const p of paths) {
    const segs = p.split('/');
    for (let depth = 1; depth <= Math.min(3, segs.length - 1); depth++) {
      const key = segs.slice(0, depth).join('/');
      dirCounts.set(key, (dirCounts.get(key) ?? 0) + 1);
    }
  }

  return {
    root: path.resolve(root),
    generatedAt: new Date().toISOString(),
    stacks: detectStacks(paths),
    manifests: paths.filter((p) => MANIFEST_NAMES.has(p.split('/').pop())),
    entryPoints: paths.filter((p) => ENTRY_POINT.test(p)).slice(0, 50),
    layout: detectLayout(paths),
    totals: { files: files.length, bytes: files.reduce((sum, f) => sum + f.bytes, 0) },
    dirs: [...dirCounts]
      .map(([p, n]) => ({ path: p, files: n }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    skipped: { count: skipped.length, sample: skipped.slice(0, 200) },
    userIgnorePatterns,
  };
}
