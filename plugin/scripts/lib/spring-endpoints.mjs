// Spring 컨트롤러의 URL 표: 클래스 경로 + 메서드 경로 → 클래스.메서드.
import fs from 'node:fs';
import path from 'node:path';
import { maskCode } from './nexacro.mjs';

export function normalizeUrl(u) {
  const s = ('/' + String(u ?? '')).replace(/\/{2,}/g, '/');
  return s.length > 1 ? s.replace(/\/$/, '') : s;
}

const MAPPING_RE = /@(?:Request|Post|Get|Put|Delete)Mapping\b(?:\s*\(([^)]*)\))?/g;

// 어노테이션 괄호 안의 첫 문자열 인자 (또는 value=/path=)
function firstPath(args) {
  if (!args) return '';
  const m = /(?:\b(?:value|path)\s*=\s*)?(?:\{\s*)?"([^"]*)"/.exec(args);
  return m ? m[1] : '';
}

const METHOD_RE = /^\s*(?:(?:public|protected|private|static|final)\s+)*[\w<>\[\],.? ]+?\s+(\w+)\s*\(/;

export function indexSpringEndpoints(root, javaFiles) {
  const out = [];
  for (const file of javaFiles) {
    const text = maskCode(fs.readFileSync(path.join(root, file), 'utf8'), { strings: false });
    const lines = text.split('\n');
    const classIdx = text.search(/\b(?:class|interface)\s+\w+/);
    if (classIdx < 0) continue;
    const className = /\b(?:class|interface)\s+(\w+)/.exec(text.slice(classIdx))[1];
    let base = '';
    const head = text.slice(0, classIdx);
    const cm = [...head.matchAll(MAPPING_RE)].filter((m) => m[0].startsWith('@RequestMapping')).pop();
    if (cm) base = firstPath(cm[1]);
    const lineOf = (i) => text.slice(0, i).split('\n').length;
    for (const m of text.slice(classIdx).matchAll(MAPPING_RE)) {
      const at = classIdx + m.index;
      // 어노테이션 뒤 첫 메서드 선언 줄 (다른 어노테이션 줄은 건너뜀)
      let ln = lineOf(at + m[0].length);
      let method = null;
      for (; ln <= lines.length; ln++) {
        const l = lines[ln - 1];
        const rest = ln === lineOf(at + m[0].length) ? l.slice(l.indexOf(m[0]) + m[0].length) : l;
        if (!rest.trim() || rest.trim().startsWith('@')) continue;
        const mm = METHOD_RE.exec(rest);
        method = mm ? mm[1] : null;
        break;
      }
      if (!method) continue;
      out.push({ url: normalizeUrl(base + '/' + firstPath(m[1])), className, method, file, line: ln });
    }
  }
  return out;
}
