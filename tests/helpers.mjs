import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function makeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}
