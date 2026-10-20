import fs from 'node:fs';
import path from 'node:path';

// Resolves symlinks and junctions. A path that does not exist yet (an output folder about to be
// created) is resolved through its nearest existing ancestor.
function realPath(p) {
  let cur = path.resolve(p);
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(cur), ...rest);
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      rest.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

function within(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

export function isInside(parent, child) {
  return within(path.resolve(parent), path.resolve(child)) || within(realPath(parent), realPath(child));
}

export function assertOutside(target, out) {
  if (isInside(target, out)) {
    console.error(`output must be outside the target folder: ${out}`);
    process.exit(2);
  }
}

// For CLIs that take only the output folder: the target comes from OUT/_data/module-map.json.
// Without it there is no way to know the output is not the analyzed folder, so the CLI refuses.
export function assertOutputOutsideTarget(out) {
  const mapFile = path.join(out, '_data', 'module-map.json');
  let root;
  try {
    root = JSON.parse(fs.readFileSync(mapFile, 'utf8'))?.project?.root;
  } catch (err) {
    console.error(`cannot read ${mapFile}: ${err.message} (is ${out} a Groundwork output folder? run /groundwork:scan first)`);
    process.exit(2);
  }
  if (typeof root !== 'string' || !root.trim()) {
    console.error(`${mapFile}: project.root missing`);
    process.exit(2);
  }
  assertOutside(root, out);
  return root;
}
