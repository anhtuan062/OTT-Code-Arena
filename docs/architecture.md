# Kiến trúc OTT Code Arena

## Tổng quan

Ứng dụng là một modular monolith TypeScript chạy trên Node.js. Luật chơi, thực thi bot, điều phối trận, quản lý giải, API và giao diện được tách theo ranh giới module nhưng cùng build và triển khai trong một tiến trình server.

## Thành phần

```text
Trình duyệt
    │ HTTP + SSE
    ▼
Express API ───── SQLite
    │             tài khoản, session, bot, revision, rate limit
    ▼
Tournament Manager ───── filesystem
    │                     tournament, kết quả, replay
    ▼
Match Runner ◄────► Game Engine
    │
    ▼
Bot Executor ─────► Docker sandbox
```

- `engine/`: trạng thái bàn cờ, sinh và áp dụng nước đi, điều kiện thắng/hòa, bàn cờ khởi tạo theo seed và Bot hệ thống.
- `bot-protocol/`: chuyển trạng thái engine sang JSON protocol `0.1.0` và kiểm tra phản hồi.
- `bot-executor/`: thực thi bot cũ hoặc source revision; quản lý Docker image, biên dịch C++, Strategy SDK, timeout và cleanup.
- `match-runner/`: vòng lặp từng lượt, forfeit, callback live, kết quả và replay.
- `tournament/`: đăng ký, lịch vòng tròn, BO1/BO3, bảng xếp hạng, retry, recovery và persistence.
- `server/`: authentication, role authorization, CSRF, REST API, spectator projection và rate limit.
- `app.js`, `index.html`, `style.css`: SPA phía trình duyệt.

## Luồng thi đấu

1. Organizer tạo giải, mở đăng ký và duyệt yêu cầu tham gia.
2. Hệ thống ghim bot revision của từng participant bằng revision ID, source digest, runtime và SDK identity.
3. Tournament Manager sinh lịch vòng tròn và đưa pairing vào hàng đợi.
4. Match Runner lấy legal moves từ Game Engine rồi gọi bot trong Docker.
5. Engine kiểm tra và áp dụng nước đi; bot không có quyền quyết định trạng thái hoặc người thắng.
6. Snapshot được phát cho live viewer; kết quả và replay chỉ được ghi nhận sau khi ván hoàn tất.
7. Với BO3, điểm số được gắn theo participant cố định dù A/B đổi giữa các ván.
8. Sau khi pairing hoàn tất, bảng xếp hạng được tính lại từ các aggregate match record.

## BO3

- Ván 1 giữ thứ tự participant ban đầu.
- Ván 2 đảo A/B.
- Ván 3 chọn A/B ổn định từ series seed.
- Mỗi ván dùng một layout khởi tạo khác nhau nhưng tái lập được từ seed.
- Series dừng khi một participant đủ hai ván thắng hoặc đã chơi đủ ba ván.
- Giữa hai ván có khoảng nghỉ 2,5 giây ở server.

## Persistence và recovery

- SQLite schema hiện lưu users, sessions, bots, bot revisions, rate limits và bảng tương thích spectator cũ.
- Tournament state, match result và replay được lưu trong thư mục riêng theo tournament.
- File tournament được ghi theo cơ chế tệp tạm và thay thế an toàn trên Windows.
- Khi khởi động lại, server giữ kết quả đã commit và chuyển pairing `in_progress` chưa có aggregate result về `scheduled`.
- SQLite và filesystem không nằm trong cùng một transaction; code reconciliation chịu trách nhiệm khôi phục trạng thái hợp lệ.

## Nguyên tắc

1. Engine là nguồn quyết định duy nhất cho luật và kết quả.
2. Source revision phải bất biến và kiểm tra được bằng SHA-256.
3. Production phải fail closed khi Docker hoặc image đã ghim không sẵn sàng.
4. DTO spectator chỉ chứa dữ liệu cần hiển thị, không lộ source, runtime diagnostics hoặc nội bộ sandbox.
5. Replay lưu đủ identity để ánh xạ đúng participant qua từng ván.
