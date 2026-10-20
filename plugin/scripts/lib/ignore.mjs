export const DEFAULT_EXCLUDES = [
  '.git/', 'node_modules/', 'build/', 'dist/', 'target/', 'out/', 'vendor/', 'coverage/',
  '.gradle/', '.idea/', '.vscode/', '__pycache__/', '.venv/', 'venv/', '.next/', 'groundwork-output/',
];

export const MAX_FILE_BYTES = 1024 * 1024;

export function parseIgnoreFile(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'));
}

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

function compile(pattern) {
  let p = pattern.replace(/\\/g, '/');
  const dirOnly = p.endsWith('/');
  if (dirOnly) p = p.slice(0, -1);
  const anchored = p.includes('/');
  if (p.startsWith('/')) p = p.slice(1);
  return { re: globToRegExp(p), dirOnly, anchored };
}

export function createMatcher(patterns) {
  const rules = patterns.map(compile);
  return (relPath, isDir) => {
    const segs = relPath.split('/');
    return rules.some(({ re, dirOnly, anchored }) => {
      for (let i = 0; i < segs.length; i++) {
        const segIsDir = i < segs.length - 1 || isDir;
        if (dirOnly && !segIsDir) continue;
        const subject = anchored ? segs.slice(0, i + 1).join('/') : segs[i];
        if (re.test(subject)) return true;
      }
      return false;
    });
  };
}

const GENERATED_NAME = /(\.min\.(js|css)$|\.map$|\.lock$|(^|\/)package-lock\.json$|(^|\/)pnpm-lock\.yaml$)/;
const GENERATED_MARK = /@generated|DO NOT EDIT/;

export function isGeneratedOrMinified(relPath, head) {
  if (GENERATED_NAME.test(relPath)) return true;
  if (GENERATED_MARK.test(head)) return true;
  return head.split('\n', 1)[0].length > 1000;
}
