# Tài khoản demo để kiểm thử

Các tài khoản dưới đây chỉ dành cho môi trường local/QA. Không dùng chúng cho production.

| Mục đích | Tên đăng nhập | Mật khẩu | Role trong hệ thống |
| --- | --- | --- | --- |
| Quản trị giải (admin) | `admin` | `1` | `organizer` |
| Người dùng Bot | `1` | `1` | `competitor` |

Trong codebase hiện tại chưa có role `admin` riêng; các quyền quản trị giải được biểu diễn bằng role `organizer`. Tài khoản `1` là tài khoản người dùng để tạo/quản lý Bot, không phải một Bot đã đăng ký.

## Tạo lại tài khoản

Sau khi build TypeScript, chạy lệnh sau từ thư mục gốc:

```powershell
npm.cmd run build
npm.cmd run seed:demo-accounts
```

Mặc định lệnh dùng `data/tournaments/arena.sqlite`. Có thể chỉ định database khác:

```powershell
node dist/scripts/seed-demo-accounts.js --db .qa-data/arena.sqlite
```

Lệnh có tính idempotent: chạy lại sẽ bảo đảm đúng mật khẩu/role cho hai tài khoản demo. Lệnh bị chặn khi `NODE_ENV=production`, trừ khi đặt `ALLOW_DEMO_ACCOUNTS=true` cho một môi trường test cô lập.
