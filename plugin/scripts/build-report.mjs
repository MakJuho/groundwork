#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertOutputOutsideTarget } from './lib/paths.mjs';
import { buildReport } from './lib/report.mjs';
import { buildPlayer } from './lib/player-page.mjs';

const [outDir] = process.argv.slice(2);
if (!outDir || !fs.statSync(outDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('usage: build-report.mjs <output-dir>');
  process.exit(2);
}
// Refuses (exit 2) without module-map.json, so build-report never rewrites HTML in an arbitrary folder.
assertOutputOutsideTarget(outDir);
const { indexPath, docs } = buildReport(outDir);
console.log(`index=${indexPath} docs=${docs}`);
// Nexacro projects get the button-first flow player next to the report.
if (fs.existsSync(path.join(outDir, '_data', 'screens.json'))) {
  const { playerPath, screens, flows } = buildPlayer(outDir);
  console.log(`player=${playerPath} screens=${screens} flows=${flows}`);
}
