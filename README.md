# OTT Code Arena

OTT Code Arena là nền tảng tổ chức giải đấu lập trình bot cho trò chơi OTTv2. Người chơi viết chiến thuật bằng C++17 hoặc Python 3, chạy thử trong Docker sandbox, gửi bot tham gia giải và theo dõi trực tiếp hoặc xem lại trận đấu.

## Chức năng chính

- Tài khoản có hai vai trò: `competitor` và `organizer`.
- Người chơi tạo bot, lưu nhiều phiên bản mã nguồn, chọn phiên bản đang dùng và chạy thử với Bot hệ thống.
- Ban tổ chức tạo giải vòng tròn một lượt, duyệt yêu cầu tham gia, chạy giải và công bố kết quả.
- Giải mới tạo qua API sử dụng BO3; dữ liệu cũ không có `bestOf` tiếp tục được đọc như BO1.
- Live spectator dành cho mọi tài khoản đã đăng nhập khi giải đang `running`.
- Replay đã công bố có thể được người dùng đã xác thực xem lại; replay chưa công bố chỉ dành cho chủ giải.
- Trạng thái giải, kết quả, replay, tài khoản, phiên đăng nhập và phiên bản bot được lưu bền vững.

## Yêu cầu môi trường

- Node.js 20 trở lên.
- Docker Desktop đang chạy với Linux containers.
- Các Docker image được ghim bằng digest SHA-256.
- Windows PowerShell hoặc Command Prompt cho các script `.cmd` có sẵn.

## Chạy cục bộ

Cách đơn giản nhất trên Windows:

```bat
run-local.cmd
```

Script sẽ kiểm tra Docker, cấu hình sandbox, build dự án và mở server tại <http://localhost:3000>.

Chạy thủ công:

```powershell
npm.cmd run build
$env:NODE_ENV = 'production'
$env:EXECUTION_POLICY = 'sandbox-required'
$env:ENABLE_SOURCE_REVISION_EXECUTION = 'true'
$env:BOT_DOCKER_IMAGE = '<sandbox-image@sha256:digest>'
$env:BOT_CPP_COMPILER_IMAGE = '<gcc-image@sha256:digest>'
$env:BOT_CPP_RUNTIME_IMAGE = '<debian-image@sha256:digest>'
$env:BOT_PYTHON3_RUNTIME_IMAGE = '<python-image@sha256:digest>'
npm.cmd start
```

Các digest đã xác thực cho môi trường hiện tại được cấu hình trong [run-local.cmd](run-local.cmd). Production từ chối image dùng tag động như `latest` và không tự chuyển sang chạy bot trên host.

Chạy public qua ngrok:

```bat
run-public.cmd
```

## Phát triển và kiểm thử

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
npm.cmd run lint
```

Chạy server phát triển:

```powershell
$env:NODE_ENV = 'development'
$env:EXECUTION_POLICY = 'development'
npm.cmd run dev
```

`development` chỉ phù hợp với mã tin cậy. Chạy phiên bản mã nguồn C++/Python yêu cầu `sandbox-required` và `ENABLE_SOURCE_REVISION_EXECUTION=true`.

## Kiến trúc

```text
engine/          Luật chơi, bàn cờ và Bot hệ thống
bot-protocol/    Giao thức JSON giữa hệ thống và bot
bot-runner/      Bộ chạy tiến trình cũ
bot-executor/    Docker sandbox, biên dịch và thực thi phiên bản mã nguồn
match-runner/    Vòng lặp trận đấu, live snapshot và replay
tournament/      Lịch đấu, BO1/BO3, bảng xếp hạng và persistence
server/          Express API, authentication, authorization và SQLite
practice/        Kịch bản chạy thử
bot-sdk/         Strategy SDK và mẫu C++17/Python 3
tests/           Unit, integration và frontend contract tests
```

Frontend là SPA dùng [index.html](index.html), [style.css](style.css) và [app.js](app.js).

## Luật tóm tắt

- Bàn cờ 9×9; mỗi bên có 9 quân gồm 3 Búa (`dam`), 3 Bao (`la`) và 3 Kéo (`keo`).
- Một quân đi đúng một ô theo tám hướng.
- Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa.
- Bên A thắng khi đến `i9`; bên B thắng khi đến `a1`.
- Một bên cũng thắng khi ăn hết toàn bộ quân đối thủ. Việc chỉ loại hết một loại quân không tạo chiến thắng.
- Hòa khi vượt giới hạn lượt, lặp vị trí ba lần hoặc hai bên chỉ còn cùng một loại quân.
- Bot trả nước đi lỗi, crash hoặc timeout sẽ thua ván theo luật forfeit.

Chi tiết tại [Luật chơi](docs/game-rules.md).

## Thực thi bot

- Runtime hỗ trợ: `cpp` (C++17) và `python3`.
- Mã nguồn tối đa 64 KiB, lưu cùng SHA-256 và thông tin phiên bản.
- Strategy revision chỉ triển khai hàm `chooseMove`/`choose_move`; SDK xử lý stdin/stdout và kiểm tra kết quả.
- C++ được biên dịch trong container riêng với `-std=c++17 -O2 -pipe -s -static`.
- Mỗi match scope tái sử dụng artifact đã chuẩn bị và warm container; artifact được giải phóng khi trận kết thúc.
- Bot mã nguồn có tối thiểu 5 giây runtime mỗi lượt. Biên dịch C++ có timeout riêng, mặc định 120 giây trong cấu hình server hiện tại.

## Dữ liệu và khôi phục

Mặc định dữ liệu nằm tại `data/tournaments`:

- `arena.sqlite`: tài khoản, session, bot, revision và rate limit.
- `<tournament-id>/`: trạng thái giải, kết quả và replay.
- `bot-revisions/`: mã nguồn revision theo bot.

Khi server khởi động lại, pairing đang `in_progress` nhưng chưa hoàn tất được đưa về trạng thái có thể tiếp tục. Kết quả và replay đã hoàn thành được giữ nguyên. Không chỉnh sửa trực tiếp dữ liệu trong thư mục này khi server đang chạy.

## Tài liệu

- [Kiến trúc hệ thống](docs/architecture.md)
- [Luật chơi](docs/game-rules.md)
- [Strategy SDK](docs/strategy-sdk.md)
- [Bot Protocol](docs/bot-protocol.md)
- [Bot Executor](docs/bot-executor.md)
- [Match Runner](docs/match-runner.md)
- [Giải đấu và xem trực tiếp](docs/tournament-live.md)
- [Mô hình dữ liệu](docs/data-model.md)
- [Bảo mật](docs/security.md)
- [Kiểm thử](docs/testing.md)

## Giới hạn hiện tại

- Chỉ hỗ trợ giải vòng tròn một lượt.
- Hàng đợi server chạy tối đa hai tác vụ đồng thời và chứa tối đa 50 tác vụ.
- `failurePolicy` trong luồng giải hiện dùng `forfeit`; `skip_turn` và `retry_once` chưa phải luồng production.
- Dữ liệu tournament trên filesystem và dữ liệu SQLite là hai kho riêng, không tạo thành một transaction chung.
