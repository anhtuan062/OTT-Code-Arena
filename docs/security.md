# Mô hình bảo mật

## Tài sản cần bảo vệ

- hệ điều hành và Docker host;
- mã nguồn bot của từng tài khoản;
- session, CSRF token và thông tin đăng nhập;
- dữ liệu giải, kết quả và replay;
- tính toàn vẹn của source revision và Docker image.

## Authentication và authorization

- Mật khẩu được băm bằng bcrypt.
- Session lưu trong SQLite và gửi bằng cookie `HttpOnly`, `SameSite=Lax`; production bật cookie secure.
- API thay đổi trạng thái yêu cầu CSRF token.
- API bot chỉ dành cho `competitor` sở hữu bot.
- API quản lý giải chỉ dành cho `organizer` sở hữu giải.
- Mọi tài khoản đã đăng nhập có thể xem live khi tournament đang `running`.
- Replay đã công bố cho phép người dùng đã xác thực xem; replay chưa công bố chỉ owner được truy cập.

## Source integrity

- Source revision tối đa 64 KiB và phải là UTF-8 hợp lệ.
- Source được lưu cùng kích thước và SHA-256.
- Khi đọc, server kiểm tra lại kích thước và digest.
- Strategy revision phải khớp runtime, execution mode, SDK version và SDK digest đã ghim.
- Series BO3 kiểm tra provenance không thay đổi giữa các ván.

## Sandbox

Production yêu cầu `EXECUTION_POLICY=sandbox-required`. Nếu Docker hoặc image đã ghim không sẵn sàng, server không mở listener hoặc execution thất bại đóng; không fallback sang host.

Docker execution dùng:

- network disabled;
- root filesystem read-only;
- tmpfs nhỏ với `noexec,nosuid`;
- non-root user;
- drop capabilities và `no-new-privileges`;
- giới hạn memory, CPU và PID;
- source/SDK/artifact mount theo quyền tối thiểu;
- không mount Docker socket.

`ChildProcessExecutor` chỉ dành cho development với bot tin cậy. Nó không cô lập filesystem, network, CPU hoặc memory như Docker.

## API và dữ liệu

- JSON body giới hạn 100 KiB.
- Identifier và storage path được kiểm tra để ngăn path traversal và symlink escape.
- Static server chỉ phục vụ các file frontend được khai báo.
- Rate limit áp dụng cho đăng ký, đăng nhập, chạy thử và spectator polling.
- Spectator projection loại bỏ source, revision nội bộ, runtime diagnostics và raw output.
- Live SSE đặt `Cache-Control: no-cache, no-store, private`.

## Checklist vận hành

- Dùng image theo immutable digest và registry tin cậy.
- Không chạy production với `EXECUTION_POLICY=development`.
- Không sửa trực tiếp SQLite hoặc tournament files khi server đang chạy.
- Sao lưu khi server đã dừng và kiểm tra integrity trước khi restore.
- Không chia sẻ thư mục `data/tournaments` hoặc log runtime ra public.
- Theo dõi lỗi `SECURITY_VIOLATION`, `SOURCE_REVISION` và `DOCKER_INFRASTRUCTURE`.
