import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { indexSpringEndpoints, normalizeUrl } from '../../plugin/scripts/lib/spring-endpoints.mjs';

const ROOT = path.resolve('fixtures/nexacro-shop');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.java') ? [path.join(d, e.name)] : []);

test('indexes class and method mappings', () => {
  const files = walk(path.join(ROOT, 'src/main/java')).map((f) => path.relative(ROOT, f));
  const eps = indexSpringEndpoints(ROOT, files);
  assert.equal(eps.length, 6);
  const save = eps.find((e) => e.url === '/member/save.do');
  assert.equal(save.className, 'MemberController');
  assert.equal(save.method, 'save');
  const src = fs.readFileSync(path.join(ROOT, save.file), 'utf8').split('\n');
  assert.ok(src[save.line - 1].includes('public NexacroResult save('));
  assert.equal(eps.find((e) => e.url === '/order/cancel.do').className, 'OrderController');
});

test('handles value=/path= args, verbs and normalizeUrl', () => {
  assert.equal(normalizeUrl('a//b/'), '/a/b');
  assert.equal(normalizeUrl(''), '/');
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'ep-'));
  fs.writeFileSync(path.join(dir, 'X.java'), `@RestController
@RequestMapping(path = "/x")
public class X {
    @GetMapping(value = "/g")
    public String g() { return ""; }
    @PostMapping("p/")
    public String p() { return ""; }
}
`);
  const eps = indexSpringEndpoints(dir, ['X.java']);
  assert.deepEqual(eps.map((e) => [e.url, e.method, e.line]), [['/x/g', 'g', 5], ['/x/p', 'p', 7]]);
});

test('comments do not confuse class detection', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'ep-'));
  fs.writeFileSync(path.join(dir, 'Y.java'), `/**
 * This class handles things.
 */
@RequestMapping("m")
public class Y {
    // @PostMapping("/ghost")
    @PostMapping("/a")
    public String a() { return ""; }
}
`);
  const eps = indexSpringEndpoints(dir, ['Y.java']);
  assert.deepEqual(eps.map((e) => [e.url, e.className, e.method, e.line]), [['/m/a', 'Y', 'a', 8]]);
});
