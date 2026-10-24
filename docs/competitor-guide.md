# Hướng dẫn người chơi

Tài liệu này dành cho người viết Bot. **Phiên bản mã nguồn** (source revision) là bản chụp mã không thể sửa sau khi lưu; **preflight** là bước hệ thống biên dịch/chạy kiểm tra phiên bản trước khi ban tổ chức được phép duyệt hồ sơ.

## 1. Tài khoản

Tài khoản tạo từ màn **Đăng ký** luôn có role `competitor`. Username phải dài 3–32 ký tự và khớp `[A-Za-z0-9_]`; mật khẩu phải dài 12–128 ký tự. Session được lưu bằng cookie HttpOnly, vì vậy không sao chép token vào mã Bot hoặc URL.

## 2. Tạo và quản lý Bot

1. Mở **Bot của tôi** và chọn **+ Tạo Bot mới**.
2. Nhập **Tên Bot** (tối đa 50 ký tự), chọn **Ngôn ngữ**, rồi sửa mã mẫu. Có thể dùng **Nạp mã** với URL GitHub công khai hoặc **Tải file mã nguồn (.cpp hoặc .py)**.
3. Chọn **Tạo Bot**. Kết quả mong đợi là Bot và phiên bản đầu tiên được tạo, phiên bản đó được chọn làm phiên bản hiện hành.
4. Với Bot đã có, chọn **Mã nguồn** trên thẻ Bot để mở không gian soạn mã.

Bot và phiên bản mã nguồn là hai lớp khác nhau. Bot là mục bạn đăng ký vào giải; mỗi lần lưu mã tạo một phiên bản bất biến. Sửa nội dung đã tải chỉ tạo bản nháp mới, không thay đổi phiên bản cũ.

Bạn không thể xóa Bot nếu Bot/revision đang được một giải hoặc yêu cầu tham gia ở trạng thái `pending`/`approved` tham chiếu. Không thể xóa revision duy nhất; nếu xóa revision đang chọn, backend phải chọn được revision thay thế.

## 3. Viết và lưu mã

### Runtime

| Lựa chọn UI | Giá trị API | Ghi chú |
| --- | --- | --- |
| C++17 | `cpp` | Biên dịch trong compiler image, sau đó chạy binary trong runtime image. |
| Python 3 | `python3` | Chạy bằng `python3 -B` trong runtime image. |

### Chế độ thực thi

- **Strategy:** triển khai hàm chọn nước qua SDK. Đây là chế độ giao diện dùng khi tạo Bot mới. SDK hiện có phiên bản 1.0.0; phiên bản và mã băm SDK được ghim vào revision.
- **Raw:** chương trình tự đọc một dòng JSON từ stdin và ghi đúng một dòng JSON ra stdout. Backend còn hỗ trợ chế độ này cho API/dữ liệu tương thích, nhưng giao diện hiện không có bộ chọn để người dùng đổi Bot mới sang `raw`. Xem [Bot Protocol](bot-protocol.md).

Mã nguồn phải là UTF-8, không rỗng và tối đa 64 KiB. Với Bot đã có, chọn **Tạo bản nháp** trên thẻ phiên bản, sửa mã rồi chọn **Lưu phiên bản**. Hệ thống lưu mã băm SHA-256 cùng thông tin kỹ thuật và tự chọn phiên bản vừa lưu. Muốn dùng lại phiên bản khác, chọn trực tiếp thẻ đó trong cột **Phiên bản**; thẻ có dấu chọn là phiên bản hiện hành.

### Nhập từ GitHub

Trong Không gian mã nguồn, chọn đúng runtime rồi dùng **Nạp mã**. UI chấp nhận URL HTTPS của repository hoặc URL file/raw GitHub trỏ tới file ở thư mục gốc. URL không được có thông tin đăng nhập, query hoặc fragment.

Tên file bắt buộc khớp runtime:

- C++17: `main.cpp`;
- Python 3: `main.py`.

File nằm trong thư mục con, có tên khác hoặc không khớp runtime sẽ bị từ chối. Repository phải công khai, có nhánh mặc định và không yêu cầu đăng nhập. Source phải là UTF-8, không rỗng và tối đa 64 KiB; UI còn kiểm tra cú pháp cơ bản trước khi nạp vào trình soạn thảo.

**Nạp mã** chỉ đưa nội dung vào trình soạn thảo. Bạn phải kiểm tra lại rồi chọn **Tạo Bot** hoặc **Lưu phiên bản** để tạo revision; thao tác nạp không tự đăng ký Bot vào giải. Revision lưu lại source cùng URL repository và commit SHA tương ứng. `GITHUB_TOKEN` là cấu hình server tùy chọn để tăng hạn mức gọi GitHub, không được gửi về client.

## 4. Chạy thử

Trong không gian mã nguồn, chọn **Chạy thử** để mở màn kiểm tra, chọn thế cờ có sẵn hoặc tùy chỉnh rồi chọn **Chạy thử** lần nữa. Hệ thống có thể chạy phiên bản đã lưu hoặc bản nháp hiện tại.

Kết quả thành công xác nhận Bot có thể được chuẩn bị/chạy và trả về một nước hợp lệ cho đúng một lượt. Kết quả hiển thị nước đi đã chọn và thông tin thế cờ; thao tác này không tạo trận đấu, không thay đổi giải và không đánh giá chiến thuật toàn trận.

Các lỗi thường gặp:

- `COMPILATION_TIMEOUT`/`COMPILER_ERROR`: C++ không biên dịch xong hoặc có lỗi; UI chỉ hiển thị phần cuối diagnostic đã làm sạch.
- `RUNTIME_TIMEOUT`: Bot không trả lời trong thời gian cho phép.
- `INVALID_JSON`, `INVALID_RESPONSE`, `MISSING_MOVE`: output sai protocol.
- `SANDBOX_REQUIRED`, `EXECUTOR_UNAVAILABLE`: lỗi cấu hình/hạ tầng; liên hệ operator.
- `429`: quá giới hạn lượt thử hoặc capacity đang bận.
- `409`: cùng revision đang được thử.

## 5. Đăng ký giải

1. Mở **Giải đấu** và chọn một giải đang nhận đăng ký.
2. Chọn **Đăng ký Bot**.
3. Chọn Bot; hồ sơ sẽ dùng phiên bản hiện hành của Bot tại thời điểm gửi.
4. Theo dõi trạng thái hồ sơ.

Yêu cầu tham gia ghim revision, runtime, source digest và SDK identity tại thời điểm gửi. Việc bạn chọn revision khác sau đó không thay đổi hồ sơ đã gửi.

Ban tổ chức chỉ có thể duyệt khi bước kiểm tra trước thi đấu thành công. Nếu kiểm tra chưa chạy, đang chạy hoặc thất bại, hồ sơ chưa thể trở thành người tham gia chính thức. Giao diện chỉ hiển thị lý do từ chối hoặc thông tin lỗi đã được API cho phép công khai.

## 6. Theo dõi giải

Màn chi tiết competitor có bốn tab:

- **Thông tin giải đấu:** trạng thái, mốc thời gian và thể lệ.
- **Lịch & nhánh đấu:** lịch các cặp đấu, từng giai đoạn, nhánh đấu và bảng xếp hạng hiện có.
- **Xem trực tiếp:** trận đang chạy.
- **Công bố:** kết quả đã được organizer công bố.

Draft có thể xuất hiện trước khi mở đăng ký nếu đã tới `visibleAt`. Giải đã hủy không nằm trong bộ lọc công khai thông thường. Kết quả và replay chưa công bố không hiển thị cho competitor.

## 7. Chuẩn bị Bot ổn định

- Luôn chạy thử đúng revision sẽ gửi.
- Không dựa vào file, process hoặc nội dung `/tmp` từ lượt trước; authoritative turn dùng runtime container mới.
- Chỉ ghi đúng response protocol lên stdout; đưa log chẩn đoán sang stderr nếu chế độ raw cho phép.
- Chọn nước nằm trong `legalMoves`; tự tính nước khác có thể bị xử thua `bot_illegal_move`.
- Chuẩn bị cho timeout, giới hạn memory/CPU/PID và network bị tắt.

Xem [Strategy SDK](strategy-sdk.md), [Luật OTTv2](game-rules.md) và [Bot Executor](bot-executor.md).
