/**
 * Opt-in real Docker smoke test for revision preflight.
 *
 * This suite requires the exact digest-pinned runtime variables from the QA
 * host. It uses only temporary storage and never touches tournament data.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { initializeDatabase, type DatabaseWrapper } from '../../server/db.js';
import { SqlBotPreflightRepository } from '../../server/repositories/bot-preflight-repository.js';
import { BotPreflightService } from '../../server/bot-preflight.js';
import { createRevisionDockerExecutor } from '../../bot-executor/revision-docker-executor.js';
import { configuredRuntimeImageRegistry } from '../../bot-executor/runtime-image-registry.js';
import { getStrategySdkIdentity } from '../../bot-executor/strategy-sdk.js';
import type { SourceRuntimeId } from '../../match-runner/types.js';

const enabled = process.env.OTT_RUN_PREFLIGHT_DOCKER_QA === 'true';
const suite = enabled ? describe : describe.skip;
const requiredEnv = [
  'BOT_TRUSTED_IMAGE_REGISTRIES',
  'BOT_CPP_COMPILER_IMAGE',
  'BOT_CPP_RUNTIME_IMAGE',
  'BOT_PYTHON3_RUNTIME_IMAGE',
] as const;

const sourceFiles: Record<SourceRuntimeId, string> = {
  cpp: 'bot-sdk/templates/cpp17.cpp',
  python3: 'bot-sdk/templates/python3.py',
};

suite('real Bot preflight Docker QA', () => {
  let root: string;
  let db: DatabaseWrapper;
  let executor: ReturnType<typeof createRevisionDockerExecutor>;
  let service: BotPreflightService;

  afterEach(async () => {
    service?.close();
    executor?.close();
    db?.close();
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it.each<SourceRuntimeId>(['cpp', 'python3'])('runs the %s revision through real preflight', async runtimeId => {
    const missing = requiredEnv.filter(name => !process.env[name]?.trim());
    expect(missing, `Missing approved Docker QA configuration: ${missing.join(', ')}`).toEqual([]);
    // Docker Desktop on Windows may not expose the user temp directory as a
    // bind-mount source. Keep this isolated QA workspace inside the project
    // drive and remove it in afterEach; it is never tournament storage.
    root = await fs.mkdtemp(path.join(process.cwd(), '.preflight-docker-qa-'));
    db = await initializeDatabase({ path: path.join(root, 'qa.sqlite') });
    executor = createRevisionDockerExecutor({
      imageRegistry: configuredRuntimeImageRegistry('sandbox-required', process.env),
      executionPolicy: 'sandbox-required',
      workingDirBase: path.join(root, 'work'),
      resourceEnvironment: 'qa',
      storageNamespace: `preflight-qa-${randomUUID().replaceAll('-', '')}`,
      serverInstanceId: `vitest-${process.pid}-${randomUUID().replaceAll('-', '')}`,
      cppCompilationBackend: 'ephemeral-volume',
      defaultPreparationTimeoutMs: 20_000,
      defaultCompileTimeoutMs: 60_000,
      defaultTimeoutMs: 5_000,
    });
    expect(await executor.isAvailable(runtimeId)).toBe(true);
    const source = await fs.readFile(path.resolve(sourceFiles[runtimeId]));
    const sdk = await getStrategySdkIdentity(runtimeId);
    const revisionId = `qa-${runtimeId}`;
    const execution = {
      kind: 'source-revision' as const,
      competitorId: 'preflight-qa-competitor', botId: `preflight-qa-${runtimeId}`,
      revisionId, runtimeId, sourceDigest: createHash('sha256').update(source).digest('hex'),
      executionMode: 'strategy' as const, sdkVersion: sdk.version, sdkDigest: sdk.digest,
    };
    db.prepare('INSERT INTO users (id, username, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)')
      .run('preflight-qa-competitor', `preflight-qa-${runtimeId}`, 'qa', new Date().toISOString(), 'competitor');
    db.prepare('INSERT INTO bots (id, owner_id, name, command, args, registered_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(execution.botId, execution.competitorId, `QA ${runtimeId}`, '', '[]', new Date().toISOString());
    db.prepare(`INSERT INTO bot_revisions
      (revision_id, bot_id, owner_id, source_digest, storage_ref, runtime_id, created_at, source_size, execution_mode, sdk_version, sdk_digest)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(revisionId, execution.botId, execution.competitorId, execution.sourceDigest,
        `qa/${revisionId}`, runtimeId, new Date().toISOString(), source.length,
        execution.executionMode, execution.sdkVersion, execution.sdkDigest);
    service = new BotPreflightService(new SqlBotPreflightRepository(db), executor, async requested => requested.revisionId === revisionId ? source : null);
    service.start(execution);
    const result = await service.wait(execution);
    expect(result?.status, JSON.stringify({ status: result?.status, errorCode: result?.errorCode, diagnostic: result?.diagnostic })).toBe('passed');
    expect(result.diagnostic).toMatchObject({ stage: 'completed' });
  }, 180_000);
});
