# Mô hình an toàn và bảo mật

Tài liệu này mô tả các biện pháp bảo mật có bằng chứng trong mã nguồn. Các biện pháp cô lập làm giảm rủi ro nhưng không phải cam kết rằng container hoặc host không thể bị khai thác.

---

## 1. Mục tiêu và tài sản cần bảo vệ

1. **Máy chủ và Docker host:** giảm khả năng mã không tin cậy truy cập mạng, ghi vào hệ thống tệp hoặc làm cạn tài nguyên; giới hạn hậu quả nếu Bot lỗi hoặc có hành vi xấu.
2. **Mã nguồn và chiến thuật:** không đưa mã nguồn, log biên dịch chi tiết hoặc đường dẫn nội bộ vào dữ liệu dành cho người xem.
3. **Tính toàn vẹn kết quả:** ghim phiên bản mã nguồn, kiểm tra SHA-256 và lưu commit evidence để phát hiện dữ liệu trận thiếu hoặc bị thay đổi. Đây là kiểm tra mã băm, không phải chữ ký số.
4. **Phiên và tài khoản:** giảm rủi ro chiếm phiên, CSRF, thử mật khẩu hàng loạt và vượt quyền. Cookie `HttpOnly` làm JavaScript không đọc được cookie nhưng không tự ngăn mọi dạng XSS.

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
- Middleware `requireCsrf` trong [`server/index.ts`](../server/index.ts) kiểm tra header `x-csrf-token` trên các route ghi dùng session công khai. Endpoint quản trị nội bộ có cơ chế xác thực riêng, được mô tả tại mục [Vận hành](api.md#vận-hành).

### 2.3. Phân quyền Vai trò (`requireRole`)
Hệ thống định nghĩa 2 vai trò tách biệt rõ ràng thông qua ràng buộc cơ sở dữ liệu `CHECK (role IN ('competitor', 'organizer'))`:
- **`competitor` (Thí sinh)**:
  - Chỉ có quyền xem, tạo, sửa, xóa các Bot và Phiên bản mã nguồn thuộc sở hữu của chính mình (`owner_id === req.auth.id`).
  - Được quyền nộp đơn đăng ký Bot vào các giải đấu đang mở đăng ký.
  - Được quyền chạy thử mã Bot cá nhân trong một lượt với thế cờ đã chọn; luồng UI hiện tại không đấu một trận đầy đủ với Bot hệ thống.
  - Không có quyền duyệt giải, tạo lịch, hoặc chạy giải đấu.
- **`organizer` (Ban tổ chức)**:
  - Quyền tạo giải đấu mới, chỉnh sửa thông tin giải đấu do mình sở hữu.
  - Quyền duyệt/từ chối đơn nộp bot của thí sinh sau khi kiểm tra preflight.
  - Quyền phát sinh lịch thi đấu (sinh vòng bảng/loại trực tiếp), bắt đầu giải, chạy giải và công bố kết quả.
  - Quyền giải quyết dữ liệu cũ đang chờ phân định (`resolveTiebreaker`) và chạy lại cặp đấu lỗi (`retry`). BO3 mới tự phân định nếu ván 3 hòa.

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
- Nếu Docker daemon hoặc image bắt buộc không khả dụng, việc thực thi mã nguồn bị từ chối hoặc cặp đấu bị đánh dấu lỗi hạ tầng để thử lại. Policy này không tự chuyển sang chạy Bot trực tiếp trên host.
- Chế độ `EXECUTION_POLICY=development` (chạy child process trên host) chỉ dùng cho mục đích phát triển mã nguồn nội bộ tin cậy.

### 4.2. Ràng buộc Image Bất biến (Immutable Image Digests)
- Mọi image Docker trong production đều bắt buộc phải được ghim bằng mã băm SHA-256 cụ thể (ví dụ: `gcc@sha256:7f...`).
- Server từ chối khởi động nếu biến môi trường image sử dụng tag động như `:latest` hoặc không có mã băm sha256.
- Sử dụng cờ `--pull=never` để ngăn chặn việc tự ý kéo image lạ từ Internet về máy chủ trong lúc thi đấu.

### 4.3. Các Lớp Phòng vệ Container (Hardening Flags)
Mỗi container Bot khi chạy được áp dụng các cờ Docker sau:
- **`--network none`**: Container Bot không được nối vào mạng Docker, qua đó chặn các kết nối mạng thông thường từ Bot.
- **`--read-only`**: Khóa toàn bộ root filesystem ở chế độ chỉ đọc. Bot không thể ghi đè binary hệ thống, không thể cài cắm malware hay script tự động.
- **`/tmp:rw,noexec,nosuid,size=10m`**: Cấp một thư mục tạm nhỏ 10 MiB dạng tmpfs trong RAM. Cấm chạy file thực thi (`noexec`) và cấm chiếm đặc quyền (`nosuid`).
- **`--security-opt=no-new-privileges:true`**: Không cho tiến trình nhận thêm đặc quyền qua cơ chế thực thi thông thường của Linux.
- **`--cap-drop=ALL`**: Thu hồi toàn bộ quyền năng của nhân Linux (Linux capabilities) khỏi container.
- **`--user non-root`**: Ép buộc tiến trình chạy dưới tài khoản người dùng thông thường, không có quyền root.
- **Giới hạn tài nguyên (cgroups)**:
  - RAM: 256 MiB (`--memory 256m`, `--memory-swap 256m`). Tránh bot chiếm cạn kiệt RAM hệ thống.
  - CPU: 1.0 core (`--cpus 1.0`). Tránh bot dùng 100% CPU của máy chủ.
  - Tiến trình: Tối đa 64 PIDs (`--pids-limit 64`). Chống tấn công fork-bomb.
- **Docker Socket Isolation**: Container Bot không được mount `/var/run/docker.sock`. Compose execution hiện mount socket vào **container ứng dụng** để nó tạo/giám sát sandbox; đây là trust boundary đặc quyền cần bảo vệ ở cấp host.

---

## 5. An toàn API và Bảo vệ Dữ liệu Riêng tư

1. **Giảm rủi ro path traversal**:
   - Các đường dẫn lưu trữ nhạy cảm kiểm tra mã định danh bằng `assertSafeId` trước khi ghép đường dẫn:
     ```typescript
     /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
     ```
   - Biểu thức này loại ký tự phân cách đường dẫn và chuỗi traversal khỏi các mã định danh được bảo vệ. Không nên suy ra rằng mọi tham số URL trong toàn bộ API đều đi qua cùng một hàm; route vẫn phải kiểm tra quyền sở hữu và dùng repository tương ứng.
2. **Chiếu Dữ liệu An toàn cho Khán giả (Spectator Data Sanitization)**:
   - Dữ liệu phát qua Server-Sent Events (Live Stream) và Replay API (`/spectator/...`) được lọc qua hàm chiếu (projection) an toàn:
     - Dữ liệu chiếu không chứa mã nguồn Bot, mã băm lưu trữ, cờ biên dịch, compiler log chi tiết, stderr của Bot hoặc đường dẫn file nội bộ.
     - Người xem nhận thông tin trận đấu đã được chiếu công khai như tên Bot/người chơi, trạng thái bàn cờ, nước đi, tỷ số và trạng thái trận.
3. **Giới hạn Tần suất (Rate Limiting)**:
   - Bảng SQLite `rate_limits` theo dõi tần suất gọi API theo địa chỉ IP và tài khoản:
     - Đăng ký / Đăng nhập: Chống tấn công vét cạn mật khẩu (Brute-force).
     - Chạy thử (Practice): Chống thí sinh spam yêu cầu biên dịch Docker làm nghẽn server.
     - Spectator polling: Trả về mã lỗi `429 Too Many Requests` kèm header `Retry-After` nếu client polling quá nhanh.
4. **Quyền truy cập Replay theo Giai đoạn**:
   - Khi giải đấu chưa công bố kết quả (`resultsPublishedAt === null`): Chỉ Ban tổ chức sở hữu giải mới có quyền xem replay. Thí sinh và khán giả không thể đọc trộm replay trước khi có thông báo chính thức.
   - Khi giải đấu đã công bố: Replay được mở quyền đọc công khai cho toàn bộ người dùng đã đăng nhập.

## 6. Giới hạn và ranh giới tin cậy

- Docker sandbox là phòng vệ nhiều lớp, không phải bằng chứng loại trừ mọi lỗ hổng Docker/kernel hoặc container escape.
- Container Bot không nhận Docker socket. Tuy nhiên, cấu hình Compose dành cho source execution mount `/var/run/docker.sock` vào **container ứng dụng**; container ứng dụng vì thế là ranh giới đặc quyền và phải được bảo vệ như Docker host.
- `EXECUTION_POLICY=development` có thể chạy tiến trình trên host và chỉ phù hợp với mã nội bộ tin cậy.
- Mã băm SHA-256 và commit evidence giúp phát hiện thay đổi/thiếu dữ liệu; chúng không cung cấp chữ ký số hoặc khả năng chống sửa đổi nếu kẻ tấn công kiểm soát cả dữ liệu lẫn bằng chứng.
