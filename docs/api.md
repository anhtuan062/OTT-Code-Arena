# REST API

API được phục vụ dưới `/api`, dùng JSON trừ SSE. Frontend gọi cùng origin; Cloudflare Pages Function có thể proxy đường dẫn này tới backend riêng.

## 1. Authentication, role và CSRF

- Đăng ký/đăng nhập trả `user` và `csrfToken`, đồng thời đặt session cookie HttpOnly, `SameSite=Lax`; `Secure` phụ thuộc HTTPS/proxy tin cậy.
- Mọi endpoint `/api/*` ngoài register/login yêu cầu session, trừ static assets.
- Endpoint ghi có middleware `requireCsrf` yêu cầu `x-csrf-token`.
- Role là `competitor` hoặc `organizer`; ownership Bot/tournament được kiểm tra thêm trong handler/manager.
- Session token chỉ nằm trong cookie; không có Bearer-token API được triển khai.

Ví dụ đăng nhập:

```http
POST /api/auth/login
Content-Type: application/json

{"username":"player_01","password":"a-long-password"}
```

```json
{
  "user": {"id":"…","username":"player_01","role":"competitor"},
  "csrfToken":"…"
}
```

Request ghi tiếp theo phải gửi cookie và header:

```http
x-csrf-token: <csrfToken>
```

## 2. Quy ước response và lỗi

- JSON lỗi có dạng `{"error":"message"}`; một số API trả thêm `code`, `details`, `retryAfterMs` hoặc task metadata.
- `204`: thành công không có body.
- `400`: request/transition không hợp lệ.
- `401`: thiếu hoặc hết session.
- `403`: sai role, CSRF hoặc ownership.
- `404`: không tồn tại; spectator/public API đôi khi dùng 404 để không lộ tài nguyên không được phép xem.
- `409`: xung đột state, execution đang chạy, dữ liệu đang được tham chiếu hoặc publish chưa sẵn sàng.
- `413`: body/source quá lớn.
- `429`: rate limit/capacity; spectator trả `Retry-After`.
- `500`/`502`/`503`: lỗi server, upstream GitHub hoặc shutdown/executor.

Projection tournament dùng validator/ETag trong một số read path; client nội bộ hỗ trợ conditional request. Không giả định mọi endpoint đều trả cùng schema version.

## 3. Catalog endpoint

Ký hiệu: **A** = đã đăng nhập; **C** = competitor; **O** = organizer; **CSRF** = header bắt buộc.

### Authentication

| Method | Path | Quyền | Mục đích |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Công khai | Tạo competitor; username 3–32, mật khẩu 12–128; rate limit 10/15 phút/IP |
| POST | `/api/auth/login` | Công khai | Tạo session; rate limit 5 lần sai/15 phút/IP+username |
| GET | `/api/auth/me` | A | Đọc user hiện tại và CSRF token |
| POST | `/api/auth/logout` | A + CSRF | Xóa session/cookie; trả 204 |

### Bot và source revision

| Method | Path | Quyền | Mục đích |
| --- | --- | --- | --- |
| GET | `/api/bots` | C | Liệt kê Bot thuộc user |
| POST | `/api/bots` | C + CSRF | Tạo Bot |
| GET | `/api/bots/:id` | C owner | Đọc Bot |
| PUT | `/api/bots/:id` | C owner + CSRF | Đổi cấu hình Bot |
| DELETE | `/api/bots/:id` | C owner + CSRF | Xóa nếu không bị tournament/request tham chiếu |
| POST | `/api/bots/:id/revisions` | C owner + CSRF | Lưu revision từ source |
| POST | `/api/bots/:id/revisions/github` | C owner + CSRF | Import public GitHub source và ghim commit |
| GET | `/api/bots/:id/revisions` | C owner | Danh sách metadata revision |
| GET | `/api/bots/:id/revisions/:revisionId` | C owner | Đọc metadata + source sau integrity check |
| POST | `/api/bots/:id/revisions/:revisionId/select` | C owner + CSRF | Chọn revision hiện hành |
| DELETE | `/api/bots/:id/revisions/:revisionId` | C owner + CSRF | Xóa revision nếu không bị tham chiếu và có fallback |
| POST | `/api/bots/:id/revisions/:revisionId/test` | C owner + CSRF | Chạy một lượt với revision đã lưu |
| POST | `/api/bots/draft/test` | C + CSRF | Chạy một lượt với source draft |
| POST | `/api/bots/:id/revisions/:revisionId/test-match` | C owner + CSRF | Endpoint practice match tương thích; UI chính không dùng |
| POST | `/api/bots/draft/test-match` | C + CSRF | Practice match cho draft, endpoint tương thích |

Body tạo Bot:

```json
{"name":"Alpha","command":"python3","args":["main.py"]}
```

`name` tối đa 50; command nằm trong allowlist Node/Python; tối đa 32 args, mỗi arg tối đa 256, không path tuyệt đối/traversal và flag chỉ cho phép `--fast`. Source revision thực tế dùng execution metadata riêng thay vì command legacy.

Body lưu revision:

```json
{
  "source":"…",
  "runtimeId":"python3",
  "executionMode":"strategy",
  "label":"v1"
}
```

`runtimeId` là `cpp` hoặc `python3`; `executionMode` là `raw` hoặc `strategy`; source tối đa 64 KiB UTF-8. Test nhận `scenarioId` hoặc `customPieces` và trả success/move/timings hay diagnostic đã lọc.

### Discovery và tham gia giải

| Method | Path | Quyền | Mục đích |
| --- | --- | --- | --- |
| GET | `/api/tournaments/discoverable` | A | Danh sách public-visible theo projection |
| POST | `/api/tournaments/:id/participation-requests` | C + CSRF | Gửi hồ sơ với Bot/revision |
| GET | `/api/tournaments/:id/participation-requests/mine` | C | Đọc hồ sơ của user trong giải |
| GET | `/api/my/tournaments` | C | Các giải user đã đăng ký/tham gia |
| GET | `/api/my/bot-stats` | C | Thống kê Bot của user từ dữ liệu có quyền xem |

### Quản lý giải

| Method | Path | Quyền | Mục đích |
| --- | --- | --- | --- |
| GET | `/api/tournaments` | O | Danh sách giải owner-scoped |
| POST | `/api/tournaments` | O + CSRF | Tạo giải |
| PATCH | `/api/tournaments/:id` | O owner + CSRF | Cập nhật cấu hình trong state cho phép |
| DELETE | `/api/tournaments/:id` | O owner + CSRF | Xóa giải |
| POST | `/api/tournaments/:id/publish` | O owner + CSRF | Xác thực và công bố kết quả |
| GET | `/api/tournaments/:id/requests` | O owner | Danh sách hồ sơ |
| POST | `/api/tournaments/:id/requests/:requestId/approve` | O owner + CSRF | Duyệt sau preflight |
| GET | `/api/tournaments/:id/requests/:requestId/preflight` | O owner | Đọc trạng thái preflight |
| POST | `/api/tournaments/:id/requests/:requestId/preflight/retry` | O owner + CSRF | Chạy lại preflight |
| POST | `/api/tournaments/:id/requests/:requestId/reject` | O owner + CSRF | Từ chối |
| POST | `/api/tournaments/:id/requests/:requestId/undo` | O owner + CSRF | Hoàn tác quyết định khi hợp lệ |
| POST | `/api/tournaments/:id/register` | O owner + CSRF | Endpoint đăng ký participant trực tiếp/legacy có validation |

Tạo giải tối thiểu:

```json
{"name":"OTT Autumn Cup"}
```

PATCH nhận partial settings mà manager hỗ trợ (schedule, rules, match/scoring, Bot limits). Field cụ thể được validate theo `tournament/types.ts` và state; client không nên gửi lại field chỉ đọc.

### Đọc tiến trình và điều khiển lifecycle

| Method | Path | Quyền | Mục đích |
| --- | --- | --- | --- |
| GET | `/api/tournaments/:id` | A | Owner projection hoặc public-safe projection |
| GET | `/api/tournaments/:id/progress` | A | Progress/state/stage summary |
| GET | `/api/tournaments/:id/pairings` | A | Pairing projection có phân trang/filter theo implementation |
| GET | `/api/tournaments/:id/stages` | A | Stage projection; hỗ trợ `compact=true` |
| POST | `/api/tournaments/:id/action` | O owner + CSRF | Thực hiện lifecycle/background action |
| POST | `/api/tournaments/:id/pairings/:pairingId/retry` | O owner + CSRF | Alias retry/requeue |
| POST | `/api/tournaments/:id/pairings/:pairingId/requeue` | O owner + CSRF | Đưa pairing trở lại queue |
| POST | `/api/tournaments/:id/pairings/:pairingId/rematch` | O owner + CSRF | Chạy lại pairing theo guard |
| POST | `/api/tournaments/:id/pairings/:pairingId/resolve-tiebreaker` | O owner + CSRF | Giải quyết dữ liệu cũ đang ở `pending_tiebreaker`; BO3 mới tự phân định ván 3 hòa |
| GET | `/api/tournaments/:id/standings` | A có quyền | Bảng xếp hạng |
| GET | `/api/tournaments/:id/stats` | A có quyền | Thống kê giải |

Body action:

```json
{"action":"open_registration"}
```

Các action được handler triển khai: `open_registration`, `close_registration`, `generate_schedule`, `start`, `start_next_stage`, `resume`, `resolve_tiebreaker`, `run_all`, `retry_match`, `retry_pairing`, `run_pairing`, `cancel` và `stop_execution`. Các action theo pairing cần `pairingId` phù hợp. `resolve_tiebreaker` là đường tương thích/phục hồi cho pairing đã ở trạng thái chờ phân định, không phải bước bình thường của BO3 mới. Action chạy nền có thể trả task ID; dùng queue endpoint để theo dõi.

### Live, result và replay

| Method | Path | Quyền | Mục đích |
| --- | --- | --- | --- |
| GET | `/api/tournaments/:id/matches/:matchId/live` | O owner | Live projection chi tiết |
| GET | `/api/tournaments/:id/results/:matchId` | A có quyền | Result; competitor nhận public projection |
| GET | `/api/tournaments/:id/spectator/matches/:matchId/live` | A, giải visible/running | Spectator snapshot + history |
| GET | `/api/tournaments/:id/spectator/matches/:matchId/live/stream` | A, giải visible/running | SSE `text/event-stream`, heartbeat 15 giây |
| GET | `/api/tournaments/:id/spectator/matches/:matchId/replay` | A có quyền | Sanitized spectator replay |
| GET | `/api/tournaments/:id/replays/:matchId` | A có quyền | Replay owner/public tùy publication |

Spectator rate limit dùng user + IP + tournament + match trong cửa sổ 10 giây. Public replay/result loại execution provenance và diagnostics; competitor chỉ xem sau publish.

### Vận hành

| Method | Path | Quyền | Mục đích |
| --- | --- | --- | --- |
| GET | `/api/system/queue?id=<taskId>` | O | Queue stats hoặc task status; task phải thuộc giải của organizer |
| GET | `/api/system/metrics` | O | Snapshot metrics process, `Cache-Control: no-store` |
| POST | `/internal/admin/bulk-bot-seed` | Loopback + internal token | QA bulk seed; không phải public API |

Internal bulk seed cố ý không dùng session public nhưng yêu cầu địa chỉ/Host loopback, `OTT_INTERNAL_ADMIN_TOKEN` so sánh constant-time và guard QA/ownership/lifecycle/preflight.

## 4. API không nên dùng trực tiếp từ Bot

Bot không gọi REST API trong trận. Executor tắt network và giao tiếp với Bot qua stdin/stdout JSON protocol. Xem [Bot Protocol](bot-protocol.md).

## 5. Nguồn schema

Tài liệu này là catalog sử dụng. Nguồn implementation:

- route/middleware/status: `server/index.ts`;
- tournament DTO/state: `tournament/types.ts`;
- Bot protocol: `bot-protocol/types.ts`, `bot-protocol/validation.ts`;
- live/replay projection: `server/spectator.ts`;
- persisted schema: [Mô hình dữ liệu](data-model.md).
