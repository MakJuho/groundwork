import fs from 'node:fs';
import path from 'node:path';

// Run commands that a build file in the target actually backs. The onboarding guide may only show these;
// anything else (a tool's usual command the model "knows") goes to 확인 필요.

const read = (abs) => {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
};

function evidenceFor(text, rel, pattern) {
  const lines = text.split(/\r?\n/);
  const i = pattern ? lines.findIndex((l) => pattern.test(l)) : 0;
  const at = i >= 0 ? i : 0;
  return { file: rel, line: at + 1, snippet: lines[at].trim() };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fromDir(root, dir) {
  const out = [];
  const rel = (name) => (dir ? `${dir}/${name}` : name);
  const add = (command, text, name, pattern) => out.push({ command, cwd: dir || '.', evidence: evidenceFor(text, rel(name), pattern) });
  const file = (name) => read(path.join(root, dir, name));
  const exists = (name) => fs.existsSync(path.join(root, dir, name));

  const pkgText = file('package.json');
  if (pkgText) {
    let scripts = {};
    try {
      scripts = JSON.parse(pkgText)?.scripts ?? {};
    } catch {}
    const pms = ['npm'];
    if (exists('yarn.lock')) pms.push('yarn');
    if (exists('pnpm-lock.yaml')) pms.push('pnpm');
    for (const pm of pms) {
      add(`${pm} install`, pkgText, 'package.json');
      if (pm === 'npm') add('npm ci', pkgText, 'package.json');
      for (const name of Object.keys(scripts)) {
        const line = new RegExp(`^\\s*"${escape(name)}"\\s*:`);
        add(`${pm} run ${name}`, pkgText, 'package.json', line);
        if (pm !== 'npm' || ['start', 'test', 'stop', 'restart'].includes(name)) add(`${pm} ${name}`, pkgText, 'package.json', line);
      }
    }
  }

  const pom = file('pom.xml');
  if (pom) {
    const runners = exists('mvnw') ? ['mvn', './mvnw'] : ['mvn'];
    const goals = ['clean', 'compile', 'test', 'package', 'verify', 'install'];
    if (/spring-boot-maven-plugin/.test(pom)) goals.push('spring-boot:run');
    for (const r of runners) for (const g of goals) add(`${r} ${g}`, pom, 'pom.xml', g === 'spring-boot:run' ? /spring-boot-maven-plugin/ : null);
  }

  for (const name of ['build.gradle', 'build.gradle.kts']) {
    const gradle = file(name);
    if (!gradle) continue;
    const runners = exists('gradlew') ? ['gradle', './gradlew'] : ['gradle'];
    const tasks = ['build', 'test', 'clean', 'assemble'];
    const boot = /org\.springframework\.boot/.test(gradle);
    if (boot) tasks.push('bootRun');
    for (const r of runners) for (const t of tasks) add(`${r} ${t}`, gradle, name, t === 'bootRun' ? /org\.springframework\.boot/ : null);
  }

  const req = file('requirements.txt');
  if (req !== null) add('pip install -r requirements.txt', req, 'requirements.txt');
  const pyproject = file('pyproject.toml');
  if (pyproject) {
    add('pip install .', pyproject, 'pyproject.toml');
    add('pip install -e .', pyproject, 'pyproject.toml');
    if (/\[tool\.poetry\]/.test(pyproject)) add('poetry install', pyproject, 'pyproject.toml', /\[tool\.poetry\]/);
  }
  const manage = file('manage.py');
  if (manage) for (const sub of ['runserver', 'migrate', 'test']) for (const py of ['python', 'python3']) add(`${py} manage.py ${sub}`, manage, 'manage.py');

  const make = file('Makefile');
  if (make) {
    for (const m of make.matchAll(/^([A-Za-z0-9][A-Za-z0-9_-]*)\s*:(?!=)/gm)) add(`make ${m[1]}`, make, 'Makefile', new RegExp(`^${escape(m[1])}\\s*:`));
  }

  const docker = file('Dockerfile');
  if (docker) add('docker build', docker, 'Dockerfile');
  for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    const compose = file(name);
    if (!compose) continue;
    for (const c of ['docker compose up', 'docker compose down', 'docker-compose up', 'docker-compose down']) add(c, compose, name);
  }
  return out;
}

export function collectCommands(root, manifests = []) {
  const dirs = new Set(['']);
  for (const m of manifests) {
    const d = path.posix.dirname(String(m).replaceAll('\\', '/'));
    dirs.add(d === '.' ? '' : d);
  }
  const seen = new Set();
  return [...dirs].sort().flatMap((d) => fromDir(root, d)).filter((c) => {
    const key = `${c.cwd}\0${c.command}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Unlabeled blocks are left alone: they are as likely to hold a folder tree as commands.
const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'shell-session', 'powershell', 'ps1', 'pwsh', 'cmd', 'bat']);
// In a terminal transcript only the prompt lines are commands; the rest is output.
const PROMPT_LANGS = new Set(['console', 'shell-session']);
const OPEN = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)/;
const CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;
// Moving between folders proves nothing and harms nothing; every other command needs a backing build file.
const NEUTRAL = /^(cd|pushd|popd)(\s|$)/;

// Fenced blocks with both fences. An opener without a closer is not a block, so a half-written document
// is never rewritten.
function codeBlocks(lines) {
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = OPEN.exec(lines[i]);
    if (!m) continue;
    const fence = m[2];
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const c = CLOSE.exec(lines[j]);
      if (c && c[1][0] === fence[0] && c[1].length >= fence.length) {
        close = j;
        break;
      }
    }
    if (close === -1) break;
    blocks.push({ open: i, close, indent: m[1], lang: m[3].toLowerCase() });
    i = close;
  }
  return blocks;
}

function splitComment(line) {
  const m = line.match(/^(.*?)(?:\s+#\s*(.*))?$/);
  return { code: m[1].trim(), comment: (m[2] ?? '').trim() };
}

function commandParts(code) {
  return code
    .split(/\s*(?:&&|\|\||;|\||&)\s*/)
    .map((part) => part.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const backed = (part, allowed) => NEUTRAL.test(part) || allowed.some((c) => part === c || part.startsWith(`${c} `));

// Every command in the shell blocks that no build file backs: { line, lines (indices), command, comment, block }.
function unbacked(lines, commands) {
  const allowed = commands.map((c) => c.command);
  const found = [];
  codeBlocks(lines).forEach((b, bi) => {
    if (!SHELL_LANGS.has(b.lang)) return;
    const promptOnly = PROMPT_LANGS.has(b.lang);
    for (let i = b.open + 1; i < b.close; i++) {
      const start = i;
      let text = lines[i].startsWith(b.indent) ? lines[i].slice(b.indent.length) : lines[i].trimStart();
      if (promptOnly) {
        if (!/^\s*\$\s/.test(text)) continue;
      }
      text = text.replace(/^\s*\$\s+/, '');
      // A trailing backslash continues the command on the next line.
      while (/\\\s*$/.test(text) && i + 1 < b.close) text = `${text.replace(/\\\s*$/, '')} ${lines[++i].trim()}`;
      const { code, comment } = splitComment(text);
      if (!code || code.startsWith('#')) continue;
      if (commandParts(code).some((p) => !backed(p, allowed))) {
        found.push({ line: start + 1, lines: Array.from({ length: i - start + 1 }, (_, k) => start + k), command: code.replace(/\s+/g, ' '), comment, block: bi });
      }
    }
  });
  return found;
}

export function findUnverified(markdown, commands) {
  return unbacked(markdown.split('\n'), commands).map(({ line, command, comment }) => ({ line, command, comment }));
}

export function fixUnverified(markdown, commands) {
  const lines = markdown.split('\n');
  const found = unbacked(lines, commands);
  const removed = found.map(({ command, comment }) => ({ command, comment }));
  if (!found.length) return { markdown, removed };

  const blocks = codeBlocks(lines);
  const drop = new Set(found.flatMap((f) => f.lines));
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const bi = blocks.findIndex((b) => b.open === i);
    const mine = found.filter((f) => f.block === bi);
    if (bi === -1 || !mine.length) {
      result.push(lines[i]);
      continue;
    }
    const b = blocks[bi];
    const body = lines.slice(b.open + 1, b.close).filter((_, k) => !drop.has(b.open + 1 + k));
    if (body.some((l) => l.trim() !== '')) result.push(lines[b.open], ...body, lines[b.close]);
    result.push('', `${b.indent}> **확인 필요** 아래 명령은 프로젝트의 빌드 파일에서 근거를 찾지 못해 실행 방법에서 뺐습니다. 실행 전에 담당자에게 확인하세요.`);
    for (const f of mine) result.push(`${b.indent}> - \`${f.command}\`${f.comment ? ` — ${f.comment}` : ''}`);
    i = b.close;
  }
  return { markdown: result.join('\n'), removed };
}

