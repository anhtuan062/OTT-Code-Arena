# Hướng dẫn Kiểm thử (Testing Guide)

Tài liệu này quy chuẩn toàn bộ quy trình kiểm thử tự động, cấu trúc test suite và các nguyên tắc bảo vệ an toàn dữ liệu trong nền tảng OTT Code Arena.

---

## 1. Công cụ và Lệnh Kiểm thử Chính

Hệ thống sử dụng **Vitest** làm test runner chính thức kết hợp với TypeScript và ESLint:

### 1.1. Các lệnh kiểm thử cơ bản
```powershell
# Chạy toàn bộ test suite
npm.cmd test

# Chạy kiểm thử có theo dõi thay đổi (Watch mode)
npm.cmd run test:watch

# Chạy kiểm thử đo độ bao phủ mã nguồn (Coverage)
npm.cmd run test:coverage

# Chạy kiểm tra cú pháp và định dạng mã nguồn
npm.cmd run lint

# Build toàn bộ hệ thống (HTML, Bundle JS, TypeScript và alias)
npm.cmd run build
```

### 1.2. Chạy kiểm thử theo từng phân hệ (Scattered Suites)
```powershell
# 1. Kiểm thử Game Engine (Luật chơi, bàn cờ, thắng/hòa)
npx vitest run tests/engine

# 2. Kiểm thử Giao thức Bot Protocol 0.1.0
npx vitest run tests/protocol

# 3. Kiểm thử Bot Executor (Docker sandbox, compiler, runtime)
npx vitest run tests/bot-executor

# 4. Kiểm thử Match Runner (Vòng lặp ván đấu, forfeit, series BO3)
npx vitest run tests/match

# 5. Kiểm thử Tournament Subsystem (Round robin, Multi-stage, Dispatcher, Recovery)
npx vitest run tests/tournament

# 6. Kiểm thử Server API (Auth, Session, Preflight, RBAC, Spectator)
npx vitest run tests/server

# 7. Kiểm thử Frontend SPA Contract & UI
npx vitest run tests/frontend
```

*Lưu ý*: Không ghi số lượng ca kiểm thử cố định trong tài liệu kỹ thuật vì số lượng test case liên tục được bổ sung theo tính năng. Tiêu chí đạt chuẩn chất lượng yêu cầu kết quả trả về mã thoát `0` (PASS) trên toàn bộ suite.

---

## 2. Phạm vi Kiểm thử theo Phân hệ

### 2.1. Phân hệ Game Engine (`tests/engine/`)
- Khởi tạo bàn cờ chuẩn $9 \times 9$, kiểm tra vị trí 18 quân cờ khởi đầu của hai bên.
- Nước đi 8 hướng, cấm đi ra ngoài bàn cờ, cấm đứng yên, cấm đi vào ô có quân cùng màu.
- Quan hệ ăn quân Oẳn Tù Tì: Búa ăn Kéo, Kéo ăn Bao, Bao ăn Búa.
- Điều kiện thắng: Ăn hết toàn bộ quân đối phương; phe A tới ô `i9`; phe B tới ô `a1`.
- Điều kiện hòa: Quá 200 lượt (`turn_limit`); lặp lại thế cờ 3 lần (`repetition`); cả 2 bên chỉ còn cùng 1 loại quân (`insufficient_material`).
- Tính tất định của layout theo hạt giống (`seed`) trong loạt trận BO3.

### 2.2. Phân hệ Giao thức (`tests/protocol/`)
- Tuân thủ cấu trúc JSON schema `0.1.0`.
- Chuyển đổi trạng thái bàn cờ từ tọa độ số nguyên `(row, col)` sang đại số `a1`–`i9` và ngược lại.
- Kiểm thực phản hồi từ Bot: từ chối JSON rỗng, JSON hỏng cú pháp, thiếu trường `move`, tọa độ sai biên, hoặc nước đi không nằm trong danh sách `legal_moves`.

### 2.3. Phân hệ Thực thi Sandbox (`tests/bot-executor/`)
- Môi trường Production bắt buộc chính sách Fail-Closed (`EXECUTION_POLICY=sandbox-required`).
- Kiểm tra tính bất biến của Docker image ghim qua mã băm SHA-256 digest.
- Giới hạn tài nguyên: RAM 256MB, CPU 1.0, PID 64, ngắt mạng `--network none`, rootfs `--read-only`, tmpfs 10MB `noexec`.
- Cơ chế Warm Container: Giữ container sống giữa các lượt đi trong cùng ván đấu, kiểm tra cô lập thư mục `/tmp` giữa các lượt.
- Kiểm tra biên dịch C++17 và timeout biên dịch (mặc định 120s).
- Kiểm tra hủy ván đấu (`abort signal`) và dọn sạch container, volume tạm thời.

### 2.4. Phân hệ Trọng tài và Loạt trận (`tests/match/`)
- Vòng lặp ván đấu, đảm bảo Bot không có quyền quyết định kết quả.
- Ánh xạ chính xác các sự cố sang mã forfeit: `bot_timeout`, `bot_crash`, `bot_invalid_json`, `bot_empty_output`, `bot_illegal_move`.
- Loạt trận BO3: Ván 1 theo bốc thăm, ván 2 đảo bên thi đấu, ván 3 theo seed; dừng sớm khi có bên đạt 2 ván thắng.
- Tạo dữ liệu Replay chính xác: Replay cho phép tua lại từng nước đi và tái tạo đúng `finalState`.

### 2.5. Phân hệ Giải đấu (`tests/tournament/`)
- Thuật toán xếp lịch Vòng tròn một lượt (`single_round_robin`, tối đa 64 bot).
- Thể thức Đa tầng (`multi_stage`, tối đa 4096 bot): Vòng loại, Vòng bảng (Group Stage), Nhánh loại trực tiếp (Knockout), và mô hình Dependency Slot.
- Phân định hòa trong các trận sinh tử (`resolveTiebreaker`).
- Commit Coordinator: Ghi kết quả và replay nguyên tử (atomic) kèm mã băm SHA-256 (`.commit.json`).
- Khả năng phục hồi sự cố: Server restart giữ nguyên kết quả đã commit, reset pairing đang chạy dở dang về trạng thái sẵn sàng để chạy lại mà không bị tính trùng điểm.

### 2.6. Phân hệ Máy chủ và Giao diện (`tests/server/` & `tests/frontend/`)
- Phân quyền nghiêm ngặt giữa `competitor` và `organizer`.
- Xác thực mật khẩu bcrypt, quản lý session cookie `HttpOnly`, `SameSite=Lax`, kiểm tra token `CSRF`.
- Kiểm tra Bot Preflight trước khi Ban tổ chức duyệt đơn đăng ký hoặc lập lịch thi đấu.
- Live Spectator SSE stream và cơ chế fallback Polling kèm `Retry-After`.
- Quyền riêng tư của Replay: Replay chưa công bố chỉ chủ giải được xem; Replay đã công bố mở cho toàn bộ người dùng xác thực.
- Kiểm tra giao diện SPA: Render đúng 7 giai đoạn hiển thị, tương tác bảng đấu và bàn cờ tua trận.

---

## 3. Ràng buộc An toàn khi Kiểm thử Docker

Khi chạy các bài kiểm thử liên quan đến Docker (`tests/bot-executor/`):
- **Image có sẵn**: Chỉ sử dụng các image Docker đã được build hoặc pull sẵn vào máy. Tuyệt đối không để test case tự ý pull image từ Internet trong quá trình chạy test.
- **Không phá hủy môi trường**: Nghiêm cấm chạy các lệnh phá hủy như `docker system prune` hoặc xóa image dùng chung của hệ thống.
- **Xử lý khi thiếu Docker**: Nếu Docker Desktop chưa bật hoặc Linux container không khả dụng, test runner phải báo rõ trạng thái `SKIPPED` hoặc `BLOCKED`, tuyệt đối không giả lập (fake) kết quả thành `PASS`.

---

## 4. Bảo vệ Dữ liệu Thực tế (Data Isolation)

1. **Thư mục dữ liệu riêng biệt**: Các bài kiểm thử tích hợp và kiểm thử giải đấu bắt buộc phải sử dụng thư mục tạm thời (ví dụ: `.qa-data`, `tmp/test-*`) hoặc biến môi trường `TOURNAMENT_DATA_DIR` độc lập.
2. **Không ghi đè dữ liệu Production**: Tuyệt đối không để test case đọc/ghi hoặc xóa các tệp giải đấu trong thư mục thực tế `data/tournaments/`.
3. **Bảo tồn Git Worktree**: Quá trình kiểm thử không được tự ý xóa bỏ hoặc hoàn tác các thay đổi chưa commit của người dùng trong Git working tree.
