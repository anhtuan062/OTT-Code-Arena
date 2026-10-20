import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutput = path.join(projectRoot, 'dist', 'public');

const files = ['index.html', 'app.js', 'style.css', 'favicon.svg'];
const directories = [
  ['js/page-loader.js', 'js/page-loader.js'],
  ['styles', 'styles'],
  ['views/pages', 'views/pages'],
];

async function assertFile(relativePath) {
  const source = path.join(projectRoot, relativePath);
  const stat = await fs.stat(source);
  if (!stat.isFile()) throw new Error(`Public frontend asset is not a file: ${relativePath}`);
}

async function copyFile(relativeSource, relativeDestination, output) {
  await assertFile(relativeSource);
  const destination = path.join(output, relativeDestination);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(projectRoot, relativeSource), destination);
}

export async function buildPublicFrontend({ outputDir = defaultOutput } = {}) {
  const output = path.resolve(outputDir);
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });

  for (const file of files) await copyFile(file, file, output);
  for (const [source, destination] of directories) {
    if (source.endsWith('.js')) {
      await copyFile(source, destination, output);
      continue;
    }
    await fs.cp(path.join(projectRoot, source), path.join(output, destination), {
      recursive: true,
      verbatimSymlinks: true,
    });
  }

  const indexPath = path.join(output, 'index.html');
  const index = (await fs.readFile(indexPath, 'utf8'))
    .replace('<head>', '<head><link rel="icon" href="favicon.svg" type="image/svg+xml">');
  await fs.writeFile(indexPath, index, 'utf8');
  const requiredReferences = [
    'style.css',
    'styles/views/replay.css',
    '/js/page-loader.js',
    '/views/pages/auth.html',
    '/views/pages/replay.html',
  ];
  for (const reference of requiredReferences) {
    if (!index.includes(reference)) throw new Error(`index.html is missing frontend reference: ${reference}`);
  }
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPublicFrontend({ outputDir: process.argv[2] || defaultOutput })
    .then(output => console.log(`Built standalone public frontend at ${output}`))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
