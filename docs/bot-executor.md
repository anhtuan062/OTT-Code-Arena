# Bot Executor

## Vai trò

Bot Executor nhận request của một lượt, chạy bot trong môi trường phù hợp và trả về move hoặc lỗi có cấu trúc. Match Runner không phụ thuộc trực tiếp vào cách bot được thực thi.

## Hai loại bot

### Legacy command

Bot cũ được mô tả bằng `command`, `args` và `env`. Chế độ development có thể dùng child process cho mã tin cậy. Đây không phải sandbox bảo mật.

### Source revision

Bot C++17/Python 3 được ghim bằng:

- owner/competitor ID;
- bot ID và revision ID;
- runtime ID;
- source SHA-256;
- execution mode;
- Strategy SDK version và digest nếu dùng strategy mode.

Server đọc lại source, kiểm tra identity rồi mới chuyển cho Revision Docker Executor.

## Docker sandbox

Container runtime sử dụng các giới hạn chính:

| Kiểm soát | Cấu hình |
| --- | --- |
| Network | `--network none` |
| Root filesystem | `--read-only` |
| Thư mục tạm | `/tmp:rw,noexec,nosuid,size=10m` |
| Privilege | `no-new-privileges`, drop toàn bộ capabilities |
| User | UID/GID không phải root |
| Memory | mặc định 256 MiB |
| CPU | mặc định 1 CPU |
| Process | mặc định 64 PID |
| Image | `--pull=never`, image ghim bằng digest trong production |

Không mount Docker socket và không chạy binary bot trên host.

## C++17

1. Chuẩn bị source và SDK trong workspace riêng.
2. Biên dịch trong compiler image bằng `-std=c++17 -O2 -pipe -s -static`.
3. Kiểm tra artifact và SHA-256.
4. Mount binary read-only vào runtime container.
5. Giữ artifact và warm container trong phạm vi match để tránh biên dịch lại mỗi lượt.
6. Cleanup khi match scope kết thúc, timeout hoặc bị hủy.

Backend workspace hỗ trợ `bind` và `ephemeral-volume`, chọn bằng `BOT_CPP_COMPILATION_BACKEND`.

## Python 3

Python không có bước biên dịch C++. Source và SDK được mount read-only; runner gọi `python3 -B` trong image Python đã ghim. Warm container được tái sử dụng trong phạm vi trận.

## Ngân sách thời gian

- Source revision: tối thiểu 5 giây runtime mỗi lượt.
- Chuẩn bị workspace: mặc định 10 giây.
- Biên dịch C++: tối thiểu 30 giây; server hiện cấu hình mặc định 120 giây qua `BOT_CPP_COMPILE_TIMEOUT_MS`.
- Timeout được phân loại theo phase: preparation, compilation hoặc runtime.

## Lỗi

Các mã chính:

- `COMPILATION_TIMEOUT`, `RUNTIME_TIMEOUT`;
- `PROCESS_CRASHED`, `EMPTY_OUTPUT`;
- `INVALID_JSON`, `INVALID_RESPONSE`;
- `RESOURCE_LIMIT_EXCEEDED`;
- `SECURITY_VIOLATION`, `SANDBOX_REQUIRED`;
- `EXECUTOR_UNAVAILABLE`, `EXECUTOR_ERROR`.

Diagnostics chỉ lưu metadata giới hạn như phase, runtime, digest và exit code. Spectator DTO không nhận source, stderr hoặc thông tin nội bộ này.

## Biến môi trường

| Biến | Mục đích |
| --- | --- |
| `EXECUTION_POLICY` | `development` hoặc `sandbox-required` |
| `ENABLE_SOURCE_REVISION_EXECUTION` | bật source revision executor |
| `BOT_DOCKER_IMAGE` | image sandbox chung |
| `BOT_CPP_COMPILER_IMAGE` | image biên dịch C++ |
| `BOT_CPP_RUNTIME_IMAGE` | image chạy binary C++ |
| `BOT_PYTHON3_RUNTIME_IMAGE` | image chạy Python |
| `BOT_TRUSTED_IMAGE_REGISTRIES` | danh sách registry được tin cậy |
| `BOT_EXECUTION_WORKDIR` | workspace tạm |
| `BOT_CPP_COMPILE_TIMEOUT_MS` | timeout biên dịch |
| `BOT_CPP_COMPILATION_BACKEND` | `bind` hoặc `ephemeral-volume` |

Production yêu cầu image dạng `registry/repository@sha256:<64 ký tự hex>`.
