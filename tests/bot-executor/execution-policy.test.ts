import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createExecutor,
  clearExecutorCache,
  getCachedExecutorType,
  getCachedPolicy,
} from '@bot-executor/index.js';

describe('Execution Policy', () => {
  const unavailableDocker = { dockerBinary: '__ott_missing_docker_for_test__' };

  beforeEach(() => {
    clearExecutorCache();
  });

  afterEach(() => {
    clearExecutorCache();
  });

  describe('sandbox-required mode', () => {
    it('should reject child-process executor when sandbox-required', async () => {
      await expect(
        createExecutor({
          type: 'child-process',
          childProcessConfig: { executionPolicy: 'sandbox-required' },
        })
      ).rejects.toThrow('Sandbox-required policy does not allow child-process executor');
    });

    it('should reject auto mode when Docker unavailable and sandbox-required', async () => {
      await expect(
        createExecutor({
          type: 'auto',
          dockerConfig: unavailableDocker,
          childProcessConfig: { executionPolicy: 'sandbox-required' },
        })
      ).rejects.toThrow('Sandbox-required policy but Docker is not available');
    });

    it('should reject explicit docker type when Docker unavailable', async () => {
      await expect(
        createExecutor({
          type: 'docker',
          dockerConfig: { ...unavailableDocker, executionPolicy: 'sandbox-required' },
        })
      ).rejects.toThrow('Docker executor requested but Docker is not available');
    });

    it('should not cache executor when sandbox-required fails', async () => {
      await createExecutor({ type: 'child-process' });
      try {
        await createExecutor({
          type: 'auto',
          dockerConfig: unavailableDocker,
          childProcessConfig: { executionPolicy: 'sandbox-required' },
        });
      } catch {}
      expect(getCachedExecutorType()).toBeNull();
      expect(getCachedPolicy()).toBeNull();
    });

    it('should not silently fall back to child-process in sandbox-required auto mode', async () => {
      let threw = false;
      try {
        await createExecutor({
          type: 'auto',
          dockerConfig: { ...unavailableDocker, image: 'test:latest', executionPolicy: 'sandbox-required' },
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
      expect(getCachedExecutorType()).not.toBe('child-process');
    });
  });

  describe('development mode', () => {
    it('should allow child-process executor in development mode', async () => {
      const executor = await createExecutor({
        type: 'child-process',
        childProcessConfig: { executionPolicy: 'development' },
      });
      expect(executor).toBeDefined();
      expect(executor.getName()).toBe('child-process');
      expect(getCachedPolicy()).toBe('development');
    });

    it('should fall back to child-process when Docker unavailable in development auto mode', async () => {
      const executor = await createExecutor({
        type: 'auto',
        dockerConfig: unavailableDocker,
        childProcessConfig: { executionPolicy: 'development' },
      });
      expect(executor).toBeDefined();
      expect(getCachedExecutorType()).toBe('child-process');
      expect(getCachedPolicy()).toBe('development');
    });

    it('should default to development policy when not specified', async () => {
      const executor = await createExecutor({ type: 'child-process' });
      expect(executor).toBeDefined();
      expect(getCachedPolicy()).toBe('development');
    });
  });

  describe('executor factory cache', () => {
    it('should clear cache correctly', async () => {
      await createExecutor({ type: 'child-process' });
      expect(getCachedExecutorType()).toBe('child-process');
      clearExecutorCache();
      expect(getCachedExecutorType()).toBeNull();
      expect(getCachedPolicy()).toBeNull();
    });
  });

  describe('tournament manager sandbox-required integration', () => {
    it('should propagate sandbox-required failure through createTournamentManager', async () => {
      const { createTournamentManager } = await import('@tournament/manager.js');
      const os = await import('os');
      const path = await import('path');
      const fs = await import('fs/promises');

      const tmpDir = path.join(os.tmpdir(), `ott-policy-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      try {
        await expect(
          createTournamentManager(tmpDir, undefined, 'sandbox-required', {
            dockerConfig: unavailableDocker,
          })
        ).rejects.toThrow();
      } finally {
        clearExecutorCache();
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  });
});
