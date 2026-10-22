import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURES = path.resolve('fixtures');

for (const name of fs.readdirSync(FIXTURES)) {
  const expectedFile = path.join(FIXTURES, name, 'expected-policies.json');
  if (!fs.existsSync(expectedFile)) continue;
  test(`${name}: every anchor occurs exactly once in its file`, () => {
    const { policies } = JSON.parse(fs.readFileSync(expectedFile, 'utf8'));
    assert.ok(policies.length >= 20, `expected >= 20 policies, got ${policies.length}`);
    for (const p of policies) {
      for (const loc of p.locations) {
        const text = fs.readFileSync(path.join(FIXTURES, name, loc.file), 'utf8');
        const count = text.split(loc.anchor).length - 1;
        assert.equal(count, 1, `${p.id} anchor "${loc.anchor}" occurs ${count} times in ${loc.file}`);
      }
    }
  });
}
