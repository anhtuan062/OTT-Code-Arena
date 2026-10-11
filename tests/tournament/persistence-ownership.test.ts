import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileTournamentRepository } from '@tournament/persistence.js';
import { StorageOwnership } from '@tournament/ownership.js';

const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');

describe('Tournament storage ownership', () => {
  let directory: string;
  let child: ReturnType<typeof spawn> | undefined;

  afterEach(async () => {
    if (child && child.exitCode === null) child.kill();
    if (child && child.exitCode === null) {
      await new Promise<void>(resolve => child!.once('exit', () => resolve()));
    }
    child = undefined;
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  it('rejects a second repository instance and releases ownership orderly', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-owner-'));
    const first = new FileTournamentRepository({ baseDir: path.join(directory, '.') });
    const second = new FileTournamentRepository({ baseDir: directory });

    await first.initialize();
    await expect(second.initialize()).rejects.toThrow('already owned');

    first.close();
    await second.initialize();
    second.close();
  });

  it('detects a released ownership connection before allowing a write', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-owner-loss-'));
    const ownership = new StorageOwnership(directory);
    await ownership.acquire();
    ownership.release();

    expect(() => ownership.assertHeld()).toThrow('ownership is not held');
  });

  it('releases ownership after the owning process exits', async ({ skip }) => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-owner-process-'));
    const script = [
      "import { FileTournamentRepository } from './tournament/persistence.ts';",
      "const repository = new FileTournamentRepository({ baseDir: process.env.OWNER_DIR });",
      "await repository.initialize();",
      "console.log('owned');",
      "setInterval(() => {}, 1000);",
    ].join('\n');
    child = spawn(process.execPath, [tsxCli, '-e', script], {
      cwd: path.resolve('.'),
      env: { ...process.env, OWNER_DIR: directory },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const childStarted = await new Promise<boolean>((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ownership: ${text}`)), 10_000);
      child!.stdout?.on('data', chunk => {
        text += chunk.toString();
        if (text.includes('owned')) {
          clearTimeout(timer);
          resolve(true);
        }
      });
      child!.stderr?.on('data', chunk => {
        text += chunk.toString();
        if (text.includes('uv_os_get_passwd') && text.includes('ENOMEM')) {
          clearTimeout(timer);
          resolve(false);
        }
      });
      child!.once('error', error => { clearTimeout(timer); reject(error); });
    });
    if (!childStarted) {
      child.kill();
      if (child.exitCode === null) await new Promise<void>(resolve => child!.once('exit', () => resolve()));
      child = undefined;
      skip('Child processes cannot start in this environment: uv_os_get_passwd returned ENOMEM');
      return;
    }

    const blocked = new FileTournamentRepository({ baseDir: directory });
    await expect(blocked.initialize()).rejects.toThrow('already owned');
    child.kill();
    await new Promise<void>(resolve => child!.once('exit', () => resolve()));
    child = undefined;

    const recovered = new FileTournamentRepository({ baseDir: directory });
    await recovered.initialize();
    recovered.close();
    blocked.close();
  }, 20_000);
});
