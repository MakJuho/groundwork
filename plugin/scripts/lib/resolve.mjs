import fs from 'node:fs';
import path from 'node:path';
import { createMatcher, DEFAULT_EXCLUDES, globToRegExp, parseIgnoreFile } from './ignore.mjs';
import { walkFiles } from './inventory.mjs';
import { shardModules } from './shard.mjs';

export function listTargetFiles(root) {
  const ignoreFile = path.join(root, '.groundworkignore');
  const user = fs.existsSync(ignoreFile) ? parseIgnoreFile(fs.readFileSync(ignoreFile, 'utf8')) : [];
  return walkFiles(root, createMatcher([...DEFAULT_EXCLUDES, ...user])).files.map((f) => f.path);
}

// 대상 폴더 기준으로 고정한다. 앞의 './'와 끝의 '/'는 무시한다.
const normalize = (p) => p.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/$/, '');

// 폴더와 파일은 경로 접두사로 비교하고, glob은 파일의 전체 경로와 비교한다.
function compilePath(raw) {
  const p = normalize(raw);
  if (/[*?]/.test(p)) {
    const re = globToRegExp(p);
    return (file) => re.test(file);
  }
  // createMatcher는 '/'가 들어간 패턴을 고정(anchored)으로 본다. 앞에 '/'를 붙여 단일 파일 이름도 고정한다.
  const match = createMatcher(['/' + p]);
  return (file) => match(file, false);
}

export function resolveModules(modules, files) {
  const byModule = {};
  const owners = new Map();
  for (const mod of modules) {
    const matchers = mod.paths.map(compilePath);
    byModule[mod.id] = files.filter((f) => matchers.some((m) => m(f)));
    for (const f of byModule[mod.id]) owners.set(f, [...(owners.get(f) ?? []), mod.id]);
  }
  return {
    byModule,
    unassigned: files.filter((f) => !owners.has(f)),
    overlaps: [...owners].filter(([, ids]) => ids.length > 1).map(([file, ids]) => ({ file, modules: ids })),
  };
}

// module-files.json 내용. resolve-modules와 plan-update가 같은 형식으로 쓴다.
// shards는 한도를 넘는 모듈만 { id: 조각[] }으로 담는다(lib/shard.mjs). 없으면 키를 만들지 않는다.
export function moduleFilesDoc({ byModule, unassigned, overlaps }, shards = {}) {
  return {
    generatedAt: new Date().toISOString(),
    modules: byModule,
    ...(Object.keys(shards).length ? { shards } : {}),
    unassigned: { count: unassigned.length, sample: unassigned.slice(0, 200) },
    overlaps: { count: overlaps.length, sample: overlaps.slice(0, 200) },
  };
}

// 미배정 경고는 업무 코드만 센다. 테스트, 문서, 빌드·설정 파일은 미배정으로 남아도 된다.
const SOURCE_EXT = /\.(java|kt|kts|scala|groovy|ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|rb|go|rs|cs|php|swift)$/i;
const TEST_PATH = /(^|\/)(tests?|__tests__|e2e|spec)\/|\.(test|spec)\.[^/]+$|Tests?\.[^/.]+$/;

export function isBusinessSource(file) {
  return SOURCE_EXT.test(file) && !TEST_PATH.test(file);
}

// 모듈 파일을 대상 폴더에서 실제 크기로 재서 조각으로 나눈다. 크기를 못 재는 파일은 0으로 본다.
export function planModuleShards(root, byModule) {
  const sizeOf = (f) => {
    try {
      return fs.statSync(path.join(root, f)).size;
    } catch {
      return 0;
    }
  };
  return shardModules(byModule, sizeOf);
}
