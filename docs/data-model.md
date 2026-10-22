# Mô hình Dữ liệu (Data Model)

Hệ thống OTT Code Arena áp dụng kiến trúc **Lưu trữ lai (Hybrid Persistence Layer)**:
1. **SQLite Database** (`server/db.ts`): Lưu trữ dữ liệu quan hệ, tài khoản, phiên làm việc, quyền hạn, hàng đợi thực thi trận đấu và xác thực preflight của bot.
2. **File Repository (JSON Filesystem)** (`tournament/persistence.ts`): Lưu trữ toàn vẹn trạng thái giải đấu, kết quả chi tiết từng trận, dữ liệu replay và biên bản commit băm SHA-256.

---

## 1. Cơ sở Dữ liệu Quan hệ (SQLite)

Cơ sở dữ liệu được quản lý tập trung tại `server/db.ts`, hoạt động ở chế độ `WAL (Write-Ahead Logging)` với `foreign_keys = ON`. Phiên bản schema hiện tại là **Version 9** (`CURRENT_SCHEMA_VERSION = 9`).

### 1.1. Bảng `schema_version`
Theo dõi lịch sử migrate cơ sở dữ liệu.
- `version` (`INTEGER PRIMARY KEY`): Số thứ tự phiên bản schema hiện tại.

### 1.2. Bảng `users`
Lưu trữ thông tin tài khoản người dùng và phân quyền hệ thống.
- `id` (`TEXT PRIMARY KEY`): Mã định danh duy nhất của người dùng.
- `username` (`TEXT NOT NULL UNIQUE`): Tên đăng nhập.
- `password_hash` (`TEXT NOT NULL`): Mật khẩu đã được băm an toàn bằng `bcrypt`.
- `role` (`TEXT NOT NULL DEFAULT 'competitor'`): Vai trò, ràng buộc `CHECK (role IN ('competitor', 'organizer'))`.
- `created_at` (`TEXT NOT NULL`): Thời điểm tạo tài khoản (ISO 8601).
- `last_login_at` (`TEXT`): Thời điểm đăng nhập gần nhất.

### 1.3. Bảng `bots`
Quản lý thực thể Bot của từng thí sinh.
- `id` (`TEXT PRIMARY KEY`): Mã bot.
- `owner_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Khóa ngoại trỏ về chủ sở hữu bot.
- `name` (`TEXT NOT NULL`): Tên hiển thị của bot.
- `command` (`TEXT NOT NULL`): Lệnh thực thi (dành cho bot legacy).
- `args` (`TEXT NOT NULL`): Danh sách tham số dòng lệnh JSON.
- `env` (`TEXT`): Biến môi trường JSON.
- `is_public` (`INTEGER NOT NULL DEFAULT 0`): Trạng thái công khai (0 hoặc 1).
- `registered_at` (`TEXT NOT NULL`): Thời điểm đăng ký bot.
- `current_revision_id` (`TEXT`): Mã phiên bản mã nguồn đang được chọn làm mặc định.
- *Chỉ mục*: `idx_bots_owner ON bots(owner_id)`.

### 1.4. Bảng `bot_revisions`
Lưu trữ các phiên bản mã nguồn bất biến được nộp cho từng bot.
- `revision_id` (`TEXT PRIMARY KEY`): Mã phiên bản (UUID).
- `bot_id` (`TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE`): Khóa ngoại tới bot.
- `owner_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Khóa ngoại tới chủ sở hữu.
- `source_digest` (`TEXT NOT NULL`): Mã băm SHA-256 của file mã nguồn gốc.
- `storage_ref` (`TEXT NOT NULL UNIQUE`): Đường dẫn tương đối lưu trữ file source trên đĩa (`data/tournaments/bot-revisions/<bot-id>/<rev>.source`).
- `runtime_id` (`TEXT NOT NULL`): Ngôn ngữ (`'cpp'` hoặc `'python3'`).
- `source_size` (`INTEGER NOT NULL`): Kích thước mã nguồn tính theo byte (tối đa 64 KiB).
- `label` (`TEXT`): Nhãn phiên bản người dùng đặt (tùy chọn).
- `execution_mode` (`TEXT NOT NULL DEFAULT 'raw' CHECK (execution_mode IN ('raw', 'strategy'))`): Chế độ chạy.
- `sdk_version` (`TEXT`): Phiên bản SDK áp dụng (ví dụ: `'1.0.0'`).
- `sdk_digest` (`TEXT`): Mã băm SHA-256 của bộ file Strategy SDK tại thời điểm lưu.
- `github_repository_url` (`TEXT`): Đường dẫn kho GitHub liên kết (nếu import từ GitHub).
- `github_commit_sha` (`TEXT`): Mã commit SHA của Git (nếu import từ GitHub).
- `created_at` (`TEXT NOT NULL`): Thời điểm tạo phiên bản.
- *Chỉ mục*: `idx_bot_revisions_bot ON bot_revisions(bot_id, created_at DESC)`, `idx_bot_revisions_owner ON bot_revisions(owner_id)`, `idx_bot_revisions_github_commit ON bot_revisions(github_commit_sha)`.

### 1.5. Bảng `sessions`
Quản lý phiên đăng nhập xác thực của người dùng.
- `id` (`TEXT PRIMARY KEY`): Mã session nội bộ.
- `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Khóa ngoại người dùng.
- `token_hash` (`TEXT NOT NULL UNIQUE`): Mã băm SHA-256 của session token gửi qua cookie.
- `csrf_token` (`TEXT NOT NULL`): Token chống tấn công giả mạo yêu cầu (CSRF).
- `created_at` (`TEXT NOT NULL`), `expires_at` (`TEXT NOT NULL`), `last_active_at` (`TEXT NOT NULL`).
- `user_agent` (`TEXT`), `ip` (`TEXT`): Dữ liệu kiểm tra an ninh môi trường client.
- *Chỉ mục*: `idx_sessions_user ON sessions(user_id)`, `idx_sessions_expires ON sessions(expires_at)`.

### 1.6. Bảng `rate_limits`
Bộ đếm chống lạm dụng và giới hạn tần suất gọi API.
- `key` (`TEXT PRIMARY KEY`): Khóa giới hạn (theo IP hoặc cặp User/Endpoint).
- `attempts` (`INTEGER NOT NULL`): Số lần đã gọi trong cửa sổ thời gian.
- `window_start` (`TEXT NOT NULL`): Thời điểm bắt đầu cửa sổ tính toán.
- `locked_until` (`TEXT`): Thời điểm khóa tạm thời nếu vượt ngưỡng.

### 1.7. Bảng `spectator_entitlements`
Quản lý quyền theo dõi trận đấu hoặc xem lại replay dành riêng cho các giải đấu nội bộ.
- `id` (`TEXT PRIMARY KEY`).
- `tournament_id` (`TEXT NOT NULL`), `viewer_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`).
- `granted_by` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`), `granted_at` (`TEXT NOT NULL`).
- `revoked_at` (`TEXT`): Thời điểm thu hồi quyền (nếu có).
- *Ràng buộc*: `UNIQUE (tournament_id, viewer_id)`.

### 1.8. Bảng `bot_preflight_validations`
Theo dõi kết quả kiểm tra môi trường chạy thử của bot trước khi cho phép tham gia giải đấu chính thức.
- `validation_id` (`TEXT PRIMARY KEY`): Mã lượt kiểm tra preflight.
- `revision_id` (`TEXT NOT NULL REFERENCES bot_revisions(revision_id) ON DELETE CASCADE`).
- `source_digest`, `runtime_id`, `execution_mode`, `sdk_version`, `sdk_digest`, `protocol_version`, `checker_version`, `environment_key`.
- `status` (`TEXT NOT NULL CHECK (status IN ('pending', 'passed', 'failed', 'expired'))`): Trạng thái kiểm tra.
- `error_code` (`TEXT`), `diagnostic_json` (`TEXT`): Mã lỗi và dữ liệu chẩn đoán nếu kiểm tra thất bại.
- `requested_at` (`TEXT NOT NULL`), `completed_at` (`TEXT`), `expires_at` (`TEXT`).
- `attempt_count` (`INTEGER NOT NULL DEFAULT 0`), `next_attempt_at` (`TEXT`).
- *Chỉ mục*: `idx_bot_preflight_revision ON bot_preflight_validations(revision_id, requested_at DESC)`.

### 1.9. Bảng `tournament_match_jobs`
Hàng đợi điều phối thực thi trận đấu bền vững, chống trùng lặp và phục hồi lỗi sau sự cố sập server.
- `job_id` (`TEXT PRIMARY KEY`): Mã công việc thực thi.
- `tournament_id` (`TEXT NOT NULL`), `pairing_id` (`TEXT NOT NULL`), `match_id` (`TEXT NOT NULL`).
- `idempotency_key` (`TEXT NOT NULL UNIQUE`): Khóa bảo đảm tính lũy nghiệm (idempotency).
- `status` (`TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))`).
- `attempt_count` (`INTEGER NOT NULL DEFAULT 0`): Số lần đã thử thực thi.
- `lease_owner` (`TEXT`): Định danh worker đang giữ quyền chạy job.
- `lease_expires_at` (`TEXT`): Thời điểm hết hạn giữ khóa của worker.
- `fencing_token` (`INTEGER NOT NULL DEFAULT 0`): Token hàng rào tăng dần để vô hiệu hóa worker cũ nếu quá hạn.
- `last_error` (`TEXT`): Lỗi xảy ra ở lần thử gần nhất.
- `created_at`, `updated_at`, `started_at`, `completed_at`.
- *Ràng buộc & Chỉ mục*: `UNIQUE (tournament_id, pairing_id)`, `idx_match_jobs_claimable ON tournament_match_jobs(status, lease_expires_at, updated_at)`, `idx_match_jobs_tournament ON tournament_match_jobs(tournament_id, status)`.

---

## 2. Hệ thống Tệp Lưu trữ Giải đấu (Tournament Filesystem)

Dữ liệu giải đấu được lưu tại thư mục `<baseDir>/<tournamentId>/`:

```text
data/tournaments/<tournamentId>/
├── tournament.json           # Dữ liệu cốt lõi của giải đấu
├── match-<matchId>.json      # Kết quả persisted của từng trận đấu
├── replay-<matchId>.json     # Dữ liệu replay chi tiết từng nước đi
└── match-<matchId>.commit.json # Bằng chứng commit và mã hash SHA-256
```

### 2.1. Cấu trúc `Tournament` (`tournament.json`)
Đối tượng gốc đại diện cho toàn bộ thông tin và tiến trình giải đấu (`tournament/types.ts`):
- `tournamentId` (`string`): Mã định danh (định dạng `t-<uuid>`).
- `name` (`string`): Tên giải đấu (1 đến 100 ký tự).
- `format` (`'single_round_robin' | 'multi_stage'`): Thể thức thi đấu.
- `status` (`TournamentStatus`): Trạng thái tiến trình gồm:
  `'draft' | 'registration_open' | 'registration_closed' | 'running' | 'completed' | 'cancelled'`
- `participants` (`TournamentParticipant[]`): Danh sách các thí sinh/bot đã được duyệt chính thức.
  - Mỗi phần tử gồm: `participantId` (dạng `p-<requestId>`), `name`, `bot` (`BotDefinition`), `registeredAt`.
- `matchConfig` (`TournamentMatchConfig`): Cấu hình trận đấu:
  - `protocolVersion`: `'0.1.0'`
  - `maxTurns`: Giới hạn số lượt tối đa (mặc định: 200).
  - `turnTimeoutMs`: Timeout mỗi nước đi (mặc định: 2000 ms).
  - `maxStdoutBytes`: Giới hạn stdout (mặc định: 1 MiB).
  - `maxStderrBytes`: Giới hạn stderr (mặc định: 10 MiB).
  - `failurePolicy`: `'forfeit'`.
  - `maxRetries`: `0`.
  - `bestOf`: Số ván trong loạt trận (`1 | 2 | 3`, mặc định tạo mới: 3).
- `scoringConfig` (`TournamentScoringConfig`): Quy tắc điểm:
  - `winPoints`: 3
  - `drawPoints`: 1
  - `lossPoints`: 0
  - `byePoints`: 0
- `schedule` (`TournamentScheduleConfig`): Kế hoạch thời gian:
  - `visibleAt`, `registrationOpensAt`, `registrationClosesAt`.
- `rulesConfig` (`TournamentRulesConfig`): Phiên bản luật:
  - `rulesetId`: `'ott-standard'`
  - `rulesetVersion`: `1`
- `botLimits` (`TournamentBotLimits`): Hạn mức tài nguyên container:
  - `maxSourceBytes` (64 KiB), `memoryLimitMb` (256 MiB), `cpuLimit` (1.0), `maxProcesses` (64).
- `rulesetSnapshot` (`TournamentRulesetSnapshot | null`): Bản sao đóng băng bất biến của toàn bộ cấu hình giải đấu khi mở đăng ký.
- `rounds` (`TournamentRound[]`): Danh sách vòng đấu và các cặp đấu (pairings) cho thể thức Vòng tròn một lượt.
- `stages` (`TournamentStage[]`): Cây giai đoạn nhiều tầng (cho thể thức Multi-stage).
- `standings` (`TournamentStanding[]`): Bảng xếp hạng tổng hợp hiện tại.
- `participationRequests` (`ParticipationRequest[]`): Danh sách đơn đăng ký bot nộp vào giải:
  - `requestId`, `competitorId`, `botId`, `participantName`, `status` (`'pending' | 'approved' | 'rejected' | 'withdrawn'`).
  - `botSnapshot`: Bản chụp bot lúc nộp (gồm revisionId, runtime, sourceDigest, SDK identity).
  - `requestedAt`, `reviewedAt`, `reviewedBy`, `rejectionReason`.
- Mốc thời gian: `createdAt`, `registrationOpenedAt`, `registrationClosedAt`, `startedAt`, `completedAt`, `resultsPublishedAt`.
- Thông tin mô tả: `description`, `organizerInfo`, `contactInfo`, `rulesNotes`, `policyNotes`.

---

## 3. Cấu trúc Mô hình Thể thức Multi-Stage (`tournament/multi-stage.ts`)

Đối với giải đấu thể thức nâng cao `multi_stage`, dữ liệu chia thành các tầng giai đoạn:

```text
TournamentStage (preliminary | group_stage | knockout)
  ├── TournamentRegion[]   (Vòng loại khu vực nếu >200 bot)
  ├── TournamentGroup[]    (Vòng bảng 4-8 bot nếu 4-200 bot)
  │     ├── Rounds[] ──► Pairings[]
  │     └── Standings[]
  └── StageAdvancement     (Quy tắc lấy top N vào vòng sau)
```

- **`StageType`**: `'preliminary'` (vòng sơ loại), `'group_stage'` (vòng bảng), `'knockout'` (nhánh loại trực tiếp).
- **`PairingSlot`**: Mô hình phụ thuộc vị trí linh hoạt:
  - `slotId`: Định danh slot.
  - `sourceType`: `'direct'`, `'bye'`, `'preliminary_winner'`, `'regional_qualifier'`, `'group_rank'`, `'knockout_winner'`.
  - `participantId`: ID bot đã xác định hoặc `null` nếu đang chờ kết quả trận trước.
  - `placeholder`: Nhãn hiển thị tạm thời (ví dụ: `"1st-Group-A"`, `"Winner-M1"`).
- **`TiebreakerResolution`**: Thông tin phân định hòa trong các trận sinh tử:
  - `winner`: `'A'` hoặc `'B'`.
  - `resolvedBy`: Organizer ID thực hiện phân định.
  - `resolvedAt`, `reason`.

---

## 4. Cấu trúc Match Record và Replay

### 4.1. `TournamentMatchRecord` (`match-<matchId>.json`)
Lưu trữ kết quả chính thức đã commit của một cặp đấu (pairing):
- `matchId`, `pairingId`, `participantA`, `participantB`.
- `winner`: `'A' | 'B' | 'draw' | null`.
- `terminationReason`: Nguyên nhân kết thúc ván (`goal_reached`, `all_pieces_captured`, `turn_limit`, `bot_timeout`, `bot_crash`, ...).
- `turnCount`: Tổng số lượt diễn ra.
- `durationMs`: Thời gian thi đấu thực tế.
- `replayRef`: Đường dẫn tham chiếu tới file replay tương ứng.
- `series`: Bản ghi tổng hợp của loạt trận BO3 (`winsA`, `winsB`, danh sách `games: TournamentSeriesGameRecord[]`).

### 4.2. `MatchReplay` (`replay-<matchId>.json`)
Dữ liệu phát lại trận đấu:
- `matchId`, `protocolVersion`.
- `initialState`: Trạng thái bàn cờ ban đầu (vị trí 18 quân cờ).
- `moves`: Danh sách tuần tự tất cả các nước đi đã áp dụng:
  - `turn`, `player` (`'A' | 'B'`), `pieceId`, `from` (`{row, col}`), `to` (`{row, col}`), `captures`.
- `finalState`: Trạng thái bàn cờ lúc kết thúc ván đấu.
- `winner`, `terminationReason`.
- Đối với BO3: Bao gồm `series` envelope chứa các ván con `games` tương ứng.

### 4.3. Bằng chứng Commit (`match-<matchId>.commit.json`)
File đánh dấu hoàn thành và chống giả mạo ghi nhận:
```json
{
  "matchId": "m-xxxx",
  "resultHash": "<SHA-256 của match.json>",
  "replayHash": "<SHA-256 của replay.json>",
  "committedAt": "2026-10-23T..."
}
```
Mỗi khi server khởi động lại hoặc đọc replay từ bộ nhớ đệm (`ReplayReadCache`), hệ thống so khớp lại mã băm để đảm bảo tính toàn vẹn tuyệt đối.
