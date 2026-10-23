# Kiến trúc hệ thống OTT Code Arena

Tài liệu này mô tả tổng thể kiến trúc phần mềm, các phân hệ thành phần và luồng dữ liệu của nền tảng OTT Code Arena dựa trên mã nguồn thực tế tại repository.

---

## 1. Tổng quan kiến trúc

OTT Code Arena là một **modular monolith** viết bằng **TypeScript** và chạy trên **Node.js 20 trở lên**:

- Các phân hệ Game Engine, Protocol, Bot Executor, Match Runner, Tournament, Server API và giao diện có ranh giới module riêng nhưng được biên dịch và vận hành trong cùng ứng dụng server.
- Mã Bot được chạy trong Linux Docker container với giới hạn tài nguyên, mạng bị tắt, root filesystem chỉ đọc và người dùng non-root. Đây là các lớp giảm thiểu rủi ro, không phải bảo đảm tuyệt đối chống container escape.
- Dữ liệu được lưu kết hợp: SQLite cho dữ liệu quan hệ/hàng đợi và file JSON cho giải, kết quả, replay cùng commit evidence chứa SHA-256.

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
│ - Điều kiện thắng:           │        │ - Artifact reuse, runtime mới  │
│   * goal_reached (i9 / a1)   │        │ - Ràng buộc: --network none,   │
│   * all_pieces_captured      │        │   --read-only, cap-drop=ALL,   │
│ - Hòa: turn_limit,           │        │   limit RAM 256MB / CPU 1.0    │
│   insufficient_material      │        └────────────────────────────────┘
│ - Thua do repetition         │
└──────────────────────────────┘
```

---

## 3. Chi tiết các Phân hệ Chức năng

### 3.1. Phân hệ Game Engine (`engine/`)
Là nơi định nghĩa luật chơi authoritative duy nhất của trò chơi OTTv2:
- **Bàn cờ**: $9 \times 9$ ô, tọa độ đại số từ `a1` đến `i9`.
- **Lực lượng**: Mỗi bên khởi đầu với 9 quân cờ (3 Búa/Đấm `dam`, 3 Bao/Lá `la`, 3 Kéo `keo`). Tài liệu luật dùng tên Đấm, Lá và Kéo; một số nhãn giao diện cũ dùng Búa và Bao cho cùng hai mã quân.
- **Bố cục hạt giống (Seed Layouts)**: `engine/initial-layout.ts` cung cấp 3 biến thể bố cục khởi đầu, được suy ra tất định theo mã hash SHA-256 của ván đấu trong loạt trận BO3.
- **Di chuyển & Ăn quân**: Quân đi 1 ô theo 8 hướng. Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa. Ở OTT Standard, quân bị ăn bị loại khỏi bàn cờ. Khi bật Conversion, quân bị ăn giữ nguyên loại/ID, đổi phe và được đặt vào ô trống gần ô bị ăn nhất theo thứ tự cố định từ phía trên theo chiều kim đồng hồ; không random, không đặt vào goal hoặc ô xuất phát của quân tấn công.
- **Kết thúc ván**: `engine/win.ts` kiểm tra tới ô đích (`i9` cho phe A, `a1` cho phe B), ăn hết quân đối phương, quá giới hạn lượt (mặc định 200) và thiếu lực lượng tiếp tục thi đấu. Engine có nhánh hòa do lặp thế, nhưng luồng Match Runner có thẩm quyền áp dụng luật thua do lặp cho Bot vừa tạo chuỗi lặp.
- **Bot hệ thống**: `engine/system-opponent.ts` vẫn phục vụ luồng trận thử/kiểm thử tương thích. Nút **Chạy thử** trong giao diện chính hiện gọi endpoint kiểm tra một lượt và không dùng Bot hệ thống.

### 3.2. Phân hệ Giao thức Bot (`bot-protocol/`)
Quy chuẩn hóa hợp đồng dữ liệu JSON (`ProtocolVersion = '0.1.0'`) giữa Match Runner và Bot:
- Định nghĩa các interface `BotRequest`, `BotResponse`, `BotPiece`, `BotMoveOption`, `BotError`.
- Kiểm thực phản hồi chặt chẽ (`bot-protocol/validation.ts`): kiểm tra cấu trúc JSON, định dạng tọa độ `^[a-i][1-9]$`, khoảng cách di chuyển và bảo đảm nước đi nằm trong danh sách `legal_moves`.

### 3.3. Phân hệ Thực thi Bot Sandbox (`bot-executor/`)
Chịu trách nhiệm thực thi mã nguồn Bot trong môi trường có các lớp cô lập:
- **`RevisionDockerExecutor`**: Thực thi bot C++17 và Python 3 trong Docker container.
- **Cơ chế biên dịch C++**: Biên dịch tĩnh `-std=c++17 -O2 -pipe -s -static` trong container GCC (`BOT_CPP_COMPILER_IMAGE`), sau đó mount binary sang container runtime debian tối giản (`BOT_CPP_RUNTIME_IMAGE`).
- **Cô lập từng lượt**: Có thể tái sử dụng source/binary đã chuẩn bị trong match scope, nhưng authoritative execution tạo runtime container mới cho mỗi lượt. Cách này ngăn process và `/tmp` ghi được rò sang lượt sau.
- **Giới hạn an toàn**: Container Bot không nối mạng (`--network none`), hệ thống tệp gốc chỉ đọc (`--read-only`), tmpfs 10MB `noexec`, bỏ toàn bộ capabilities, dùng người dùng non-root, trần RAM 256 MiB, CPU 1.0 và tối đa 64 tiến trình.

### 3.4. Phân hệ Trọng tài Ván đấu (`match-runner/`)
- Quản lý vòng lặp ván đấu từ lượt 1 đến tối đa 200 lượt.
- Cấp ngân sách thời gian tối thiểu **5,000 ms** cho mỗi nước đi của bot chạy Docker (`SOURCE_REVISION_MIN_TURN_TIMEOUT_MS`).
- Xử lý các tình huống Forfeit (quá giờ, crash, JSON lỗi, output rỗng, nước đi phạm luật).
- Ghi nhận `LiveMatchSnapshot` phục vụ spectator và phát sinh `MatchReplay` phục vụ xem lại.

### 3.5. Phân hệ Giải đấu (`tournament/`)
Chịu trách nhiệm quản lý toàn bộ vòng đời giải đấu, xếp lịch và tính toán kết quả:
- **Hai thể thức thi đấu**:
  1. `single_round_robin`: Thi đấu vòng tròn tính điểm (tối đa 64 bot).
  2. `multi_stage`: Thể thức nhiều giai đoạn hỗ trợ quy mô tới 4096 Bot (`tournament/multi-stage.ts`), gồm vòng sơ loại, vòng loại khu vực, vòng bảng (mỗi bảng 4–8 Bot) và nhánh loại trực tiếp.
- **Điều phối thực thi công bằng (`FairMatchDispatcher`)**: Kết hợp với bảng SQLite `tournament_match_jobs` để phân bổ trận đấu theo hàng đợi, kiểm soát hạn giữ khóa (lease) và token hàng rào (fencing token) chống chạy trùng lặp.
- **Loạt trận (Series)**: Quản lý BO1, BO2 và BO3 (`tournament/series.ts`), tự động đổi bên ở ván 2 và xác định bên đi trước ở ván 3 theo seed.
- **Commit Coordinator (`commit-coordinator.ts`)**: Ghi nhận kết quả trận đấu nguyên tử (atomic) kèm mã băm SHA-256 (`.commit.json`), bảo đảm tính toàn vẹn khi server gặp sự cố.

### 3.6. Phân hệ Máy chủ API (`server/`)
Xây dựng trên nền tảng **Express 5**:
- Quản lý tài khoản, xác thực mật khẩu bcrypt, phát hành session token qua cookie `HttpOnly` an toàn và xác thực token CSRF trên các request làm thay đổi dữ liệu.
- Phân quyền vai trò: `competitor` (quản lý bot cá nhân, nộp đơn tham gia giải) và `organizer` (tạo giải, duyệt đơn, tạo lịch, chạy giải, công bố kết quả).
- Kiểm tra preflight (`server/bot-preflight.ts`): Tự chuẩn bị và chạy kiểm tra phiên bản mã nguồn trong sandbox trước khi ban tổ chức được phép duyệt hồ sơ hoặc lập lịch. Đây là luồng backend riêng, không đồng nghĩa người chơi đã bấm **Chạy thử** trên UI.
- Live Spectator & Replay Exporter: Cung cấp Server-Sent Events (SSE) và polling để người dùng đủ quyền theo dõi trận đang đấu; replay dành cho người dùng đã xác thực được mở sau khi ban tổ chức công bố kết quả.

### 3.7. Giao diện Người dùng Phía Client (SPA)
Giao diện là Single Page Application viết bằng Vanilla JavaScript ES6+, không dùng framework phía client:
- Mã nguồn module hóa tại thư mục `js/` (`tournaments.js`, `bots.js`, `playground.js`, `practice.js`, `replay.js`, `live.js`, ...) và được đóng gói thành [`app.js`](../app.js) qua `scripts/build-frontend.js`.
- Template giao diện chia thành `views/pages/`, `views/layout/`, `views/modals/` và được biên dịch vào [`index.html`](../index.html) qua `scripts/build-html.js`.
- Bố cục responsive hiển thị tiến trình 7 giai đoạn của giải đấu, sơ đồ bảng đấu và bàn cờ tua trận đấu.
