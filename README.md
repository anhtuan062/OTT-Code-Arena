# OTT Code Arena

OTT Code Arena là nền tảng thi đấu lập trình Bot tự động cho trò chơi chiến thuật **OTTv2** (Oẳn Tù Tì mở rộng trên bàn cờ $9 \times 9$). Nền tảng cho phép người chơi phát triển chiến thuật bằng C++17 hoặc Python 3, kiểm thử an toàn trong Docker Sandbox biệt lập, đăng ký tham gia các giải đấu quy mô lớn, và theo dõi trực tiếp diễn biến từng nước đi.

---

## 1. Chức năng Cốt lõi

- **Phân quyền người dùng**: Hệ thống chia 2 vai trò tách biệt:
  - `competitor` (Thí sinh): Tạo bot, lưu trữ nhiều phiên bản mã nguồn, kiểm thử chiến thuật (Practice) với Bot hệ thống, gửi yêu cầu tham gia giải đấu.
  - `organizer` (Ban tổ chức): Tạo giải đấu, cấu hình luật/thời gian/giới hạn, xét duyệt đơn nộp bot (kèm kiểm tra preflight), xếp lịch thi đấu, điều phối chạy giải tự động, phân định hòa và công bố kết quả.
- **Hai Thể thức Thi đấu Chính thức**:
  - `single_round_robin`: Thi đấu vòng tròn một lượt (quy mô 2–64 bot).
  - `multi_stage`: Thể thức đa tầng nâng cao (quy mô lên tới 4,096 bot) gồm Vòng sơ loại (Preliminary), Vòng loại khu vực (Regional Qualifiers), Vòng bảng (Group Stage, 4–8 bot/bảng), và Nhánh loại trực tiếp (Knockout Stage).
- **Cấu trúc Loạt trận (Series)**: Hỗ trợ BO1, BO2 (vòng bảng) và BO3 (loại trực tiếp/chung cuộc) với cơ chế đổi bên thi đấu và tự động chọn bố cục bàn cờ tất định từ hạt giống (`seed`).
- **Thực thi An toàn trong Docker Sandbox**: Áp dụng nguyên tắc Fail-Closed. Mã nguồn bot C++17 và Python 3 được cô lập hoàn toàn: ngắt mạng (`--network none`), filesystem chỉ đọc (`--read-only`), tmpfs 10MB `noexec`, quyền non-root, trần RAM 256 MiB, CPU 1.0, tối đa 64 PIDs.
- **Theo dõi Trực tiếp (Live Spectator)**: Người dùng đã đăng nhập có thể xem trực tiếp các trận đấu đang diễn ra thông qua Server-Sent Events (SSE) hoặc HTTP Polling.
- **Hệ thống Phát lại Trận đấu (Replay Engine)**: Xem lại chi tiết từng nước đi, biểu đồ quân cờ và phân tích kết quả. Replay được bảo vệ bằng chữ ký mã băm SHA-256 (`.commit.json`) và tự động xuất bản công khai khi giải đấu kết thúc.
- **Lưu trữ Bền vững & Tự Phục hồi**: Cơ sở dữ liệu SQLite (WAL mode, Schema v9) quản lý tài khoản, phiên làm việc, hàng đợi job thi đấu (`tournament_match_jobs`) và kiểm thực bot preflight; filesystem JSON lưu trữ nguyên tử dữ liệu giải đấu.

---

## 2. Yêu cầu Môi trường

- **Node.js**: Phiên bản 20 trở lên (khuyến nghị Node.js LTS).
- **Docker Desktop**: Đang chạy với Linux containers.
- **Docker Images**: Các image biên dịch và thực thi đã được ghim bằng SHA-256 digest:
  - `BOT_CPP_COMPILER_IMAGE`: Image chứa GCC/G++ C++17.
  - `BOT_CPP_RUNTIME_IMAGE`: Image debian tối giản chạy binary C++.
  - `BOT_PYTHON3_RUNTIME_IMAGE`: Image chứa Python 3.10+.
  - `BOT_DOCKER_IMAGE`: Image sandbox chung.
- **Hệ điều hành**: Windows 10/11 (hỗ trợ các script `.cmd`), Linux hoặc macOS.

---

## 3. Hướng dẫn Khởi chạy Nhanh

### 3.1. Khởi chạy Cục bộ trên Windows (Khuyến nghị)
Sử dụng script tự động kiểm tra Docker, cấu hình biến môi trường, build dự án và khởi động máy chủ:

```bat
run-local.cmd
```

Server sẽ tự động mở tại địa chỉ: `http://localhost:3000`.

### 3.2. Khởi chạy Thủ công bằng Dòng lệnh
```powershell
# 1. Cài đặt các gói phụ thuộc
npm.cmd install

# 2. Build toàn bộ tài nguyên (HTML, Frontend Bundle, TypeScript)
npm.cmd run build

# 3. Cấu hình biến môi trường Production
$env:NODE_ENV = 'production'
$env:EXECUTION_POLICY = 'sandbox-required'
$env:ENABLE_SOURCE_REVISION_EXECUTION = 'true'
$env:BOT_DOCKER_IMAGE = '<image@sha256:...>'
$env:BOT_CPP_COMPILER_IMAGE = '<gcc-image@sha256:...>'
$env:BOT_CPP_RUNTIME_IMAGE = '<debian-image@sha256:...>'
$env:BOT_PYTHON3_RUNTIME_IMAGE = '<python-image@sha256:...>'

# 4. Khởi động server
npm.cmd start
```

*Lưu ý an toàn*: Trong môi trường production, hệ thống từ chối chạy nếu sử dụng tag động như `:latest` hoặc cấu hình thiếu các digest image an toàn.

### 3.3. Khởi chạy Công khai qua Ngrok (Public Access)
```bat
run-public.cmd
```

---

## 4. Lệnh Phát triển và Kiểm thử

```powershell
# Chạy máy chủ phát triển (Watch mode với tsx)
npm.cmd run dev

# Chạy môi trường QA test server
npm.cmd run dev:qa

# Chạy toàn bộ test suite với Vitest
npm.cmd test

# Chạy kiểm thử có theo dõi thay đổi
npm.cmd run test:watch

# Chạy kiểm thử riêng phân hệ Game Engine
npm.cmd run engine:test

# Kiểm tra cú pháp mã nguồn
npm.cmd run lint
```

---

## 5. Cấu trúc Thư mục Dự án

```text
c:\test\
├── engine/              Game Engine: Bàn cờ 9x9, quy tắc Oẳn Tù Tì, thắng/hòa, bot hệ thống
├── bot-protocol/        Định nghĩa giao thức JSON 0.1.0 và kiểm thực dữ liệu (validation)
├── bot-sdk/             Strategy SDK 1.0.0 (C++17, Python 3) và các file template
├── bot-executor/        Thực thi container Docker Sandbox, biên dịch C++, warm container
├── match-runner/        Vòng lặp ván đấu, tính timeout, forfeit, live snapshot và replay
├── tournament/          Tournament Manager, Round-robin, Multi-stage, Dispatcher, Recovery
├── server/              Express 5 REST API, Auth, Session, Preflight, SQLite DB (Version 9)
├── views/               Template giao diện HTML (layout, pages, modals)
├── styles/              Các stylesheet CSS theo component và view
├── js/                  Mã nguồn client modular (auth, tournaments, bots, replay, live, ...)
├── practice/            Dữ liệu các kịch bản chạy thử nghiệm
├── tests/               Test suite tự động cho từng phân hệ (unit, integration, frontend)
├── scripts/             Script đóng gói hệ thống (build-html, build-frontend, start-qa-server)
└── docs/                Tài liệu kỹ thuật chi tiết của hệ thống
```

---

## 6. Tóm tắt Luật chơi OTTv2

- **Bàn cờ**: $9 \times 9$ ô (`a1` đến `i9`).
- **Lực lượng**: Mỗi bên có 9 quân: 3 Búa (`dam`), 3 Bao (`la`), 3 Kéo (`keo`).
- **Di chuyển**: Quân đi 1 ô theo 8 hướng (ngang, dọc, chéo).
- **Ăn quân**: Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa. Ở OTT Standard, quân bị ăn bị loại khỏi bàn cờ. Không được ăn quân cùng phe hoặc cùng loại.
- **Conversion (tùy chọn)**: Khi bật, quân bị ăn giữ nguyên loại và ID, đổi phe rồi được đặt vào ô trống gần ô bị ăn nhất theo khoảng cách Chebyshev. Nếu có nhiều ô cùng khoảng cách, chọn theo thứ tự cố định từ phía trên theo chiều kim đồng hồ; không random, không đặt vào ô đích hoặc ô xuất phát của quân tấn công. Nếu không còn ô hợp lệ, nước ăn không hợp lệ.
- **Điều kiện thắng**:
  1. Đưa một quân bất kỳ của mình tới ô đích: Phe A tới **`i9`**, Phe B tới **`a1`**.
  2. Ăn hết sạch toàn bộ 9 quân của đối phương trên bàn cờ.
- **Điều kiện hòa**: Vượt quá 200 lượt (`turn_limit`), lặp lại thế cờ 3 lần (`repetition`), hoặc cả hai bên chỉ còn cùng một loại quân duy nhất (`insufficient_material`).
- **Xử thua do sự cố (Forfeit)**: Quá thời gian suy nghĩ (timeout), crash, output rỗng, JSON lỗi hoặc nước đi không hợp lệ.

---

## 7. Mục lục Tài liệu Kỹ thuật Chi tiết (`docs/`)

Để tìm hiểu sâu hơn về từng thành phần kiến trúc, vui lòng tham khảo các tài liệu chuyên đề:

1. [Luật chơi OTTv2](docs/game-rules.md): Quy định chi tiết về bàn cờ, nước đi, ăn quân, tính điểm và loạt trận BO1/BO2/BO3.
2. [Giao thức Bot Protocol 0.1.0](docs/bot-protocol.md): Chuẩn JSON giao tiếp qua stdin/stdout giữa Match Runner và Bot.
3. [Strategy SDK 1.0.0](docs/strategy-sdk.md): Hướng dẫn viết hàm `chooseMove` / `choose_move` bằng C++17 và Python 3.
4. [Kiến trúc Hệ thống](docs/architecture.md): Sơ đồ luồng dữ liệu, ranh giới module và thiết kế tổng thể.
5. [Mô hình Dữ liệu](docs/data-model.md): Chi tiết SQLite schema v9 và cấu trúc tệp JSON của giải đấu.
6. [Bot Executor & Sandbox](docs/bot-executor.md): Cơ chế cô lập Docker, quản lý container, biên dịch và cgroups.
7. [Match Runner](docs/match-runner.md): Vòng lặp trận đấu, phát snapshot trực tiếp và xử lý forfeit.
8. [Giải đấu & Live Spectator](docs/tournament-live.md): Vòng đời 7 giai đoạn, thể thức Multi-stage, hàng đợi job và SSE.
9. [Mô hình Bảo mật](docs/security.md): Xác thực session, RBAC, chống CSRF/Path-traversal và chính sách an toàn.
10. [Hướng dẫn Kiểm thử](docs/testing.md): Danh mục test suite Vitest, quy chuẩn an toàn dữ liệu và chạy test Docker.
