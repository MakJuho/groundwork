import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildInventory } from '../../plugin/scripts/lib/inventory.mjs';

const FIXTURES = path.resolve('fixtures');

for (const name of fs.readdirSync(FIXTURES)) {
  const expectedFile = path.join(FIXTURES, name, 'expected-modules.json');
  if (!fs.existsSync(expectedFile)) continue;
  test(`${name}: expected modules list existing files without overlap`, () => {
    const { modules } = JSON.parse(fs.readFileSync(expectedFile, 'utf8'));
    assert.ok(modules.length >= 3, `expected >= 3 modules, got ${modules.length}`);
    const seen = new Set();
    for (const m of modules) {
      for (const f of m.files) {
        assert.ok(fs.existsSync(path.join(FIXTURES, name, f)), `${m.name}: missing ${f}`);
        assert.ok(!seen.has(f), `${f} appears in more than one module`);
        seen.add(f);
      }
    }
  });
}

test('spring-layered is detected as a layered layout', () => {
  assert.equal(buildInventory(path.join(FIXTURES, 'spring-layered')).layout.type, 'layer');
});
