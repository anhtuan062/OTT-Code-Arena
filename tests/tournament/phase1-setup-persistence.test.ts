import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileTournamentRepository } from '@tournament/persistence.js';
import { TournamentManager } from '@tournament/manager.js';
import type { MatchExecutor } from '@tournament/executor.js';
import type { Tournament } from '@tournament/types.js';

describe('Phase 1 Tournament Setup & Configuration Persistence', () => {
  let testDir: string;
  let repo: FileTournamentRepository;
  let manager: TournamentManager;

  const mockExecutor: MatchExecutor = {
    executeMatch: async () => {
      throw new Error('Not implemented in persistence tests');
    },
  };

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `ott-p1-setup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(testDir, { recursive: true });
    repo = new FileTournamentRepository({ baseDir: testDir });
    manager = new TournamentManager({
      repository: repo,
      executor: mockExecutor,
      enableMultiStage: true,
    });
  });

  afterEach(async () => {
    repo.close?.();
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('creates tournament in draft status with default configuration', async () => {
    const res = await manager.createTournament('t-draft-1', 'Giải đấu Mùa Xuân 2026', 'multi_stage');
    expect(res.success).toBe(true);
    expect(res.data?.status).toBe('draft');
    expect(res.data?.name).toBe('Giải đấu Mùa Xuân 2026');
    expect(res.data?.format).toBe('multi_stage');
  });

  it('updates and persists tournament metadata in draft status across disk reloads', async () => {
    await manager.createTournament('t-draft-persist', 'Tên Ban Đầu', 'multi_stage');

    const updateRes = await manager.updateTournamentDetails('t-draft-persist', {
      name: 'OTT Arena Championship 2026',
      description: 'Giải đấu quy tụ các bot hàng đầu tranh tài trên bàn cờ 9x9.',
      organizerInfo: 'Ban Tổ Chức AI Club',
      contactInfo: 'contact@ottarena.vn',
      rulesNotes: 'Mỗi đội tham gia cần xác nhận tài khoản trước 24h.',
      policyNotes: 'Không sử dụng thư viện ngoài danh mục cho phép.',
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.data?.name).toBe('OTT Arena Championship 2026');
    expect(updateRes.data?.description).toBe('Giải đấu quy tụ các bot hàng đầu tranh tài trên bàn cờ 9x9.');
    expect(updateRes.data?.organizerInfo).toBe('Ban Tổ Chức AI Club');
    expect(updateRes.data?.contactInfo).toBe('contact@ottarena.vn');
    expect(updateRes.data?.rulesNotes).toBe('Mỗi đội tham gia cần xác nhận tài khoản trước 24h.');
    expect(updateRes.data?.policyNotes).toBe('Không sử dụng thư viện ngoài danh mục cho phép.');

    // Verify persistence directly from raw disk read
    const reloaded = await repo.load('t-draft-persist');
    expect(reloaded).not.toBeNull();
    expect(reloaded?.name).toBe('OTT Arena Championship 2026');
    expect(reloaded?.description).toBe('Giải đấu quy tụ các bot hàng đầu tranh tài trên bàn cờ 9x9.');
    expect(reloaded?.organizerInfo).toBe('Ban Tổ Chức AI Club');
    expect(reloaded?.contactInfo).toBe('contact@ottarena.vn');
    expect(reloaded?.rulesNotes).toBe('Mỗi đội tham gia cần xác nhận tài khoản trước 24h.');
    expect(reloaded?.policyNotes).toBe('Không sử dụng thư viện ngoài danh mục cho phép.');
  });

  it('validates tournament name length and rejects empty name', async () => {
    await manager.createTournament('t-draft-val', 'Tên Hợp Lệ', 'single_round_robin');

    const emptyRes = await manager.updateTournamentDetails('t-draft-val', {
      name: '   ',
    });
    expect(emptyRes.success).toBe(false);
    expect(emptyRes.error).toContain('Tournament name must be between 1 and 100 characters');

    const tooLongRes = await manager.updateTournamentDetails('t-draft-val', {
      name: 'A'.repeat(101),
    });
    expect(tooLongRes.success).toBe(false);
    expect(tooLongRes.error).toContain('Tournament name must be between 1 and 100 characters');
  });

  it('preserves backward compatibility with legacy string argument for updateTournamentDetails', async () => {
    await manager.createTournament('t-draft-legacy', 'Tên Cũ', 'single_round_robin');

    const res = await manager.updateTournamentDetails('t-draft-legacy', 'Tên Mới');
    expect(res.success).toBe(true);
    expect(res.data?.name).toBe('Tên Mới');
  });

  it('enforces lifecycle locking: allows editing during draft and registration_open, freezes once closed', async () => {
    await manager.createTournament('t-lifecycle-lock', 'Giải Đấu Vòng Đời', 'single_round_robin');

    // 1. Allowed in draft
    const draftUpdate = await manager.updateTournamentDetails('t-lifecycle-lock', {
      name: 'Giải Đấu Bản Nháp Đã Sửa',
      description: 'Mô tả bản nháp',
    });
    expect(draftUpdate.success).toBe(true);

    // 2. Open registration
    const openRes = await manager.openRegistration('t-lifecycle-lock');
    expect(openRes.success).toBe(true);
    expect(openRes.data?.status).toBe('registration_open');

    // Allowed in registration_open for non-breaking info
    const regOpenUpdate = await manager.updateTournamentDetails('t-lifecycle-lock', {
      description: 'Cập nhật mô tả trong lúc đăng ký mở',
      contactInfo: 'hotline@ottarena.vn',
    });
    expect(regOpenUpdate.success).toBe(true);

    // 3. Close registration
    const closeRes = await manager.closeRegistration('t-lifecycle-lock');
    expect(closeRes.success).toBe(true);
    expect(closeRes.data?.status).toBe('registration_closed');

    // 4. Strictly locked once registration is closed
    const lockedUpdate = await manager.updateTournamentDetails('t-lifecycle-lock', {
      name: 'Cố Gắng Sửa Khi Đã Khóa',
    });
    expect(lockedUpdate.success).toBe(false);
    expect(lockedUpdate.error).toContain('Cannot edit: tournament status is registration_closed');
  });
});

