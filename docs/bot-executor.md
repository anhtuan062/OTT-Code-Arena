# Bot Executor

Tài liệu này mô tả chi tiết kiến trúc, cơ chế bảo mật và quy trình vận hành của phân hệ Bot Executor (`bot-executor/`) trong nền tảng OTT Code Arena.

Bot Executor có nhiệm vụ nhận yêu cầu tính toán nước đi (`BotRequest`) của từng lượt đấu từ Match Runner, kích hoạt môi trường thực thi bị cô lập (Sandbox), nạp mã nguồn bot và trả về kết quả nước đi hợp lệ (`BotResponse`) hoặc thông báo lỗi có cấu trúc (`BotError`). Match Runner không phụ thuộc trực tiếp vào cách thức hay công nghệ container chạy bên dưới.

---

## 1. Hai Chế độ Thực thi Bot

### 1.1. Chế độ Mã nguồn (Source Revision Execution)
Đây là chế độ thi đấu chính thức của nền tảng dành cho các bot lập trình bằng **C++17** (`cpp`) hoặc **Python 3** (`python3`):
- Mã nguồn được lưu trữ độc lập và gắn kèm các thông tin định danh bất biến (SHA-256 digest, runtime, execution mode, SDK version & digest).
- Được thực thi bởi `RevisionDockerExecutor` bên trong Docker Sandbox biệt lập với các ràng buộc tài nguyên nghiêm ngặt.
- Bắt buộc kích hoạt cờ môi trường: `ENABLE_SOURCE_REVISION_EXECUTION=true` và `EXECUTION_POLICY=sandbox-required`.

### 1.2. Chế độ Lệnh kế thừa (Legacy Command Execution)
- Dành cho các bot cũ được mô tả thông qua dòng lệnh trực tiếp: `command`, `args`, và `env`.
- Được thực thi bởi `BotRunner` / `ChildProcessExecutor` hoặc `DockerExecutor` chung.
- Chỉ sử dụng trong môi trường thử nghiệm nội bộ (`development`) với mã nguồn tin cậy; **không bảo đảm an toàn sandbox** để chạy mã nguồn người dùng không tin cậy.

---

## 2. Mô hình Docker Sandbox và Ràng buộc Bảo mật

Trong môi trường thi đấu chính thức (`production`), hệ thống áp dụng nguyên tắc **Fail-Closed**: nếu Docker daemon không hoạt động hoặc các Docker image đã ghim bằng mã băm SHA-256 không khả dụng, server sẽ từ chối khởi động hoặc dừng xử lý, tuyệt đối **không tự ý fallback** sang chạy bot trực tiếp trên hệ điều hành máy chủ (Host).

Mỗi container bot khi khởi chạy được áp dụng các cờ cô lập nghiêm ngặt:

| Tiêu chí | Cấu hình Docker | Mục đích bảo mật |
| :--- | :--- | :--- |
| **Mạng (Network)** | `--network none` | Chặn hoàn toàn kết nối Internet và mạng nội bộ, ngăn rò rỉ dữ liệu hoặc tấn công mạng. |
| **Hệ thống tệp gốc** | `--read-only` | Root filesystem ở chế độ chỉ đọc; bot không thể sửa đổi file hệ thống của image. |
| **Thư mục tạm** | `/tmp:rw,noexec,nosuid,size=10m` | Gắn tmpfs trong bộ nhớ RAM tối đa 10 MiB, cấm thực thi binary (`noexec`) và cấm leo thang đặc quyền (`nosuid`). |
| **Đặc quyền** | `--security-opt=no-new-privileges:true`<br>`--cap-drop=ALL` | Thu hồi toàn bộ quyền Linux capabilities của tiến trình; ngăn chặn leo thang đặc quyền. |
| **Người dùng** | Chạy dưới UID/GID non-root | Không bao giờ chạy container dưới quyền root của hệ thống. |
| **Bộ nhớ (RAM)** | Mặc định 256 MiB (`memoryLimitMb = 256`) | Giới hạn dung lượng RAM tối đa; bot bị kill ngay nếu rò rỉ bộ nhớ (OOM). |
| **Vi xử lý (CPU)** | Mặc định 1.0 CPU (`cpuLimit = 1.0`) | Giới hạn hạn ngạch tính toán; ngăn bot chiếm dụng toàn bộ CPU máy chủ. |
| **Số tiến trình (PIDs)** | Mặc định tối đa 64 (`maxProcesses = 64`) | Ngăn chặn tấn công làm cạn kiệt tài nguyên (Fork bomb). |
| **Tải Image** | `--pull=never` | Chỉ sử dụng các image đã có sẵn trên máy và được ghim chính xác bằng SHA-256 digest. |
| **Docker Socket** | Tuyệt đối không mount | Ngăn chặn việc bot thoát khỏi container để điều khiển Docker host. |

---

## 3. Quy trình Xử lý cho C++17

Quy trình biên dịch và thực thi cho bot C++17 gồm các bước:

```text
[Source C++ & Header SDK]
           │
           ▼ (1. Chuẩn bị workspace biệt lập)
[Compiler Container: g++] ──► Biên dịch (-std=c++17 -O2 -pipe -s -static)
           │
           ▼ (2. Kiểm tra SHA-256 artifact binary)
[Runtime Container] ◄──────── Mount binary read-only
           │
           ▼ (3. Warm container scope ván đấu)
[Thực thi từng lượt qua stdin/stdout]
           │
           ▼ (4. Dọn dẹp)
[Hủy container và xóa workspace/volume khi trận kết thúc]
```

1. **Chuẩn bị Workspace**:
   - Khởi tạo thư mục làm việc tạm thời biệt lập cho trận đấu.
   - Hỗ trợ 2 backend cấu hình qua biến `BOT_CPP_COMPILATION_BACKEND`:
     - `bind`: Mount thư mục cục bộ của máy chủ vào container.
     - `ephemeral-volume`: Tạo Docker named volume dùng một lần rồi xóa (cung cấp khả năng cô lập cao hơn).
2. **Biên dịch**:
   - Sử dụng Docker image biên dịch được ghim (`BOT_CPP_COMPILER_IMAGE`).
   - Cờ biên dịch: `-std=c++17 -O2 -pipe -s -static`.
   - Timeout biên dịch: Mặc định là **120 giây** (cấu hình qua `BOT_CPP_COMPILE_TIMEOUT_MS`).
3. **Thực thi và Cơ chế Warm Container**:
   - Binary tĩnh sau khi biên dịch được mount ở chế độ read-only vào container runtime (`BOT_CPP_RUNTIME_IMAGE`).
   - Container được giữ chạy ngầm trong phạm vi cả ván đấu (`match scope`). Mỗi lượt đấu, Match Runner chỉ cần gửi dữ liệu qua `stdin` và đọc kết quả từ `stdout` của container đang chờ, loại bỏ hoàn toàn độ trễ khởi tạo container ở từng nước đi.
4. **Dọn dẹp (Cleanup)**:
   - Khi trận đấu kết thúc hoặc bị hủy (`abort signal`), server dừng và xóa container, thu hồi binary và dọn sạch workspace/volume.

---

## 4. Quy trình Xử lý cho Python 3

1. Không yêu cầu bước biên dịch nhị phân.
2. Mã nguồn của thí sinh cùng với Strategy SDK (`ott_strategy_sdk.py`) và module driver (`runner.py`) được mount ở chế độ read-only vào container Python (`BOT_PYTHON3_RUNTIME_IMAGE`).
3. Lệnh khởi chạy: `python3 -B runner.py` (cờ `-B` ngăn Python tự ý ghi đè file bytecode `.pyc`).
4. Áp dụng cơ chế Warm Container tương tự như C++: giữ tiến trình sống trong suốt phạm vi ván đấu để phục vụ các lượt đi kế tiếp.

---

## 5. Ngân sách Thời gian (Execution Budget)

Hệ thống phân tách rõ ràng ngân sách thời gian theo từng giai đoạn xử lý:

| Giai đoạn | Thời gian phân bổ | Xử lý khi vượt ngưỡng |
| :--- | :--- | :--- |
| **Chuẩn bị workspace** | Tối đa 10 giây | Thất bại khâu chuẩn bị, báo lỗi hạ tầng. |
| **Biên dịch C++** | Mặc định 120 giây (`BOT_CPP_COMPILE_TIMEOUT_MS`) | Xử thua bot với mã `COMPILATION_TIMEOUT`. |
| **Thực thi lượt đi** | Tối thiểu 5,000 ms (`SOURCE_REVISION_MIN_TURN_TIMEOUT_MS`) | Xử thua bot với mã `RUNTIME_TIMEOUT` (hoặc `bot_timeout`). |

---

## 6. Phân loại và Xử lý Lỗi (Diagnostics)

Bot Executor phân loại chi tiết các nguyên nhân lỗi nhằm bảo đảm tính minh bạch và an toàn:
- `COMPILATION_TIMEOUT`: Vượt quá thời gian biên dịch mã nguồn C++.
- `RUNTIME_TIMEOUT`: Bot không trả về nước đi trong thời gian quy định của lượt.
- `PROCESS_CRASHED`: Tiến trình bot thoát đột ngột (segmentation fault, unhandled exception, exit code $\ne 0$).
- `EMPTY_OUTPUT`: Bot kết thúc mà không xuất bất kỳ byte nào ra stdout.
- `INVALID_JSON`: Dữ liệu xuất ra stdout không parse được thành JSON.
- `INVALID_RESPONSE`: JSON xuất ra không chứa trường `move` hợp lệ.
- `RESOURCE_LIMIT_EXCEEDED`: Bot vượt quá giới hạn RAM (OOM) hoặc giới hạn số tiến trình.
- `SECURITY_VIOLATION`: Vi phạm chính sách an ninh hoặc cố gắng thực hiện hành vi bị cấm.
- `SANDBOX_REQUIRED`: Cấu hình yêu cầu sandbox nhưng Docker không sẵn sàng.
- `EXECUTOR_UNAVAILABLE` / `EXECUTOR_ERROR`: Lỗi hạ tầng hệ thống máy chủ.

*Bảo mật thông tin chẩn đoán*: Toàn bộ log chi tiết của compiler, stderr của bot và đường dẫn tệp nội bộ được bảo vệ nghiêm ngặt. Khi chiếu sang Spectator DTO cho người xem giải, hệ thống chỉ hiển thị mã lỗi chung (ví dụ: `bot_timeout`, `bot_crash`), tuyệt đối không làm lộ mã nguồn hay log nhạy cảm của thí sinh.

---

## 7. Các Biến Môi trường Cấu hình

| Biến môi trường | Kiểu giá trị | Mặc định / Ví dụ | Mô tả |
| :--- | :--- | :--- | :--- |
| `EXECUTION_POLICY` | `string` | `development` hoặc `sandbox-required` | Chế độ an toàn thực thi bot. Production bắt buộc dùng `sandbox-required`. |
| `ENABLE_SOURCE_REVISION_EXECUTION` | `string` | `'true'` hoặc `'false'` | Cho phép biên dịch và chạy các bot dạng mã nguồn C++/Python. |
| `BOT_DOCKER_IMAGE` | `string` | `image@sha256:...` | Image Docker chung cho các tác vụ sandbox cơ bản. |
| `BOT_CPP_COMPILER_IMAGE` | `string` | `gcc@sha256:...` | Image chứa GCC/G++ dùng để biên dịch mã nguồn C++17. |
| `BOT_CPP_RUNTIME_IMAGE` | `string` | `debian@sha256:...` | Image tối giản dùng để chạy binary C++ đã biên dịch tĩnh. |
| `BOT_PYTHON3_RUNTIME_IMAGE` | `string` | `python@sha256:...` | Image chứa Python 3.10+ dùng để chạy bot Python. |
| `BOT_TRUSTED_IMAGE_REGISTRIES` | `string` | `docker.io,ghcr.io` | Danh sách các registry được chấp thuận tải image. |
| `BOT_EXECUTION_WORKDIR` | `string` | Đường dẫn thư mục | Thư mục tạm dùng để chứa workspace biên dịch của bot trên host. |
| `BOT_CPP_COMPILE_TIMEOUT_MS` | `number` | `120000` (120 giây) | Thời gian tối đa cho phép biên dịch một bot C++. |
| `BOT_CPP_COMPILATION_BACKEND` | `string` | `bind` hoặc `ephemeral-volume` | Cơ chế mount thư mục biên dịch vào container GCC. |
