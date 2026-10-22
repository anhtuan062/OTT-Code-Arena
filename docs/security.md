# Mô hình An toàn và Bảo mật (Security Architecture)

Tài liệu này mô tả chi tiết các chính sách, cơ chế kiểm soát và giải pháp bảo mật được triển khai trên toàn bộ hệ thống OTT Code Arena.

---

## 1. Mục tiêu và Tài sản Cần Bảo vệ

1. **Hạ tầng Máy chủ và Docker Host**: Ngăn chặn tuyệt đối việc mã nguồn không tin cậy của thí sinh thoát khỏi container (container escape), tấn công mạng nội bộ, hoặc tiêu hao cạn kiệt tài nguyên máy chủ.
2. **Mã nguồn và Chiến thuật của Thí sinh**: Đảm bảo bí mật mã nguồn thuật toán giữa các thí sinh với nhau; không làm lộ mã nguồn qua API, Spectator stream hay Replay.
3. **Tính Toàn vẹn của Kết quả Giải đấu**: Ngăn chặn việc sửa đổi mã nguồn sau khi đã chốt danh sách, chống gian lận trong quá trình thi đấu, và lưu trữ kết quả có chữ ký mã băm chống giả mạo.
4. **Phiên làm việc và Tài khoản Người dùng**: Bảo vệ thông tin đăng nhập, ngăn chặn các cuộc tấn công CSRF, XSS, Brute-force và giả mạo quyền hạn.

---

## 2. Xác thực và Phân quyền (Authentication & Authorization)

Hệ thống triển khai mô hình xác thực dựa trên Cookie Session kết hợp với cơ chế Phân quyền theo vai trò (Role-Based Access Control - RBAC):

### 2.1. Quản lý Mật khẩu và Session
- **Mật khẩu**: Được băm bằng thuật toán `bcrypt` với muối ngẫu nhiên (salt rounds) trước khi lưu vào bảng `users`.
- **Session Token**:
  - Khi đăng nhập, server sinh chuỗi token ngẫu nhiên bảo mật cao (cryptographically secure random bytes).
  - Token được băm bằng SHA-256 (`token_hash`) trước khi lưu vào bảng `sessions` trong SQLite. Server không lưu raw token trong database.
  - Gửi về trình duyệt qua Cookie với các cờ bảo vệ nghiêm ngặt:
    - `HttpOnly`: Ngăn chặn JavaScript phía client truy cập cookie (chống đánh cắp qua tấn công XSS).
    - `SameSite=Lax`: Chống tấn công CSRF xuyên trang.
    - `Secure`: Tự động bật trong môi trường production (chỉ gửi qua HTTPS).
- **Session Expiration**: Token có thời hạn sử dụng (`expires_at`) và thời điểm hoạt động gần nhất (`last_active_at`).

### 2.2. Phòng chống Tấn công CSRF (Cross-Site Request Forgery)
- Mọi session đều được gắn kèm một mã `csrf_token` độc lập.
- Middleware `requireCsrf` ([server/index.ts](file:///c:/test/server/index.ts)) bắt buộc mọi HTTP request có khả năng thay đổi trạng thái hệ thống (`POST`, `PUT`, `PATCH`, `DELETE`) phải gửi kèm header `x-csrf-token` khớp chính xác với `csrf_token` của session hiện tại.

### 2.3. Phân quyền Vai trò (`requireRole`)
Hệ thống định nghĩa 2 vai trò tách biệt rõ ràng thông qua ràng buộc cơ sở dữ liệu `CHECK (role IN ('competitor', 'organizer'))`:
- **`competitor` (Thí sinh)**:
  - Chỉ có quyền xem, tạo, sửa, xóa các Bot và Phiên bản mã nguồn thuộc sở hữu của chính mình (`owner_id === req.auth.id`).
  - Được quyền nộp đơn đăng ký Bot vào các giải đấu đang mở đăng ký.
  - Được quyền chạy thử nghiệm (Practice) Bot cá nhân với Bot hệ thống.
  - Không có quyền duyệt giải, tạo lịch, hoặc chạy giải đấu.
- **`organizer` (Ban tổ chức)**:
  - Quyền tạo giải đấu mới, chỉnh sửa thông tin giải đấu do mình sở hữu.
  - Quyền duyệt/từ chối đơn nộp bot của thí sinh sau khi kiểm tra preflight.
  - Quyền phát sinh lịch thi đấu (sinh vòng bảng/loại trực tiếp), bắt đầu giải, chạy giải và công bố kết quả.
  - Quyền giải quyết hòa phân định (`resolveTiebreaker`) và chạy lại cặp đấu lỗi (`retry`).

---

## 3. Bảo vệ Tính Toàn vẹn Mã nguồn Bot (Source Integrity)

Hệ thống bảo đảm mã nguồn thí sinh nộp vào giải luôn bất biến từ thời điểm nộp đến lúc thi đấu:
1. **Giới hạn Kích thước**: File mã nguồn tải lên tối đa là **64 KiB** (`MAX_SOURCE_SIZE = 64 * 1024`) và bắt buộc phải là chuỗi UTF-8 hợp lệ.
2. **Khóa Mã băm (Digest Pinning)**:
   - Ngay khi nhận file, server tính toán mã băm SHA-256 của nội dung (`source_digest`) và lưu vào bảng `bot_revisions`.
   - File được lưu vào đường dẫn cách ly: `data/tournaments/bot-revisions/<bot-id>/<revision-id>.source`.
3. **Xác minh Kép khi Thực thi**:
   - Trước khi nộp đơn hoặc duyệt bot vào giải, server đọc lại file từ đĩa và kiểm tra lại:
     $$\text{SHA256}(\text{file content}) \equiv \text{source\_digest}$$
   - Nếu phát hiện nội dung file bị sai lệch hoặc can thiệp trên đĩa, hệ thống từ chối ngay lập tức với mã `409 Conflict`.
4. **Kiểm tra Identity của Strategy SDK**:
   - Đối với bot chế độ `strategy`, phiên bản SDK (`sdk_version`) và mã băm của SDK (`sdk_digest`) tại thời điểm tạo phiên bản được đóng băng vào dữ liệu giải đấu. Khi thi đấu, executor kiểm tra tính đồng nhất của SDK để đảm bảo không bị tráo đổi file header/module.

---

## 4. Cô lập Thực thi trong Docker Sandbox (Container Security)

Chính sách bảo mật thực thi bot được định nghĩa tại `bot-executor/`:

### 4.1. Nguyên tắc "Fail-Closed"
- Trong môi trường `production`, hệ thống bắt buộc cấu hình `EXECUTION_POLICY=sandbox-required`.
- Nếu Docker daemon bị tắt, gặp sự cố kết nối, hoặc các image Docker được chỉ định không tồn tại trên máy chủ, server sẽ dừng toàn bộ tiến trình hoặc đánh dấu lỗi pairing. **Tuyệt đối không bao giờ tự ý chuyển sang chạy bot trực tiếp trên Host OS**.
- Chế độ `EXECUTION_POLICY=development` (chạy child process trên host) chỉ dùng cho mục đích phát triển mã nguồn nội bộ tin cậy.

### 4.2. Ràng buộc Image Bất biến (Immutable Image Digests)
- Mọi image Docker trong production đều bắt buộc phải được ghim bằng mã băm SHA-256 cụ thể (ví dụ: `gcc@sha256:7f...`).
- Server từ chối khởi động nếu biến môi trường image sử dụng tag động như `:latest` hoặc không có mã băm sha256.
- Sử dụng cờ `--pull=never` để ngăn chặn việc tự ý kéo image lạ từ Internet về máy chủ trong lúc thi đấu.

### 4.3. Các Lớp Phòng vệ Container (Hardening Flags)
Mỗi container bot khi chạy được áp dụng các cờ an ninh nghiêm ngặt nhất của Docker:
- **`--network none`**: Vô hiệu hóa hoàn toàn card mạng. Bot không thể gửi request HTTP, không thể kết nối socket ra ngoài, không thể quét cổng máy chủ.
- **`--read-only`**: Khóa toàn bộ root filesystem ở chế độ chỉ đọc. Bot không thể ghi đè binary hệ thống, không thể cài cắm malware hay script tự động.
- **`/tmp:rw,noexec,nosuid,size=10m`**: Cấp một thư mục tạm nhỏ 10 MiB dạng tmpfs trong RAM. Cấm chạy file thực thi (`noexec`) và cấm chiếm đặc quyền (`nosuid`).
- **`--security-opt=no-new-privileges:true`**: Chặn hoàn toàn khả năng tiến trình con xin nâng quyền (chống leo thang đặc quyền).
- **`--cap-drop=ALL`**: Thu hồi toàn bộ quyền năng của nhân Linux (Linux capabilities) khỏi container.
- **`--user non-root`**: Ép buộc tiến trình chạy dưới tài khoản người dùng thông thường, không có quyền root.
- **Giới hạn tài nguyên (cgroups)**:
  - RAM: 256 MiB (`--memory 256m`, `--memory-swap 256m`). Tránh bot chiếm cạn kiệt RAM hệ thống.
  - CPU: 1.0 core (`--cpus 1.0`). Tránh bot dùng 100% CPU của máy chủ.
  - Tiến trình: Tối đa 64 PIDs (`--pids-limit 64`). Chống tấn công fork-bomb.
- **Docker Socket Isolation**: Tuyệt đối không bao giờ mount file `/var/run/docker.sock` vào bên trong bất kỳ container nào.

---

## 5. An toàn API và Bảo vệ Dữ liệu Riêng tư

1. **Chống Tấn công Path Traversal**:
   - Mọi mã định danh người dùng truyền qua URL (`tournamentId`, `botId`, `matchId`, `revisionId`) đều được kiểm tra bằng hàm `assertSafeId`:
     ```typescript
     /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
     ```
   - Chặn đứng mọi nỗ lực chèn ký tự `../`, `..\\`, ký tự null byte hoặc symlink để đọc trộm file ngoài phạm vi cho phép.
2. **Chiếu Dữ liệu An toàn cho Khán giả (Spectator Data Sanitization)**:
   - Dữ liệu phát qua Server-Sent Events (Live Stream) và Replay API (`/spectator/...`) được lọc qua hàm chiếu (projection) an toàn:
     - Loại bỏ hoàn toàn: Mã nguồn bot, mã băm storage, cờ biên dịch, log lỗi chi tiết của compiler, stderr của bot, và đường dẫn file nội bộ trên server.
     - Khán giả chỉ nhận được thông tin trận đấu công khai: Tên bot, tên thí sinh, vị trí quân cờ, lượt đấu và thời gian suy nghĩ.
3. **Giới hạn Tần suất (Rate Limiting)**:
   - Bảng SQLite `rate_limits` theo dõi tần suất gọi API theo địa chỉ IP và tài khoản:
     - Đăng ký / Đăng nhập: Chống tấn công vét cạn mật khẩu (Brute-force).
     - Chạy thử (Practice): Chống thí sinh spam yêu cầu biên dịch Docker làm nghẽn server.
     - Spectator polling: Trả về mã lỗi `429 Too Many Requests` kèm header `Retry-After` nếu client polling quá nhanh.
4. **Quyền truy cập Replay theo Giai đoạn**:
   - Khi giải đấu chưa công bố kết quả (`resultsPublishedAt === null`): Chỉ Ban tổ chức sở hữu giải mới có quyền xem replay. Thí sinh và khán giả không thể đọc trộm replay trước khi có thông báo chính thức.
   - Khi giải đấu đã công bố: Replay được mở quyền đọc công khai cho toàn bộ người dùng đã đăng nhập.
