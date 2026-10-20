import { execFileSync } from 'node:child_process';

// Read-only Git access to the target. Paths are relative to the target folder (it may be a subfolder of
// the repository), so they line up with module-files.json and evidence paths.

export function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

const tryGit = (root, args) => {
  try {
    return git(root, args).trim();
  } catch {
    return null;
  }
};

export const isRepo = (root) => tryGit(root, ['rev-parse', '--is-inside-work-tree']) === 'true';
export const revParse = (root, rev) => tryGit(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
export const head = (root) => revParse(root, 'HEAD');
export const branch = (root) => tryGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']);

// Remote URL without user:password@ so a token never ends up in the output folder.
export function remoteUrl(root) {
  const url = tryGit(root, ['config', '--get', 'remote.origin.url']);
  return url ? url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]+@/i, '$1') : null;
}

// Tracked files under the target that differ from HEAD, staged or not (untracked files are not analyzed
// differently). Relative to the target, like everything else here.
export function dirtyFiles(root) {
  return git(root, ['diff', '--name-only', '-z', '--relative', 'HEAD', '--', '.']).split('\0').filter(Boolean);
}

export function filesAt(root, rev) {
  return git(root, ['ls-tree', '-r', '--name-only', '-z', rev]).split('\0').filter(Boolean);
}

export function changedFiles(root, from, to) {
  const parts = git(root, ['diff', '--name-status', '-z', '-M', '--relative', from, to]).split('\0');
  const files = [];
  for (let i = 0; i < parts.length - 1;) {
    const status = parts[i++];
    const code = status[0];
    if (code === 'R' || code === 'C') {
      const oldPath = parts[i++];
      const newPath = parts[i++];
      files.push(code === 'R' ? { status: 'R', path: newPath, oldPath } : { status: 'A', path: newPath });
    } else if (status) {
      files.push({ status: code === 'T' ? 'M' : code, path: parts[i++] });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
