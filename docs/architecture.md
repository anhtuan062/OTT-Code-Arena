# Kiến trúc Hệ thống OTT Code Arena

Tài liệu này mô tả tổng thể kiến trúc phần mềm, các phân hệ thành phần và luồng dữ liệu của nền tảng OTT Code Arena dựa trên mã nguồn thực tế tại repository.

---

## 1. Tổng quan Kiến trúc

OTT Code Arena được thiết kế theo mô hình **Modular Monolith** viết bằng **TypeScript** chạy trên nền tảng **Node.js (>= 20)**:
- **Tập trung và Nhất quán**: Toàn bộ các phân hệ (Game Engine, Protocol, Bot Executor, Match Runner, Tournament Subsystem, Server API, và Giao diện người dùng) được phân định ranh giới module rõ ràng nhưng cùng được biên dịch và vận hành trong một tiến trình server duy nhất.
- **Bảo mật Đa tầng**: Mã nguồn bot không tin cậy của thí sinh bị cô lập hoàn toàn trong Linux Docker Container với chính sách hạn chế tài nguyên nghiêm ngặt, cách ly mạng và chạy dưới quyền non-root.
- **Lưu trữ Lai (Hybrid Persistence)**: Kết hợp giữa SQLite (dữ liệu quan hệ, tài khoản, phiên làm việc, hàng đợi job) và File Repository (dữ liệu JSON giải đấu, kết quả trận đấu và file Replay được ký băm SHA-256).

---

## 2. Sơ đồ Kiến trúc Tổng thể

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        TRÌNH DUYỆT (Client SPA)                        │
│         HTML5 / CSS3 / ES Modules (views/, styles/, js/ -> app.js)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST / SSE (Live Stream)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        EXPRESS SERVER (server/)                        │
│  - Authentication (bcrypt) & Session Management (Cookie HttpOnly)      │
│  - Phân quyền theo vai trò: 'competitor' & 'organizer'                 │
│  - CSRF Protection & Rate Limiting                                     │
│  - Bot Preflight Validator (Kiểm tra môi trường bot trước khi duyệt)   │
│  - Spectator Live Projection & Public Replay Exporter                  │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │                                          │
               ▼                                          ▼
┌──────────────────────────────┐        ┌────────────────────────────────┐
│   SQLITE DATABASE (db.ts)    │        │ TOURNAMENT SUBSYSTEM           │
│ Schema Version 9 (WAL Mode)  │        │ (tournament/)                  │
│ - users, sessions            │        │ - Tournament Manager           │
│ - bots, bot_revisions        │        │ - Format Generators:           │
│ - rate_limits                │        │   * single_round_robin         │
│ - spectator_entitlements     │        │   * multi_stage (Vòng loại,    │
│ - bot_preflight_validations  │        │     Vòng bảng, Knockout)       │
│ - tournament_match_jobs      │        │ - Fair Match Dispatcher        │
└──────────────┬───────────────┘        │ - Commit Coordinator           │
               │                        │ - Persistence Layer (Lock File)│
               │                        └───────────────┬────────────────┘
               │ Hàng đợi job thi đấu                   │
               └───────────────────────┬────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      MATCH RUNNER (match-runner/)                      │
│  - Điều phối vòng lặp ván đấu (Turns 1 -> maxTurns)                    │
│  - Khởi tạo Game Engine & Bố cục quân khởi đầu (Initial Layouts)       │
│  - Phát snapshot trực tiếp (LiveMatchSnapshot) cho người xem           │
│  - Quản lý loạt trận (Series: BO1, BO2, BO3) & Xử thua do lỗi Bot      │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │                                          │
               ▼                                          ▼
┌──────────────────────────────┐        ┌────────────────────────────────┐
│    GAME ENGINE (engine/)     │        │   BOT EXECUTOR (bot-executor/) │
│ - Trạng thái bàn cờ 9x9      │        │ - Revision Docker Executor     │
│ - Luật Oẳn Tù Tì (dam,la,keo)│        │ - GCC C++17 Compiler Container │
│ - Nước đi hợp lệ 8 hướng     │        │ - Python 3 Runtime Container   │
│ - Điều kiện thắng:           │        │ - Warm Container Reuse         │
│   * goal_reached (i9 / a1)   │        │ - Ràng buộc: --network none,   │
│   * all_pieces_captured      │        │   --read-only, cap-drop=ALL,   │
│ - Điều kiện hòa:             │        │   limit RAM 256MB / CPU 1.0    │
│   * turn_limit, repetition,  │        └────────────────────────────────┘
│     insufficient_material    │
└──────────────────────────────┘
```

---

## 3. Chi tiết các Phân hệ Chức năng

### 3.1. Phân hệ Game Engine (`engine/`)
Là nơi định nghĩa luật chơi authoritative duy nhất của trò chơi OTTv2:
- **Bàn cờ**: $9 \times 9$ ô, tọa độ đại số từ `a1` đến `i9`.
- **Lực lượng**: Mỗi bên khởi đầu với 9 quân cờ (3 Búa `dam`, 3 Bao `la`, 3 Kéo `keo`).
- **Bố cục hạt giống (Seed Layouts)**: `engine/initial-layout.ts` cung cấp 3 biến thể bố cục khởi đầu, được suy ra tất định theo mã hash SHA-256 của ván đấu trong loạt trận BO3.
- **Di chuyển & Ăn quân**: Quân đi 1 ô theo 8 hướng. Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa. Ở OTT Standard, quân bị ăn bị loại khỏi bàn cờ. Khi bật Conversion, quân bị ăn giữ nguyên loại/ID, đổi phe và được đặt vào ô trống gần ô bị ăn nhất theo thứ tự cố định từ phía trên theo chiều kim đồng hồ; không random, không đặt vào goal hoặc ô xuất phát của quân tấn công.
- **Phân định Thắng/Hòa**: `engine/win.ts` kiểm tra điều kiện tới ô đích (`i9` cho phe A, `a1` cho phe B), ăn hết toàn bộ quân đối phương, quá giới hạn lượt (mặc định 200), lặp lại thế cờ 3 lần, hoặc thiếu lực lượng tiếp tục thi đấu.
- **Bot Hệ thống**: `engine/system-opponent.ts` cung cấp bot mẫu dùng cho màn hình Chạy thử (Practice).

### 3.2. Phân hệ Giao thức Bot (`bot-protocol/`)
Quy chuẩn hóa hợp đồng dữ liệu JSON (`ProtocolVersion = '0.1.0'`) giữa Match Runner và Bot:
- Định nghĩa các interface `BotRequest`, `BotResponse`, `BotPiece`, `BotMoveOption`, `BotError`.
- Kiểm thực phản hồi chặt chẽ (`bot-protocol/validation.ts`): kiểm tra cấu trúc JSON, định dạng tọa độ `^[a-i][1-9]$`, khoảng cách di chuyển và bảo đảm nước đi nằm trong danh sách `legal_moves`.

### 3.3. Phân hệ Thực thi Bot Sandbox (`bot-executor/`)
Chịu trách nhiệm thực thi mã nguồn bot của thí sinh một cách an toàn tuyệt đối:
- **`RevisionDockerExecutor`**: Thực thi bot C++17 và Python 3 trong Docker container.
- **Cơ chế biên dịch C++**: Biên dịch tĩnh `-std=c++17 -O2 -pipe -s -static` trong container GCC (`BOT_CPP_COMPILER_IMAGE`), sau đó mount binary sang container runtime debian tối giản (`BOT_CPP_RUNTIME_IMAGE`).
- **Cơ chế Warm Container**: Duy trì container chạy ngầm trong phạm vi cả trận đấu (`match scope`), gửi dữ liệu qua stdin và nhận nước đi từ stdout để loại bỏ overhead khởi tạo lại container mỗi lượt.
- **Giới hạn an toàn**: Cách ly mạng hoàn toàn (`--network none`), hệ thống tệp chỉ đọc (`--read-only`), tmpfs 10MB `noexec`, drop toàn bộ capabilities, non-root user, trần RAM 256 MiB, CPU 1.0, tối đa 64 tiến trình.

### 3.4. Phân hệ Trọng tài Ván đấu (`match-runner/`)
- Quản lý vòng lặp ván đấu từ lượt 1 đến tối đa 200 lượt.
- Cấp ngân sách thời gian tối thiểu **5,000 ms** cho mỗi nước đi của bot chạy Docker (`SOURCE_REVISION_MIN_TURN_TIMEOUT_MS`).
- Xử lý các tình huống Forfeit (quá giờ, crash, JSON lỗi, output rỗng, nước đi phạm luật).
- Ghi nhận `LiveMatchSnapshot` phục vụ spectator và phát sinh `MatchReplay` phục vụ xem lại.

### 3.5. Phân hệ Giải đấu (`tournament/`)
Chịu trách nhiệm quản lý toàn bộ vòng đời giải đấu, xếp lịch và tính toán kết quả:
- **Hai thể thức thi đấu**:
  1. `single_round_robin`: Thi đấu vòng tròn tính điểm (tối đa 64 bot).
  2. `multi_stage`: Thể thức chuyên nghiệp nâng cao hỗ trợ quy mô tới 4096 bot (`tournament/multi-stage.ts`), gồm Vòng sơ loại (Preliminary), Vòng loại khu vực (Regional Qualifiers), Vòng bảng (Group Stage, mỗi bảng 4–8 bot), và Nhánh loại trực tiếp (Knockout Stage).
- **Điều phối thực thi công bằng (`FairMatchDispatcher`)**: Kết hợp với bảng SQLite `tournament_match_jobs` để phân bổ trận đấu theo hàng đợi, kiểm soát hạn giữ khóa (lease) và token hàng rào (fencing token) chống chạy trùng lặp.
- **Loạt trận (Series)**: Quản lý BO1, BO2 và BO3 (`tournament/series.ts`), tự động đổi bên ở ván 2 và xác định bên đi trước ở ván 3 theo seed.
- **Commit Coordinator (`commit-coordinator.ts`)**: Ghi nhận kết quả trận đấu nguyên tử (atomic) kèm mã băm SHA-256 (`.commit.json`), bảo đảm tính toàn vẹn khi server gặp sự cố.

### 3.6. Phân hệ Máy chủ API (`server/`)
Xây dựng trên nền tảng **Express 5**:
- Quản lý tài khoản, xác thực mật khẩu bcrypt, phát hành session token qua cookie `HttpOnly` an toàn và xác thực token CSRF trên các request làm thay đổi dữ liệu.
- Phân quyền vai trò: `competitor` (quản lý bot cá nhân, nộp đơn tham gia giải) và `organizer` (tạo giải, duyệt đơn, tạo lịch, chạy giải, công bố kết quả).
- Kiểm tra Preflight (`server/bot-preflight.ts`): Bắt buộc bot phải chạy thử thành công trong môi trường kiểm tra trước khi Ban tổ chức phê duyệt đơn đăng ký hoặc lập lịch thi đấu.
- Live Spectator & Replay Exporter: Cung cấp Server-Sent Events (SSE) và polling để khán giả theo dõi trực tiếp các trận đang đấu, đồng thời trích xuất replay công khai cho cộng đồng sau khi giải hoàn tất.

### 3.7. Giao diện Người dùng Phía Client (SPA)
Xây dựng theo mô hình Single Page Application không sử dụng framework cồng kềnh (Vanilla JavaScript ES6+):
- Mã nguồn module hóa tại thư mục `js/` (`tournaments.js`, `bots.js`, `playground.js`, `practice.js`, `replay.js`, `live.js`, ...) và được đóng gói thành file bundle duy nhất [app.js](file:///c:/test/app.js) thông qua `scripts/build-frontend.js`.
- Template giao diện chia thành các phân đoạn trong `views/pages/`, `views/layout/`, `views/modals/` và được biên dịch vào [index.html](file:///c:/test/index.html) thông qua `scripts/build-html.js`.
- Bố cục responsive hiển thị tiến trình 7 giai đoạn của giải đấu, sơ đồ bảng đấu và bàn cờ tua trận đấu.
