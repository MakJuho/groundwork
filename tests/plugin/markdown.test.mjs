import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInline, renderMarkdown, slugify } from '../../plugin/scripts/lib/markdown.mjs';

test('slugify keeps Korean and digits', () => {
  assert.equal(slugify('ORD-007 주문 취소 기간!'), 'ord-007-주문-취소-기간');
});

test('inline: escape, code, bold, link with base, html image becomes iframe', () => {
  assert.equal(renderInline('a < b **굵게** `x<y`'), 'a &lt; b <strong>굵게</strong> <code>x&lt;y</code>');
  assert.equal(renderInline('[문서](spec.md)', 'policy/order'), '<a href="policy/order/spec.md">문서</a>');
  assert.equal(renderInline('[외부](https://a.b)', 'policy/order'), '<a href="https://a.b">외부</a>');
  assert.equal(
    renderInline('![상태 전이도](diagrams/state.html)', 'policy/order'),
    '<iframe class="diagram" src="policy/order/diagrams/state.html" title="상태 전이도" loading="lazy"></iframe><a class="diagram-open" href="policy/order/diagrams/state.html" target="_blank" rel="noopener">새 창에서 크게 보기</a>',
  );
});

test('inline: html image with a disallowed scheme yields no iframe and no link', () => {
  const out = renderInline('![x](javascript:alert.html)');
  assert.equal(out, 'x');
  assert.doesNotMatch(out, /iframe|diagram-open/);
});

test('inline: only http, https, mailto, fragment, root and relative hrefs survive', () => {
  assert.equal(renderInline('[x](javascript:alert)', 'policy/order'), 'x');
  assert.equal(renderInline('[x](JavaScript:alert)'), 'x');
  assert.equal(renderInline('[x](\u0001javascript:alert)'), 'x');
  assert.equal(renderInline('![그림](data:image/svg+xml;base64,PHN2Zz4=)', 'policy/order'), '그림');
  assert.equal(renderInline('![x](vbscript:msgbox.html)', 'policy/order'), 'x');
  assert.equal(renderInline('[h](http://a.b)', 'policy/order'), '<a href="http://a.b">h</a>');
  assert.equal(renderInline('[s](HTTPS://a.b)', 'policy/order'), '<a href="HTTPS://a.b">s</a>');
  assert.equal(renderInline('[m](mailto:a@b.c)', 'policy/order'), '<a href="mailto:a@b.c">m</a>');
  assert.equal(renderInline('[t](#top)', 'policy/order'), '<a href="#top">t</a>');
  assert.equal(renderInline('[abs](/abs)', 'policy/order'), '<a href="/abs">abs</a>');
  assert.equal(renderInline('[up](../policy/x.md)', 'policy/order'), '<a href="policy/order/../policy/x.md">up</a>');
});

test('blocks: heading, paragraph, lists, table, code, quote', () => {
  const md = [
    '# 제목',
    '',
    '첫 줄',
    '둘째 줄',
    '',
    '- 가',
    '- 나',
    '',
    '1. 하나',
    '2. 둘',
    '',
    '| 항목 | 값 |',
    '|---|---|',
    '| 기간 | 7일 |',
    '',
    '```',
    'if (a < b) {}',
    '```',
    '> 확인 필요',
  ].join('\n');
  assert.equal(
    renderMarkdown(md),
    [
      '<h1 id="제목">제목</h1>',
      '<p>첫 줄 둘째 줄</p>',
      '<ul><li>가</li><li>나</li></ul>',
      '<ol><li>하나</li><li>둘</li></ol>',
      '<table><thead><tr><th>항목</th><th>값</th></tr></thead><tbody><tr><td>기간</td><td>7일</td></tr></tbody></table>',
      '<pre><code>if (a &lt; b) {}</code></pre>',
      '<blockquote>확인 필요</blockquote>',
    ].join('\n'),
  );
});

test('inline: images and diagram iframes accept only relative paths', () => {
  assert.equal(renderInline('![x](https://x.example/p.png?d=secret)', 'policy/order'), 'x');
  assert.equal(renderInline('![x](http://x.example/p.png)'), 'x');
  assert.equal(renderInline('![x](//evil.example/a.png)', 'policy/order'), 'x');
  assert.equal(renderInline('![x](/\\evil.example/a.html)', 'policy/order'), 'x');
  assert.equal(renderInline('![x](\\\\evil\\share\\a.png)', 'policy/order'), 'x');
  assert.equal(renderInline('![x](\\x\\a.png)', 'policy/order'), 'x');
  assert.equal(renderInline('![x](/etc/a.png)', 'policy/order'), 'x');
  assert.equal(renderInline('![x](\u0001//evil.example/a.png)', 'policy/order'), 'x');
  assert.equal(renderInline('![그림](img/a.png)', 'policy/order'), '<img src="policy/order/img/a.png" alt="그림">');
  assert.match(renderInline('![d](../order/diagrams/a.html)', 'policy/x'), /<iframe class="diagram" src="policy\/x\/..\/order\/diagrams\/a.html"/);
});

test('inline: network-path links are rejected, other allowed links stay', () => {
  assert.equal(renderInline('[x](//evil.example/a)', 'policy/order'), 'x');
  assert.equal(renderInline('[x](/\\evil.example/a)', 'policy/order'), 'x');
  assert.equal(renderInline('[x](\\\\evil\\share)', 'policy/order'), 'x');
  assert.equal(renderInline('[x](\u0001//evil.example)', 'policy/order'), 'x');
  assert.equal(renderInline('[h](https://a.b/c)', 'policy/order'), '<a href="https://a.b/c">h</a>');
  assert.equal(renderInline('[abs](/abs)', 'policy/order'), '<a href="/abs">abs</a>');
});

test('renderMarkdown maps links to known docs to anchors and prefixes heading ids', () => {
  const docs = new Map([['flows/a/flow.md', 'doc-1']]);
  const html = renderMarkdown('# 정책\n\n[흐름](../../flows/a/flow.md) [절](../../flows/a/flow.md#단계) [위](#정책) [외부](https://a.b) [기타](x.md)', {
    base: 'policy/p',
    idPrefix: 'doc-0-',
    resolveDoc: (p) => docs.get(p),
  });
  assert.equal(html, '<h1 id="doc-0-정책">정책</h1>\n<p><a href="#doc-1">흐름</a> <a href="#doc-1-단계">절</a> <a href="#doc-0-정책">위</a> <a href="https://a.b">외부</a> <a href="policy/p/x.md">기타</a></p>');
});
