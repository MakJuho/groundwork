import fs from 'node:fs';
import path from 'node:path';

// Reads every *.json file in `dir` (sorted by name). Files that do not parse, or that fail `validate`
// (a function returning a list of error strings), are not returned but listed in `skipped`, so one bad
// file never aborts a whole run.
export function loadJsonDir(dir, validate = null) {
  const entries = [];
  const skipped = [];
  if (!fs.existsSync(dir)) return { entries, skipped };
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      skipped.push({ name, file, reason: `unreadable JSON: ${err.message}` });
      continue;
    }
    const errors = validate ? validate(data) : [];
    if (errors.length) {
      skipped.push({ name, file, reason: `invalid: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ' ...' : ''}` });
      continue;
    }
    entries.push({ name, file, data });
  }
  return { entries, skipped };
}

export const warnSkipped = (skipped) => {
  for (const s of skipped) console.error(`WARN skipped ${s.file}: ${s.reason}`);
};

// Data-only variant: returns the parsed documents and warns about skipped files on stderr.
export function readJsonDir(dir, validate = null) {
  const { entries, skipped } = loadJsonDir(dir, validate);
  warnSkipped(skipped);
  return entries.map((e) => e.data);
}

// Writes through a temp file and a rename, so an interrupted run never leaves a half-written file.
export function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
