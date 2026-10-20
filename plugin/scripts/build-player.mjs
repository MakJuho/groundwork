#!/usr/bin/env node
import fs from 'node:fs';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { buildPlayer } from './lib/player-page.mjs';

const [outDir] = process.argv.slice(2);
if (!outDir || !fs.statSync(outDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('usage: build-player.mjs <output-dir>');
  process.exit(2);
}
// Refuses (exit 2) without module-map.json or when OUT is inside the analyzed folder.
assertOutputOutsideTarget(outDir);
const { playerPath, screens, flows } = buildPlayer(outDir);
console.log(`player=${playerPath} screens=${screens} flows=${flows}`);
