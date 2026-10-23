# Triển khai và vận hành

Tài liệu này mô tả những đường triển khai có trong repository. Nó không xác nhận môi trường production, domain, secret hoặc uptime thực tế.

## 1. Docker image ứng dụng

`Dockerfile.app` dùng Node 20 Bookworm Slim được ghim digest, cài dependency, build TypeScript/frontend và chạy `node dist/server/index.js`. Container ứng dụng:

- chạy với `NODE_ENV=production`, `EXECUTION_POLICY=sandbox-required`;
- dùng user không root;
- lưu tournament/SQLite dưới volume data và runtime/artifact dưới volume runtime;
- được Compose đặt root filesystem read-only và tmpfs `/tmp`.

## 2. Docker Compose

### Ứng dụng cơ sở

```bash
docker compose -f docker-compose.yml up --build
```

`docker-compose.yml` publish `${PORT:-3000}:3000`, tạo volume `ott-data` và `ott-runtime`, bật healthcheck HTTP và restart `unless-stopped`. Source revision mặc định tắt.

### Bật source execution

```bash
docker compose -f docker-compose.yml -f docker-compose.execution.yml up --build
```

Override đặt production/sandbox-required, bật source revision, cấu hình compiler/runtime image ghim SHA-256, tăng compile timeout và mount `/var/run/docker.sock`.

> Mount Docker socket là quyền mạnh tương đương điều khiển daemon host. Chỉ dùng trên host dành riêng/được quản trị, hạn chế người có quyền vào container ứng dụng và theo dõi audit log.

Kiểm tra cấu hình trước khi chạy:

```bash
docker compose -f docker-compose.yml -f docker-compose.execution.yml config --quiet
```

## 3. Biến môi trường

### Ứng dụng và dữ liệu

| Biến | Mặc định đáng chú ý | Mục đích |
| --- | --- | --- |
| `PORT` | 3000 | Cổng server |
| `NODE_ENV` | development trong Compose cơ sở | Cookie và policy production |
| `TOURNAMENT_DATA_DIR` | `/app/data/tournaments` trong Compose | Tournament/result/replay files |
| `OTT_DB_PATH` | path do server resolve dưới data nếu không đặt | SQLite |
| `CORS_ORIGIN` | rỗng | Origin được phép; không tự mở wildcard |
| `TRUSTED_PROXY_CIDRS` | rỗng | Chỉ tin forwarded address từ proxy thuộc CIDR cấu hình |

### Thực thi Bot

| Biến | Giá trị/điều kiện |
| --- | --- |
| `EXECUTION_POLICY` | Production source execution phải là `sandbox-required` |
| `ENABLE_SOURCE_REVISION_EXECUTION` | `true` để chạy revision |
| `BOT_DOCKER_IMAGE` | Sandbox base/legacy image ghim digest |
| `BOT_CPP_COMPILER_IMAGE` | GCC image ghim digest |
| `BOT_CPP_RUNTIME_IMAGE` | C++ runtime image ghim digest |
| `BOT_PYTHON3_RUNTIME_IMAGE` | Python runtime image ghim digest |
| `BOT_TRUSTED_IMAGE_REGISTRIES` | Compose mặc định `docker.io,ghcr.io` |
| `BOT_CPP_COMPILE_TIMEOUT_MS` | override execution mặc định 120000 |
| `BOT_CPP_COMPILATION_BACKEND` | `ephemeral-volume` trong ví dụ |
| `BOT_DOCKER_VOLUME_STAGING` | override execution mặc định `true` |
| `OTT_DOCKER_EXECUTION_CONCURRENCY` | Compose cơ sở mặc định 1 |

Artifact cache có `BOT_CPP_EPHEMERAL_ARTIFACT_CACHE`, `BOT_COMPILED_ARTIFACT_CACHE_DIR`, `BOT_COMPILED_ARTIFACT_CACHE_MAX_BYTES` và `BOT_COMPILED_ARTIFACT_CACHE_MAX_ENTRIES`.

### Tournament runtime

- `ENABLE_MULTI_STAGE`
- `OTT_ENABLE_SERIES_SCHEDULER`
- `OTT_SERIES_MATCH_CONCURRENCY` (Compose mặc định 2)
- `OTT_ENABLE_SERIES_CONCURRENCY_2`

Scheduler concurrency không vượt qua Docker limiter/host capacity.

### Tích hợp và endpoint nội bộ

- `GITHUB_TOKEN`: tùy chọn, chỉ phía server.
- `OTT_INTERNAL_ADMIN_TOKEN`: bảo vệ bulk seed endpoint; endpoint còn yêu cầu request loopback/host loopback và các guard QA.
- `SPECTATOR_MAX_REQUESTS_PER_WINDOW`: hạn mức spectator trong cửa sổ 10 giây; code ép tối thiểu 60.

Không commit secret vào `.env.example` hoặc tài liệu.

## 4. Dữ liệu bền vững và backup

- SQLite dùng WAL và foreign keys; chứa users, Bots, revisions, sessions, rate limits, preflight và durable match jobs.
- Tournament repository dùng `TOURNAMENT_DATA_DIR` cho `tournament.json`, result, replay và commit evidence.
- Hai volume Compose phải được backup nhất quán. Chỉ copy một trong hai có thể tạo snapshot không đồng bộ.
- Trước restore, dừng writer; sau restore kiểm tra SQLite integrity và match commit hashes.

Repository có API `DatabaseWrapper.backupTo` nhưng không có lịch backup production tự động được xác minh.

## 5. Cloudflare Pages

`npm run build:public` tạo frontend tĩnh ở `dist/public`. Workflow `.github/workflows/pages-cd.yml` chỉ chạy sau CI thành công trên commit `main` hiện hành và deploy vào Pages project tên `ott-code-arena`.

Function `functions/api/[[path]].ts` proxy `/api/*` tới biến `API_ORIGIN`. Vì vậy:

- Pages không chạy Express, SQLite hoặc Docker executor;
- backend phải tồn tại riêng và cho phép origin tương ứng;
- `API_ORIGIN` là cấu hình deployment, không được hard-code secret;
- build script loại trừ SQLite, `.env`, key và cert khỏi public assets.

Không có bằng chứng trong repository để khẳng định Pages/backend hiện đang deployed hoặc healthy.

## 6. Public access bằng ngrok

`run-public.cmd` là tiện ích Windows cho public tunnel phục vụ local. Đây không phải kiến trúc production và không thay thế TLS/proxy, backup, monitoring hoặc kiểm soát Docker socket.

## 7. Health và shutdown

- Compose healthcheck gọi `GET /`.
- Server xử lý shutdown để dừng nhận việc mới, hủy/đợi execution theo implementation và đóng tài nguyên.
- Organizer có thể đọc queue/metrics API; các endpoint này yêu cầu session organizer nhưng không thay thế hệ thống monitoring ngoài tiến trình.
- Projection cache và live history là process-local; persistence mới là nguồn recovery sau restart.

## 8. Checklist trước triển khai

1. Ghim mọi image production bằng `@sha256:<64 hex>` và chỉ dùng registry tin cậy.
2. Cấp volume riêng, backup/restore thử nghiệm và quyền file tối thiểu.
3. Đặt proxy/CORS/CIDR chính xác; không tin `X-Forwarded-For` từ mọi nguồn.
4. Bảo vệ Docker socket và endpoint nội bộ.
5. Chạy typecheck, build, test phù hợp và Compose config validation.
6. Chạy Docker integration/preflight thật với C++ và Python.
7. Xác minh live/replay và recovery trên môi trường staging.

Xem [Bảo mật](security.md) và [Kiểm thử](testing.md).
