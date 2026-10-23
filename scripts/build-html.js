import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const templatePath = path.join(root, 'index.html');

const pageParts = [
  ['section', 'auth-screen', 'views/pages/auth.html'],
  ['div', 'dashboard', 'views/pages/dashboard.html'],
  ['div', 'bot-workspace', 'views/pages/bot-workspace.html'],
  ['div', 'bots', 'views/pages/bots.html'],
  ['div', 'tournaments', 'views/pages/tournaments.html'],
  ['div', 'tournament-detail', 'views/pages/tournament-detail.html'],
  ['div', 'replay-view', 'views/pages/replay.html'],
  ['div', 'bot-playground', 'views/pages/bot-playground.html']
  ,['div', 'player-guide', 'views/pages/player-guide.html']
];

function findRootElement(source, tagName, id) {
  const opening = new RegExp(`<${tagName}\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i').exec(source);
  if (!opening) throw new Error(`Could not find <${tagName} id="${id}">`);

  const tagPattern = /<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)(?:\s[^<>]*?)?\/?>/gi;
  tagPattern.lastIndex = opening.index;
  let depth = 0;
  let match;

  while ((match = tagPattern.exec(source))) {
    const token = match[0];
    if (token.startsWith('<!--')) continue;
    const tag = match[1].toLowerCase();
    if (tag !== tagName) continue;

    if (token.startsWith(`</${tagName}`)) {
      depth -= 1;
      if (depth === 0) return source.slice(opening.index, tagPattern.lastIndex);
    } else if (!token.endsWith('/>')) {
      depth += 1;
    }
  }

  throw new Error(`Could not find the closing </${tagName}> for ${id}`);
}

function replaceRootElement(template, tagName, id, replacement) {
  const opening = new RegExp(`<${tagName}\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i').exec(template);
  if (!opening) throw new Error(`Could not find the template node for ${id}`);

  const tagPattern = /<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)(?:\s[^<>]*?)?\/?>/gi;
  tagPattern.lastIndex = opening.index;
  let depth = 0;
  let match;

  while ((match = tagPattern.exec(template))) {
    const token = match[0];
    if (token.startsWith('<!--')) continue;
    const tag = match[1].toLowerCase();
    if (tag !== tagName) continue;

    if (token.startsWith(`</${tagName}`)) {
      depth -= 1;
      if (depth === 0) {
        return template.slice(0, opening.index) + replacement + template.slice(tagPattern.lastIndex);
      }
    } else if (!token.endsWith('/>')) {
      depth += 1;
    }
  }

  throw new Error(`Could not find the template closing </${tagName}> for ${id}`);
}

let output = fs.readFileSync(templatePath, 'utf8');
for (const [tagName, id, relativePath] of pageParts) {
  const sourcePath = path.join(root, relativePath);
  const fragment = fs.readFileSync(sourcePath, 'utf8').trim();
  findRootElement(fragment, tagName, id);
  if (output.includes(`data-page-root="${id}"`)) continue;
  const replacement = `<div class="page-fragment" data-page-fragment="/${relativePath.replaceAll('\\', '/')}" data-page-root="${id}"></div>`;
  output = replaceRootElement(output, tagName, id, replacement);
}

fs.writeFileSync(templatePath, output, 'utf8');
console.log(`Built ${path.relative(root, templatePath)} from ${pageParts.length} page fragments.`);
