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

Trong môi trường thi đấu chính thức (`production`), hệ thống áp dụng nguyên tắc **fail-closed**: nếu Docker daemon hoặc image đã ghim bằng SHA-256 không khả dụng, yêu cầu thực thi mã nguồn bị từ chối hoặc được ghi nhận là lỗi hạ tầng. Policy không tự chuyển sang chạy Bot trực tiếp trên hệ điều hành máy chủ. Một số lỗi cấu hình image không hợp lệ được phát hiện khi khởi tạo; khả năng daemon/image thực tế được kiểm tra khi thực thi.

Mỗi container bot khi khởi chạy được áp dụng các cờ cô lập nghiêm ngặt:

| Tiêu chí | Cấu hình Docker | Mục đích bảo mật |
| :--- | :--- | :--- |
| **Mạng (Network)** | `--network none` | Không nối container Bot vào mạng Docker; chặn các kết nối mạng thông thường từ Bot. |
| **Hệ thống tệp gốc** | `--read-only` | Root filesystem ở chế độ chỉ đọc; bot không thể sửa đổi file hệ thống của image. |
| **Thư mục tạm** | `/tmp:rw,noexec,nosuid,size=10m` | Gắn tmpfs trong bộ nhớ RAM tối đa 10 MiB, cấm thực thi binary (`noexec`) và cấm leo thang đặc quyền (`nosuid`). |
| **Đặc quyền** | `--security-opt=no-new-privileges:true`<br>`--cap-drop=ALL` | Bỏ Linux capabilities và không cho tiến trình nhận thêm đặc quyền qua cơ chế thực thi thông thường. |
| **Người dùng** | Chạy dưới UID/GID non-root | Không bao giờ chạy container dưới quyền root của hệ thống. |
| **Bộ nhớ (RAM)** | Mặc định 256 MiB (`memoryLimitMb = 256`) | Giới hạn dung lượng RAM tối đa; bot bị kill ngay nếu rò rỉ bộ nhớ (OOM). |
| **Vi xử lý (CPU)** | Mặc định 1.0 CPU (`cpuLimit = 1.0`) | Giới hạn hạn ngạch tính toán; ngăn bot chiếm dụng toàn bộ CPU máy chủ. |
| **Số tiến trình (PIDs)** | Mặc định tối đa 64 (`maxProcesses = 64`) | Ngăn chặn tấn công làm cạn kiệt tài nguyên (Fork bomb). |
| **Tải Image** | `--pull=never` | Chỉ sử dụng các image đã có sẵn trên máy và được ghim chính xác bằng SHA-256 digest. |
| **Docker socket** | Không mount vào container Bot | Bot không nhận trực tiếp socket điều khiển Docker. Container ứng dụng có thể nhận socket trong Compose execution và là ranh giới đặc quyền riêng. |

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
           ▼ (3. Runtime container mới mỗi lượt)
[Thực thi một lượt qua stdin/stdout]
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
3. **Thực thi và cô lập từng lượt**:
   - Binary tĩnh sau khi biên dịch được mount ở chế độ read-only vào container runtime (`BOT_CPP_RUNTIME_IMAGE`).
   - Source/binary và artifact đã chuẩn bị được giữ trong phạm vi match để tránh biên dịch lại. Mỗi lượt authoritative tạo một runtime container mới, gửi request qua `stdin`, đọc response từ `stdout` rồi cleanup; trạng thái process và `/tmp` không được chia sẻ giữa các lượt.
4. **Dọn dẹp (Cleanup)**:
   - Khi trận đấu kết thúc hoặc bị hủy (`abort signal`), server dừng và xóa container, thu hồi binary và dọn sạch workspace/volume.

---

## 4. Quy trình Xử lý cho Python 3

1. Không yêu cầu bước biên dịch nhị phân.
2. Mã nguồn của thí sinh cùng với Strategy SDK (`ott_strategy_sdk.py`) và module driver (`runner.py`) được mount ở chế độ read-only vào container Python (`BOT_PYTHON3_RUNTIME_IMAGE`).
3. Lệnh khởi chạy: `python3 -B runner.py` (cờ `-B` ngăn Python tự ý ghi đè file bytecode `.pyc`).
4. Tái sử dụng source/SDK đã chuẩn bị trong match scope, nhưng tạo runtime container Python mới cho từng lượt authoritative.

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

Bot Executor phân loại nguyên nhân lỗi để Match Runner và tầng giải đấu áp dụng đúng chính sách:
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

*Bảo mật thông tin chẩn đoán*: API dành cho người xem dùng DTO đã lọc và chỉ hiển thị mã lỗi chung như `bot_timeout` hoặc `bot_crash`; mã nguồn, compiler log chi tiết, stderr và đường dẫn nội bộ không được đưa vào projection này. Endpoint dành cho chủ giải có thể trả dữ liệu chi tiết hơn theo quyền.

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
