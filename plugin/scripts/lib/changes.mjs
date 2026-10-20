// Policy change log document (design §4 "정책 변경 내역"). Rendered by script, not by the model: the
// before/after cells are the facts' summaries, which are already business language, and the same update
// must always read the same.

const TYPE_LABEL = { changed: '변경', added: '추가', removed: '삭제' };
const FLOW_STATUS = { changed: '바뀜', added: '새 흐름', removed: '없어짐', unchanged: '그대로' };
const SEVERITY_LABEL = { high: '높음', medium: '보통', low: '낮음' };
const CONFLICT_FIELD_LABEL = { title: '제목', scenario: '시나리오', impact: '영향', severity: '심각도', type: '유형' };
const PATH_LABEL = { value: '값', unit: '단위', from: '이전 상태', to: '다음 상태', trigger: '계기', method: '메서드', path: '경로' };

const cell = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const loc = (side) => {
  const e = side?.evidence?.[0];
  return e ? `\`${e.file}:${e.line}\`` : '—';
};
const value = (v) => {
  if (v === null || v === undefined) return '없음';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '없음';
  if (typeof v === 'object') return JSON.stringify(v);
  return typeof v === 'number' ? v.toLocaleString('en-US') : String(v);
};

// Only the line numbers moved: the rule is the same, so it stays out of the change table.
const isMoveOnly = (d) => d.type === 'changed' && d.fields.every((f) => f === 'evidence');
const isReworded = (d) => d.type === 'changed' && d.fields.every((f) => f === 'summary' || f === 'evidence');

function afterCell(d) {
  if (!d.after) return '—';
  const notes = d.detailChanges.map((c) => `${PATH_LABEL[c.path] ?? c.path}: ${value(c.before)} → ${value(c.after)}`);
  if (d.fields.includes('confidence')) notes.push(`신뢰도: ${d.before.confidence} → ${d.after.confidence}`);
  return cell(d.after.summary) + (notes.length ? ` (${cell(notes.join(', '))})` : '');
}

export function renderChanges(change, { moduleNames = {} } = {}) {
  const from = String(change.from).slice(0, 7);
  const to = String(change.to).slice(0, 7);
  const items = change.items ?? [];
  const moved = items.filter(isMoveOnly);
  const listed = items.filter((d) => !isMoveOnly(d));
  const count = (type) => listed.filter((d) => d.type === type).length;
  const modules = (change.modules ?? []).map((id) => (moduleNames[id] ? `${moduleNames[id]} (${id})` : id));

  const lines = [
    `# 정책 변경 내역 ${change.date} (${from} → ${to})`,
    '> 자동 생성 문서입니다. 정책 번호는 처음 매긴 뒤 바뀌지 않습니다. 이전·이후 문장은 정책서의 정책 문장 그대로입니다.',
    '',
    '## 1. 요약',
    '',
    '| 항목 | 내용 |',
    '|---|---|',
    `| 커밋 범위 | \`${from}\` → \`${to}\` |`,
    `| 바뀐 모듈 | ${modules.length ? modules.join(', ') : '없음'} |`,
    `| 정책 변경 | 추가 ${count('added')} · 변경 ${count('changed')} · 삭제 ${count('removed')} |`,
  ];
  if (moved.length) lines.push(`| 근거 위치만 이동 | ${moved.length} |`);
  const conflicts = change.conflicts;
  if (conflicts) {
    const review = conflicts.needsReview?.length ?? 0;
    lines.push(`| 정책 충돌 | 새 ${conflicts.added?.length ?? 0} · 해소 ${conflicts.resolved?.length ?? 0} · 변경 ${conflicts.changed?.length ?? 0}${review ? ` · 확인 필요 ${review}` : ''} |`);
  }
  lines.push('', '## 2. 바뀐 정책', '');
  if (!listed.length) {
    lines.push('바뀐 정책이 없습니다.');
  } else {
    lines.push('| 구분 | 정책 번호 | 이전 | 이후 | 근거 | 커밋 |', '|---|---|---|---|---|---|');
    for (const d of listed) {
      const label = isReworded(d) ? '변경(표현)' : TYPE_LABEL[d.type];
      const where = d.after ? loc(d.after) : `${loc(d.before)} (이전)`;
      lines.push(`| ${label} | ${d.id} | ${d.before ? cell(d.before.summary) : '—'} | ${afterCell(d)} | ${where} | \`${to}\` |`);
    }
    if (listed.some(isReworded)) lines.push('', '> 변경(표현): 코드는 그대로이고 정책 문장만 다듬어진 항목입니다.');
  }
  if (moved.length) {
    lines.push('', '근거 위치만 바뀐 정책 (내용은 그대로, 다른 코드가 바뀌어 줄 번호가 밀림):', '');
    for (const d of moved) lines.push(`- ${d.id} ${cell(d.after.summary)}: ${loc(d.before)} → ${loc(d.after)}`);
  }

  lines.push('', '## 3. 바뀐 흐름', '');
  const flows = change.flows ?? [];
  if (!flows.length) {
    lines.push('다시 추적한 흐름이 없습니다.');
  } else {
    lines.push('| 흐름 | 상태 | 단계 수 | 달라진 점 |', '|---|---|---|---|');
    for (const f of flows) {
      const notes = [];
      if (f.addedSteps.length) notes.push(`추가된 단계: ${f.addedSteps.join(', ')}`);
      if (f.removedSteps.length) notes.push(`빠진 단계: ${f.removedSteps.join(', ')}`);
      if (f.policies.added.length) notes.push(`새로 적용된 정책: ${f.policies.added.join(', ')}`);
      if (f.policies.removed.length) notes.push(`빠진 정책: ${f.policies.removed.join(', ')}`);
      const title = f.status === 'removed' ? cell(f.title) : `[${cell(f.title)}](../flows/${f.id}/flow.md)`;
      lines.push(`| ${title} | ${FLOW_STATUS[f.status] ?? f.status} | ${f.stepsBefore} → ${f.stepsAfter} | ${cell(notes.join(' · ')) || '—'} |`);
    }
  }

  lines.push('', '## 4. 확인 필요', '');
  const review = change.needsReview ?? [];
  if (!review.length) lines.push('없음');
  for (const r of review) lines.push(`- ${r.id} ${cell(r.summary)} (${r.module}): 갱신 후 근거 코드 확인에 실패했습니다. 담당 개발자 확인 필요`);
  if (conflicts) lines.push('', ...renderConflictSection(conflicts));
  return `${lines.join('\n')}\n`;
}

// Last section, only when diff-conflicts ran: earlier section numbers stay as they were.
function renderConflictSection(c) {
  const lines = ['## 5. 정책 충돌', '', '> 리포트의 정책 충돌 화면에서 시나리오와 양쪽 근거 코드를 볼 수 있습니다.'];
  const table = (title, list, head, row) => {
    lines.push('', `### ${title}`, '');
    if (!list?.length) {
      lines.push('없음');
      return;
    }
    lines.push(`| 번호 | 제목 | ${head} |`, '|---|---|---|');
    for (const x of list) lines.push(`| ${x.id} | ${cell(x.title)} | ${row(x)} |`);
  };
  const severity = (x) => SEVERITY_LABEL[x.severity] ?? cell(x.severity);
  table('새 충돌', c.added, '심각도', severity);
  table('해소된 충돌', c.resolved, '심각도', severity);
  // Still in the code as far as anyone knows, only its evidence no longer checks out: not resolved.
  if (c.needsReview?.length) table('근거 확인이 필요해진 충돌', c.needsReview, '사유', () => '근거 코드 확인에 실패해 충돌 수에서 뺐습니다. 담당 개발자 확인 필요');
  table('내용이 바뀐 충돌', c.changed, '바뀐 항목', (x) => (x.fields ?? []).map((f) => CONFLICT_FIELD_LABEL[f] ?? f).join(', '));
  if (c.kept?.length) lines.push('', `그대로 남은 충돌: ${c.kept.join(', ')}`);
  return lines;
}
