# OTT Code Arena

OTT Code Arena là hệ thống tổ chức giải đấu chương trình tự động (Bot) cho trò chơi OTTv2 trên bàn cờ 9×9. Người chơi viết Bot bằng C++17 hoặc Python 3, lưu từng phiên bản mã nguồn, chạy thử một lượt, gửi Bot vào giải và theo dõi trận đấu. Ban tổ chức tạo giải, xét hồ sơ, lập lịch, chạy các cặp đấu và công bố kết quả.

Tài liệu này mô tả implementation hiện có trong repository. Nó không xác nhận trạng thái của bất kỳ môi trường production nào.

## Ai sử dụng hệ thống

- **Người chơi (`competitor`):** tạo tài khoản, quản lý Bot và các phiên bản mã nguồn, chạy thử, đăng ký giải, xem lịch, trận trực tiếp và kết quả đã công bố.
- **Ban tổ chức (`organizer`):** tạo và cấu hình giải, duyệt hồ sơ sau bước kiểm tra trước thi đấu (`preflight`), lập lịch, điều phối trận và công bố kết quả.
- **Lập trình viên/người vận hành:** chạy API Express và giao diện web, quản lý SQLite cùng dữ liệu giải trên hệ thống tệp, cấu hình môi trường Docker cô lập và kiểm thử hệ thống.

Tài khoản đăng ký từ giao diện luôn có vai trò `competitor`. Repository có công cụ quản trị để cấp vai trò organizer; giao diện công khai không có chức năng tự nâng quyền.

## Chức năng đã được triển khai

- Đăng ký, đăng nhập bằng session cookie; phân quyền `competitor`/`organizer` và CSRF cho thao tác ghi.
- Quản lý Bot và phiên bản mã nguồn bất biến (revision); chọn phiên bản hiện hành và nhập mã từ kho GitHub công khai.
- Hai môi trường chạy mã nguồn: C++17 (`cpp`) và Python 3 (`python3`). Giao diện tạo Bot mới bằng Strategy SDK; API còn hỗ trợ giao thức trực tiếp `raw`.
- Chạy thử một lượt với thế cờ có sẵn hoặc tùy chỉnh. Luồng chính trên UI không tạo một trận hoàn chỉnh.
- Giải vòng tròn một lượt (`single_round_robin`) và nhiều giai đoạn (`multi_stage`); tiếp nhận hồ sơ, kiểm tra trước thi đấu, lập lịch, loạt BO2/BO3, bảng xếp hạng và điểm dừng thủ công giữa các giai đoạn.
- Theo dõi trực tiếp qua Server-Sent Events (SSE), tự chuyển sang hỏi lại định kỳ (polling) khi cần, xem lại trận (replay) và kiểm soát quyền xem kết quả theo trạng thái công bố.
- SQLite cho tài khoản, Bot, revision, session, rate limit, preflight và match job; filesystem cho tournament, result, replay và commit evidence.
- Docker sandbox fail-closed cho source revision khi dùng policy `sandbox-required`.

Xem giới hạn và điều kiện vận hành tại [Hướng dẫn triển khai](docs/deployment.md) và [Bảo mật](docs/security.md).

## Bắt đầu nhanh

### Dùng giao diện trên Windows

Yêu cầu: Node.js 20+, Docker Desktop đang chạy Linux containers và Docker CLI có trong `PATH`.

```bat
run-local.cmd
```

Script dừng tiến trình đang nghe cổng 3000, kiểm tra Docker, thiết lập các image ghim digest, build ứng dụng và mở server tại <http://localhost:3000>.

### Chạy chế độ phát triển

```powershell
npm.cmd ci
$env:NODE_ENV = 'development'
$env:EXECUTION_POLICY = 'development'
npm.cmd run dev
```

`development` chỉ phù hợp với mã tin cậy. Source revision C++/Python trong luồng giải yêu cầu Docker, `EXECUTION_POLICY=sandbox-required` và `ENABLE_SOURCE_REVISION_EXECUTION=true`.

### Chạy bằng Docker Compose

Chế độ ứng dụng cơ sở:

```powershell
docker compose up --build
```

Bật source execution bằng Docker socket và cấu hình production trong file override:

```powershell
docker compose -f docker-compose.yml -f docker-compose.execution.yml up --build
```

Việc mount `/var/run/docker.sock` trao quyền điều khiển Docker daemon cho container ứng dụng; chỉ dùng trên host được quản trị và đọc [Bảo mật](docs/security.md) trước khi triển khai.

## Kiểm tra dự án

```powershell
npm.cmd exec tsc -- --noEmit
npm.cmd test
npm.cmd run build
docker compose -f docker-compose.yml -f docker-compose.execution.yml config --quiet
```

Một số bộ kiểm thử Docker/stress có điều kiện và không nằm trong mọi lần chạy CI. Script `npm.cmd run lint` có trong `package.json`, nhưng repository hiện không có cấu hình ESLint nên lệnh này chưa phải kiểm tra khả dụng. Danh sách chi tiết ở [Kiểm thử](docs/testing.md).

## Cấu trúc chính

| Thư mục | Trách nhiệm |
| --- | --- |
| `engine/` | Trạng thái bàn cờ, nước đi, ăn quân, Conversion và điều kiện kết thúc |
| `bot-protocol/`, `bot-sdk/` | JSON protocol và Strategy SDK C++/Python |
| `bot-executor/` | Chuẩn bị, biên dịch và chạy Bot trong Docker |
| `match-runner/` | Vòng lặp ván đấu, forfeit, live snapshot và replay |
| `tournament/` | Vòng đời giải, lịch, series, scoring, dispatcher và recovery |
| `server/` | Express API, auth, SQLite và public projection |
| `views/`, `js/`, `styles/` | SPA phía trình duyệt |
| `tests/` | Unit, integration, frontend, Docker và stress tests |

## Tài liệu

### Dành cho người dùng

- [Hướng dẫn sử dụng](docs/user-guide.md)
- [Hướng dẫn người chơi](docs/competitor-guide.md)
- [Hướng dẫn ban tổ chức](docs/organizer-guide.md)
- [Luật OTTv2](docs/game-rules.md)
- [Live, kết quả và replay](docs/match-and-replay.md)
- [Câu hỏi thường gặp](docs/faq.md)

### Dành cho developer và operator

- [Kiến trúc](docs/architecture.md)
- [Phát triển local](docs/development.md)
- [REST API](docs/api.md)
- [Vòng đời giải đấu](docs/tournament-lifecycle.md)
- [Triển khai](docs/deployment.md)
- [Bảo mật](docs/security.md)
- [Mô hình dữ liệu](docs/data-model.md)
- [Bot Executor](docs/bot-executor.md), [Bot Protocol](docs/bot-protocol.md), [Strategy SDK](docs/strategy-sdk.md)
- [Match Runner](docs/match-runner.md), [Tournament & Live internals](docs/tournament-live.md)
- [Kiểm thử](docs/testing.md)

## Giới hạn đã xác minh

- Hệ thống không cung cấp self-service tạo organizer.
- Public GitHub import chỉ đọc repository công khai và ghim source về commit SHA; token server là tùy chọn.
- Kết quả/replay chưa công bố không mở cho competitor; chủ giải vẫn có thể kiểm tra trước khi công bố.
- Cloudflare Pages workflow chỉ triển khai frontend tĩnh và proxy `/api`; backend phải được vận hành riêng qua `API_ORIGIN`.
- Các workflow triển khai trong repository chứng minh quy trình cấu hình, không chứng minh một môi trường production hiện đang hoạt động.
