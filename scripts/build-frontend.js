// build-frontend.js: bundles js/ modules into app.js
import fs from 'fs';
import path from 'path';

const moduleFiles = [
  'constants.js',
  'state.js',
  'utils.js',
  'navigation.js',
  'auth.js',
  'api.js',
  'dashboard.js',
  'bots.js',
  'practice.js',
  'tournaments.js',
  'live.js',
  'replay.js',
  'events.js'
];

console.log('Building frontend bundle app.js from js/ modules...');

let bundle = '/* OTT Code Arena - Consolidated Client Application Bundle */\n/* Generated from modular source files in js/ */\n\n';

for (const file of moduleFiles) {
  const filePath = path.join('js', file);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing module: ${filePath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf8').trim();
  bundle += `\n/* ==================== MODULE: ${file} ==================== */\n`;
  bundle += content + '\n';
}

fs.writeFileSync('app.js', bundle, 'utf8');
console.log(`app.js successfully built! Total lines: ${bundle.split('\n').length}`);

