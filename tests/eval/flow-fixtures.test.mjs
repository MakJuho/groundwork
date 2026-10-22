import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURES = path.resolve('fixtures');

for (const name of fs.readdirSync(FIXTURES)) {
  const expectedFile = path.join(FIXTURES, name, 'expected-flows.json');
  if (!fs.existsSync(expectedFile)) continue;
  test(`${name}: every flow step anchor occurs exactly once in its file`, () => {
    const { flows } = JSON.parse(fs.readFileSync(expectedFile, 'utf8'));
    assert.ok(flows.length >= 1);
    for (const flow of flows) {
      for (const s of flow.steps) {
        const text = fs.readFileSync(path.join(FIXTURES, name, s.file), 'utf8');
        const count = text.split(s.anchor).length - 1;
        assert.equal(count, 1, `${s.id} anchor "${s.anchor}" occurs ${count} times in ${s.file}`);
      }
    }
  });
}
