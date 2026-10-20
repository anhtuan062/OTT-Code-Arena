import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { closeServer, isDirectExecution, resolveCompiledArtifactCacheConfig, startServer } from '../../server/index.js';

const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
const children: ReturnType<typeof spawn>[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    if (!child.killed) child.kill();
  }
});

function waitForOutput(child: ReturnType<typeof spawn>, text: string, timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const check = () => {
      if (output.includes(text)) {
        clearTimeout(timer);
        resolve(output);
      }
    };
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out waiting for "${text}". Output: ${output}`));
    }, timeoutMs);
    child.stdout?.on('data', chunk => {
      output += chunk.toString();
      check();
    });
    child.stderr?.on('data', chunk => {
      output += chunk.toString();
      check();
    });
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise(resolve => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    child.once('exit', code => resolve(code));
  });
}

describe('server startup', () => {
  it('keeps compiled-artifact caching disabled by default and enables bounded local configuration explicitly', () => {
    expect(resolveCompiledArtifactCacheConfig({})).toMatchObject({
      cppEphemeralArtifactCache: false,
      compiledArtifactCacheMaxBytes: 512 * 1024 * 1024,
      compiledArtifactCacheMaxEntries: 128,
    });
    expect(resolveCompiledArtifactCacheConfig({
      BOT_CPP_EPHEMERAL_ARTIFACT_CACHE: 'true',
      BOT_COMPILED_ARTIFACT_CACHE_DIR: 'C:\\qa-cache',
      BOT_COMPILED_ARTIFACT_CACHE_MAX_BYTES: '536870912',
      BOT_COMPILED_ARTIFACT_CACHE_MAX_ENTRIES: '128',
    })).toEqual({
      cppEphemeralArtifactCache: true,
      compiledArtifactCacheDir: 'C:\\qa-cache',
      compiledArtifactCacheMaxBytes: 536870912,
      compiledArtifactCacheMaxEntries: 128,
    });
  });

  it('detects direct execution using portable module identity', () => {
    const modulePath = path.resolve('dist/server/index.js');
    expect(isDirectExecution(pathToFileURL(modulePath).href, modulePath)).toBe(true);
    expect(isDirectExecution(pathToFileURL(modulePath).href, path.resolve('server/other.js'))).toBe(false);
    if (process.platform === 'win32') {
      expect(isDirectExecution('file:///C:/test/dist/server/index.js', 'C:\\test\\dist\\server\\index.js')).toBe(true);
    }
  });

  it('imports without starting a listener', async () => {
    const child = spawn(process.execPath, [tsxCli, '-e', "import('./server/index.ts').then(() => console.log('imported'))"], {
      cwd: path.resolve('.'),
      env: { ...process.env, NODE_ENV: 'test', EXECUTION_POLICY: 'development' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    const output = await waitForOutput(child, 'imported');
    expect(output).toContain('imported');
    await new Promise<void>((resolve, reject) => {
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Import exited with ${code}`)));
    });
  });

  it('starts directly and serves HTTP requests', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-startup-'));
    const port = await new Promise<number>((resolve, reject) => {
      const probe = createServer().listen(0, () => {
        const address = probe.address();
        probe.close(() => typeof address === 'object' && address ? resolve(address.port) : reject(new Error('No probe port')));
      });
      probe.on('error', reject);
    });
    const child = spawn(process.execPath, [tsxCli, 'server/index.ts'], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        NODE_ENV: 'development',
        EXECUTION_POLICY: 'development',
        PORT: String(port),
        TOURNAMENT_DATA_DIR: dataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    try {
      const output = await waitForOutput(child, `Server listening on http://localhost:${port}`);
      expect(output).toContain('Tournament Manager initialized with development policy');
      const response = await fetch(`http://localhost:${port}/`);
      expect(response.status).toBe(200);
    } finally {
      child.kill();
      await waitForExit(child);
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  }, 15_000);

  it('fails before listening for invalid startup configuration', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-invalid-startup-'));
    const port = 39_876;
    const child = spawn(process.execPath, [tsxCli, 'server/index.ts'], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        EXECUTION_POLICY: 'development',
        PORT: String(port),
        TOURNAMENT_DATA_DIR: dataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    try {
      const output = await waitForOutput(child, 'Failed to start server: Production requires EXECUTION_POLICY=sandbox-required');
      expect(output).not.toContain('Server listening');
      expect(await waitForExit(child)).toBe(1);
    } finally {
      if (!child.killed) child.kill();
      await waitForExit(child);
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  }, 15_000);

  it('supports programmatic startup and shutdown', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-programmatic-startup-'));
    const previousDataDir = process.env.TOURNAMENT_DATA_DIR;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousPolicy = process.env.EXECUTION_POLICY;
    process.env.NODE_ENV = 'test';
    process.env.EXECUTION_POLICY = 'development';
    process.env.TOURNAMENT_DATA_DIR = dataDir;
    try {
      const server = await startServer(0);
      expect(server.listening).toBe(true);
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await closeServer();
    } finally {
      if (previousDataDir === undefined) delete process.env.TOURNAMENT_DATA_DIR;
      else process.env.TOURNAMENT_DATA_DIR = previousDataDir;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousPolicy === undefined) delete process.env.EXECUTION_POLICY;
      else process.env.EXECUTION_POLICY = previousPolicy;
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  }, 15_000);

  it('uses an isolated relative data directory and rejects a file path', async () => {
    const relativeDir = `temp-startup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const absoluteDir = path.resolve(relativeDir);
    const previousDataDir = process.env.TOURNAMENT_DATA_DIR;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousPolicy = process.env.EXECUTION_POLICY;
    process.env.NODE_ENV = 'test';
    process.env.EXECUTION_POLICY = 'development';
    process.env.TOURNAMENT_DATA_DIR = relativeDir;
    try {
      await startServer(0).then(server => new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      }));
      await closeServer();
      expect((await fs.stat(path.join(absoluteDir, 'arena.sqlite'))).isFile()).toBe(true);
      await fs.rm(absoluteDir, { recursive: true, force: true });

      const invalidPath = path.join(os.tmpdir(), `ott-startup-file-${Date.now()}`);
      await fs.writeFile(invalidPath, 'not a directory');
      try {
        process.env.TOURNAMENT_DATA_DIR = invalidPath;
        await expect(startServer(0)).rejects.toThrow();
      } finally {
        await closeServer();
        await fs.rm(invalidPath, { force: true });
      }
    } finally {
      if (previousDataDir === undefined) delete process.env.TOURNAMENT_DATA_DIR;
      else process.env.TOURNAMENT_DATA_DIR = previousDataDir;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousPolicy === undefined) delete process.env.EXECUTION_POLICY;
      else process.env.EXECUTION_POLICY = previousPolicy;
      await fs.rm(absoluteDir, { recursive: true, force: true });
    }
  }, 15_000);

  it('F-01: fails startup on storage ownership contention before executing Docker orphan recovery or writing leases', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-f01-startup-'));
    const workDir = path.join(dataDir, '.source-execution');
    const { StorageOwnership, StorageOwnershipError } = await import('../../tournament/ownership.js');

    // Process A holds storage ownership
    const storageOwnership = new StorageOwnership(dataDir);
    await storageOwnership.acquire();

    const previousDataDir = process.env.TOURNAMENT_DATA_DIR;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousPolicy = process.env.EXECUTION_POLICY;
    const previousSourceExec = process.env.ENABLE_SOURCE_REVISION_EXECUTION;
    const previousWorkDir = process.env.BOT_EXECUTION_WORKDIR;
    const previousBotImage = process.env.BOT_DOCKER_IMAGE;
    const previousCppCompiler = process.env.BOT_CPP_COMPILER_IMAGE;
    const previousCppRuntime = process.env.BOT_CPP_RUNTIME_IMAGE;
    const previousPython3Runtime = process.env.BOT_PYTHON3_RUNTIME_IMAGE;
    const previousTrustedRegistries = process.env.BOT_TRUSTED_IMAGE_REGISTRIES;

    const digest = (name: string) => `ghcr.io/ott-code-arena/${name}@sha256:${'a'.repeat(64)}`;
    process.env.TOURNAMENT_DATA_DIR = dataDir;
    process.env.NODE_ENV = 'test';
    process.env.EXECUTION_POLICY = 'sandbox-required';
    process.env.ENABLE_SOURCE_REVISION_EXECUTION = 'true';
    process.env.BOT_EXECUTION_WORKDIR = workDir;
    process.env.BOT_DOCKER_IMAGE = digest('bot');
    process.env.BOT_CPP_COMPILER_IMAGE = digest('cpp-compiler');
    process.env.BOT_CPP_RUNTIME_IMAGE = digest('cpp-runtime');
    process.env.BOT_PYTHON3_RUNTIME_IMAGE = digest('python3-runtime');
    process.env.BOT_TRUSTED_IMAGE_REGISTRIES = 'ghcr.io';

    try {
      // Start server should fail because storage is already owned by storageOwnership
      await expect(startServer(0)).rejects.toThrow(StorageOwnershipError);

      // Verify that Docker ownership directory was NEVER created or populated with leases
      const ownerLeaseDir = path.join(workDir, '.revision-owners');
      let leaseExists = false;
      try {
        const files = await fs.readdir(ownerLeaseDir);
        leaseExists = files.length > 0;
      } catch {
        leaseExists = false;
      }
      expect(leaseExists).toBe(false);
    } finally {
      await closeServer();
      await storageOwnership.release();

      if (previousDataDir === undefined) delete process.env.TOURNAMENT_DATA_DIR;
      else process.env.TOURNAMENT_DATA_DIR = previousDataDir;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousPolicy === undefined) delete process.env.EXECUTION_POLICY;
      else process.env.EXECUTION_POLICY = previousPolicy;
      if (previousSourceExec === undefined) delete process.env.ENABLE_SOURCE_REVISION_EXECUTION;
      else process.env.ENABLE_SOURCE_REVISION_EXECUTION = previousSourceExec;
      if (previousWorkDir === undefined) delete process.env.BOT_EXECUTION_WORKDIR;
      else process.env.BOT_EXECUTION_WORKDIR = previousWorkDir;
      if (previousBotImage === undefined) delete process.env.BOT_DOCKER_IMAGE;
      else process.env.BOT_DOCKER_IMAGE = previousBotImage;
      if (previousCppCompiler === undefined) delete process.env.BOT_CPP_COMPILER_IMAGE;
      else process.env.BOT_CPP_COMPILER_IMAGE = previousCppCompiler;
      if (previousCppRuntime === undefined) delete process.env.BOT_CPP_RUNTIME_IMAGE;
      else process.env.BOT_CPP_RUNTIME_IMAGE = previousCppRuntime;
      if (previousPython3Runtime === undefined) delete process.env.BOT_PYTHON3_RUNTIME_IMAGE;
      else process.env.BOT_PYTHON3_RUNTIME_IMAGE = previousPython3Runtime;
      if (previousTrustedRegistries === undefined) delete process.env.BOT_TRUSTED_IMAGE_REGISTRIES;
      else process.env.BOT_TRUSTED_IMAGE_REGISTRIES = previousTrustedRegistries;

      await fs.rm(dataDir, { recursive: true, force: true });
    }
  }, 15_000);
});
