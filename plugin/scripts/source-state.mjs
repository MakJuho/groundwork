#!/usr/bin/env node
// The commit the output folder was last analyzed at (design §4 _data/source-state.json). Partial update
// compares from here.
import path from 'node:path';
import { branch, head, isRepo, remoteUrl } from './lib/git.mjs';
import { writeJsonAtomic } from './lib/jsondir.mjs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';

const args = process.argv.slice(2);
const out = args[0];
if (!out) {
  console.error('usage: source-state.mjs <output-dir> [--record]');
  process.exit(2);
}
const root = assertOutputOutsideTarget(out);
const analyzedAt = new Date().toISOString();
const state = isRepo(root) ? { git: true, repo: remoteUrl(root), branch: branch(root), commit: head(root), analyzedAt } : { git: false, analyzedAt };
if (args.includes('--record')) writeJsonAtomic(path.join(out, '_data', 'source-state.json'), state);
console.log(JSON.stringify(state, null, 2));
