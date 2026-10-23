import { describe, expect, it } from 'vitest';
import { configWithResourceLimits } from '../../bot-executor/revision-docker-executor.js';
import type { RevisionDockerExecutorConfig } from '../../bot-executor/revision-docker-executor.js';

describe('tournament source runtime limits', () => {
  const base = {
    memoryLimit: '256m',
    cpuLimit: 1,
    pidsLimit: 64,
  } as RevisionDockerExecutorConfig;

  it('clamps Docker resources to the tournament policy and never raises system defaults', () => {
    const limited = configWithResourceLimits(base, {
      maxMemoryBytes: 128 * 1024 * 1024,
      maxCpuPercent: 50,
      maxProcesses: 8,
    });
    expect(limited.memoryLimit).toBe(`${128 * 1024 * 1024}b`);
    expect(limited.cpuLimit).toBe(0.5);
    expect(limited.pidsLimit).toBe(8);

    const bounded = configWithResourceLimits(base, {
      maxMemoryBytes: 512 * 1024 * 1024,
      maxCpuPercent: 200,
      maxProcesses: 128,
    });
    expect(bounded.memoryLimit).toBe(`${256 * 1024 * 1024}b`);
    expect(bounded.cpuLimit).toBe(1);
    expect(bounded.pidsLimit).toBe(64);
  });
});
