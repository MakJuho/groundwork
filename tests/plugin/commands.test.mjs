import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { makeTree } from '../helpers.mjs';
import { collectCommands, fixUnverified, findUnverified } from '../../plugin/scripts/lib/commands.mjs';

const CLI = path.resolve('plugin/scripts/run-commands.mjs');

// The realworld package.json: three scripts and a prisma tool config, but no migrate/seed script.
const REALWORLD_PKG = `{
  "name": "@api/source",
  "scripts": {
    "start": "nx serve",
    "build": "nx build",
    "test": "nx test"
  },
  "prisma": {
    "seed": "ts-node src/prisma/seed.ts"
  }
}
`;

const ONBOARDING = `# realworld 온보딩 가이드

## 5. 실행 방법

\`\`\`bash
npm install                 # 의존성 설치
npx prisma migrate deploy   # DB 마이그레이션 적용
npx prisma db seed          # 데모 데이터 생성
npm start                   # 개발 서버 실행
npm run build
PORT=4000 npm test -- --watch
\`\`\`

## 6. 핵심 정책 미리보기
`;

test('collectCommands lists only commands a build file backs, with the line that backs them', () => {
  const root = makeTree({ 'package.json': REALWORLD_PKG, 'Dockerfile': 'FROM node' });
  const cmds = collectCommands(root, ['package.json']);
  const names = cmds.map((c) => c.command);
  for (const c of ['npm install', 'npm ci', 'npm start', 'npm run start', 'npm run build', 'npm test', 'npm run test', 'docker build']) assert.ok(names.includes(c), c);
  assert.ok(!names.some((c) => c.includes('prisma')), 'a tool config is not a script');
  assert.deepEqual(cmds.find((c) => c.command === 'npm run build').evidence, { file: 'package.json', line: 5, snippet: '"build": "nx build",' });
});

test('collectCommands covers maven, gradle wrappers, python, make and nested manifests', () => {
  const root = makeTree({
    'pom.xml': '<project><build><plugins><plugin><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build></project>',
    'mvnw': '#!/bin/sh',
    'api/build.gradle': "plugins { id 'org.springframework.boot' }",
    'api/gradlew': '#!/bin/sh',
    'tools/requirements.txt': 'flask',
    'Makefile': 'run:\n\tgo run .\nVAR := x\n.PHONY: run\n',
  });
  const names = collectCommands(root, ['pom.xml', 'api/build.gradle', 'tools/requirements.txt']).map((c) => c.command);
  for (const c of ['./mvnw spring-boot:run', 'mvn package', './gradlew bootRun', './gradlew build', 'pip install -r requirements.txt', 'make run']) assert.ok(names.includes(c), c);
  assert.ok(!names.includes('make VAR'));
  assert.ok(!names.includes('make .PHONY'));
});

test('findUnverified flags realworld prisma commands but accepts scripts, env prefixes and extra args', () => {
  const root = makeTree({ 'package.json': REALWORLD_PKG });
  const bad = findUnverified(ONBOARDING, collectCommands(root, ['package.json']));
  assert.deepEqual(bad.map((b) => b.command), ['npx prisma migrate deploy', 'npx prisma db seed']);
});

test('fixUnverified moves unbacked commands out of the code block into a 확인 필요 note, idempotently', () => {
  const root = makeTree({ 'package.json': REALWORLD_PKG });
  const cmds = collectCommands(root, ['package.json']);
  const { markdown, removed } = fixUnverified(ONBOARDING, cmds);
  assert.equal(removed.length, 2);
  assert.doesNotMatch(markdown, /^npx prisma/m);
  assert.match(markdown, /^npm start {2,}# 개발 서버 실행$/m);
  assert.match(markdown, /> \*\*확인 필요\*\*/);
  assert.match(markdown, /> - `npx prisma migrate deploy` — DB 마이그레이션 적용/);
  assert.ok(markdown.indexOf('확인 필요') < markdown.indexOf('## 6.'), 'the note stays in the same section');
  assert.deepEqual(fixUnverified(markdown, cmds), { markdown, removed: [] });
});

test('fixUnverified drops a code block that only held unbacked commands', () => {
  const md = '## 5. 실행 방법\n\n```bash\nnpx prisma db seed\n```\n';
  const { markdown } = fixUnverified(md, []);
  assert.doesNotMatch(markdown, /```/);
  assert.match(markdown, /`npx prisma db seed`/);
});

test('fixUnverified leaves a document with an unclosed fence intact', () => {
  const md = '# A\n\n```bash\nnpm install\nnpx prisma db seed\n\n## after\ntext';
  assert.deepEqual(fixUnverified(md, [{ command: 'npm install' }]), { markdown: md, removed: [] });
  assert.deepEqual(findUnverified(md, [{ command: 'npm install' }]), []);
});

test('findUnverified scans indented and tilde fences, pipes, single &, continued lines and console prompts', () => {
  const allowed = [{ command: 'npm test' }, { command: 'mvn clean' }];
  const md = [
    '1. 실행',
    '   ```bash',
    '   npx prisma db seed',
    '   ```',
    '~~~sh',
    'npm test | npx evil',
    'npm test & npx bg',
    'mvn \\',
    '  clean package',
    '~~~',
    '```console',
    '$ npm test',
    '> shop@1.0.0 test',
    'ok',
    '$ npx other',
    '```',
  ].join('\n');
  assert.deepEqual(findUnverified(md, allowed).map((b) => b.command), ['npx prisma db seed', 'npm test | npx evil', 'npm test & npx bg', 'npx other']);
  assert.deepEqual(findUnverified('```\nsrc/\n├─ order\n```', allowed), [], 'unlabeled blocks may be folder trees');
});

test('run-commands CLI writes _data/run-commands.json and --check fixes onboarding.md', () => {
  const target = makeTree({ 'package.json': REALWORLD_PKG });
  const out = makeTree({
    '_data/module-map.json': JSON.stringify({ project: { name: 'rw', root: target, summary: 's', stacks: ['node'] }, modules: [] }),
    '_data/inventory.json': JSON.stringify({ root: target, manifests: ['package.json'] }),
    'overview/onboarding.md': ONBOARDING,
  });
  const listed = JSON.parse(execFileSync('node', [CLI, out], { encoding: 'utf8' }));
  assert.ok(listed.some((c) => c.command === 'npm start'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, '_data/run-commands.json'), 'utf8')), listed);

  const check = spawnSync('node', [CLI, out, '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /unverified=2/);
  assert.match(check.stdout, /npx prisma migrate deploy/);
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'overview/onboarding.md'), 'utf8'), /^npx prisma/m);
  assert.match(spawnSync('node', [CLI, out, '--check'], { encoding: 'utf8' }).stdout, /unverified=0/);
});

test('run-commands CLI exits 2 when the output folder is inside the target', () => {
  const target = makeTree({ 'package.json': REALWORLD_PKG });
  const out = path.join(target, 'gw');
  fs.mkdirSync(path.join(out, '_data'), { recursive: true });
  fs.writeFileSync(path.join(out, '_data/module-map.json'), JSON.stringify({ project: { name: 't', root: target, summary: 's', stacks: ['node'] }, modules: [] }));
  const r = spawnSync('node', [CLI, out], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /outside the target/);
});
