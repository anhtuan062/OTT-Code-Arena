import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const readFrontendFile = (file: string) => readFile(resolve(process.cwd(), file), 'utf8');

const frontendFragments = [
  'views/layout/navigation.html',
  'views/pages/auth.html',
  'views/pages/dashboard.html',
  'views/pages/bots.html',
  'views/pages/bot-workspace.html',
  'views/pages/tournaments.html',
  'views/pages/tournament-detail.html',
  'views/pages/replay.html',
  'views/modals/modals.html',
  'views/layout/footer.html',
];

const frontendStylesheets = [
  'style.css',
  'styles/components/app-shell.css',
  'styles/components/editor.css',
  'styles/components/modals.css',
  'styles/views/auth.css',
  'styles/views/bots.css',
  'styles/views/dashboard.css',
  'styles/views/practice.css',
  'styles/views/replay.css',
  'styles/views/tournaments.css',
];

const frontendModules = [
  'constants.js', 'state.js', 'utils.js', 'navigation.js', 'auth.js', 'api.js',
  'dashboard.js', 'bots.js', 'practice.js', 'tournaments.js', 'live.js',
  'replay.js', 'events.js',
];

/**
 * Returns the markup that the page loader assembles at runtime.
 * index.html intentionally contains only fragment placeholders now.
 */
export async function readAssembledFrontendMarkup(): Promise<string> {
  const files = await Promise.all(frontendFragments.map(readFrontendFile));
  return files.join('\n');
}

export async function readAssembledFrontendStyles(): Promise<string> {
  const files = await Promise.all(frontendStylesheets.map(readFrontendFile));
  return files.join('\n');
}

/** Read the authoritative modular sources without depending on generated app.js. */
export async function readAssembledFrontendScript(): Promise<string> {
  const files = await Promise.all(frontendModules.map(file => readFrontendFile(`js/${file}`)));
  return files.join('\n');
}
