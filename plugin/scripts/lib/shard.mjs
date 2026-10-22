// 큰 모듈은 에이전트 하나가 다 읽으면 컨텍스트가 넘치고 전체 시간이 가장 큰 모듈에 묶인다.
// 파일 수나 바이트가 한도를 넘는 모듈을 같은 크기의 조각(shard)으로 나눠 에이전트를 여러 개 띄운다.

export const SHARD_MAX_FILES = 40;
export const SHARD_MAX_BYTES = 300 * 1024;

export function shardLimits(env = process.env) {
  const num = (v, fallback) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  return { maxFiles: num(env.GROUNDWORK_SHARD_FILES, SHARD_MAX_FILES), maxBytes: num(env.GROUNDWORK_SHARD_BYTES, SHARD_MAX_BYTES) };
}

// 계층 접미어를 뗀 이름. LoanController, LoanService, Loan이 한 조각에 같이 들어가야 규칙이 조각 사이로 쪼개지지 않는다.
const LAYER_SUFFIX = /(Controller|ServiceImpl|Service|Impl|Repository|Dao|Mapper|Dto|DTO|Vo|VO|Entity|Request|Response|Tests?)$/;
export function stemKey(file) {
  const base = file.split('/').pop().replace(/\.[^.]*$/, '');
  return (base.replace(LAYER_SUFFIX, '') || base).toLowerCase();
}

// files를 조각 배열로 나눈다. 한도 안이면 조각 하나다.
export function planShards(files, sizeOf, { maxFiles = SHARD_MAX_FILES, maxBytes = SHARD_MAX_BYTES } = {}) {
  const sizes = new Map(files.map((f) => [f, sizeOf(f)]));
  const totalBytes = [...sizes.values()].reduce((a, b) => a + b, 0);
  const n = Math.max(Math.ceil(files.length / maxFiles), Math.ceil(totalBytes / maxBytes), 1);
  if (n === 1) return [files.slice()];

  const groups = new Map();
  for (const f of [...files].sort()) {
    const key = stemKey(f);
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, g]) => g);

  // 같은 크기로 나누려고 조각마다 목표치를 정하고, 목표를 채우면 닫는다.
  const targetFiles = Math.ceil(files.length / n);
  const targetBytes = Math.ceil(totalBytes / n);
  const shards = [];
  let cur = [];
  let curBytes = 0;
  const flush = () => {
    if (cur.length) shards.push(cur);
    cur = [];
    curBytes = 0;
  };
  for (const group of ordered) {
    for (const f of group) {
      cur.push(f);
      curBytes += sizes.get(f);
      // 한 그룹은 되도록 한 조각에 두되, 그룹 하나가 목표를 두 배 넘으면 그 안에서도 자른다.
      if ((cur.length >= targetFiles * 2 || curBytes >= targetBytes * 2) && group.at(-1) !== f) flush();
    }
    if (cur.length >= targetFiles || curBytes >= targetBytes) flush();
  }
  flush();
  // 목표의 절반도 못 채운 꼬리 조각은 에이전트를 하나 더 띄울 값어치가 없으니 앞 조각에 붙인다.
  const tail = shards.at(-1);
  if (shards.length > 1 && tail.length < targetFiles / 2 && tail.reduce((a, f) => a + sizes.get(f), 0) < targetBytes / 2) {
    shards.pop();
    shards.at(-1).push(...tail);
  }
  return shards;
}

// 한도를 넘는 모듈만 { 모듈 id: 조각[] }으로 돌려준다.
export function shardModules(byModule, sizeOf, limits = shardLimits()) {
  const shards = {};
  for (const [id, files] of Object.entries(byModule)) {
    const plan = planShards(files, sizeOf, limits);
    if (plan.length > 1) shards[id] = plan;
  }
  return shards;
}
