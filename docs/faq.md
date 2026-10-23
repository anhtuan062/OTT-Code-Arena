# Câu hỏi thường gặp

## Tài khoản

### Vì sao tôi không thể tạo giải?

Tài khoản đăng ký từ UI luôn là `competitor`. Chỉ `organizer` được gọi API quản lý giải. Operator phải cấp role bằng công cụ quản trị của repository.

### Vì sao đăng nhập đúng nhưng bị khóa?

Login giới hạn 5 lần sai theo IP + username trong cửa sổ 15 phút; đăng ký giới hạn 10 lần theo IP. Khi nhận `429`, chờ hết thời gian khóa.

### Lỗi CSRF là gì?

Mọi thao tác ghi sau đăng nhập cần header `x-csrf-token` khớp session. UI tự quản lý token; nếu tab mở quá lâu hoặc session đổi, tải lại/đăng nhập lại.

## Bot và source revision

### Hệ thống hỗ trợ ngôn ngữ nào?

Phiên bản mã nguồn hỗ trợ C++17 (`cpp`) và Python 3 (`python3`). Giao diện tạo Bot mới theo Strategy SDK; chế độ `raw` chỉ còn được backend hỗ trợ qua API/dữ liệu tương thích. Bot cũ dùng dòng lệnh trực tiếp chỉ phù hợp cho môi trường phát triển với mã tin cậy, không phải lựa chọn an toàn cho mã thí sinh.

### Vì sao lưu mã báo quá lớn?

Source tối đa 64 KiB theo UTF-8. API có kiểm tra sớm và repository kiểm tra lại kích thước byte.

### Revision có bị sửa sau khi đăng ký giải không?

Không. Revision lưu source digest và bất biến. Yêu cầu tham gia ghim revision cụ thể; đổi revision đang chọn không cập nhật yêu cầu cũ.

### Tại sao không xóa được Bot hoặc revision?

Bot/revision đang được tournament hoặc hồ sơ `pending`/`approved` tham chiếu bị bảo vệ. Revision duy nhất cũng không thể xóa vì Bot cần revision thay thế.

### Import GitHub có hỗ trợ repository private không?

Không trong flow hiện tại. Backend chỉ chấp nhận GitHub HTTPS public, resolve về commit SHA rồi nhập file nguồn phù hợp ở root archive.

## Chạy thử và sandbox

### “Chạy thử thành công” có nghĩa Bot chắc chắn thi đấu được không?

Không. UI chạy một lượt trên một scenario. Nó xác nhận compile/runtime/protocol/nước đi cho input đó, không kiểm tra toàn bộ trận hoặc mọi edge case.

### Vì sao Bot không truy cập mạng hoặc ghi file?

Sandbox dùng `--network none`, root filesystem read-only, drop capabilities và tmpfs giới hạn. Đây là hành vi chủ đích. Runtime authoritative mới được tạo mỗi lượt, nên không dựa vào trạng thái `/tmp` trước đó.

### `SANDBOX_REQUIRED` hoặc `EXECUTOR_UNAVAILABLE` là lỗi của ai?

Đây là lỗi cấu hình/hạ tầng, không nên được coi là lỗi chiến thuật của Bot. Operator cần kiểm tra Docker daemon, policy, image digest và source execution.

## Giải đấu

### Vì sao tôi thấy giải nháp?

Competitor có thể thấy draft đã tới `visibleAt`, nhưng chỉ gửi đăng ký khi trạng thái là `registration_open`.

### Vì sao hồ sơ chưa được duyệt?

Ban tổ chức chỉ được duyệt sau khi bước kiểm tra trước thi đấu (`preflight`) có trạng thái `passed`. Hồ sơ cũng phải tham chiếu đúng phiên bản mã nguồn, chưa bị xử lý và giải phải ở trạng thái phù hợp.

### Vì sao không tạo được lịch?

Giải cần đóng đăng ký, có participant hợp lệ và không còn hồ sơ `pending`. Preflight của participant cũng phải thỏa điều kiện backend.

### Vì sao giải dừng giữa các giai đoạn?

Giải nhiều giai đoạn có điểm dừng thủ công giữa các giai đoạn. Ban tổ chức phải chọn **Chạy giai đoạn tiếp theo**; đây không phải lỗi của bộ lập lịch.

### Khi nào cần phân định hòa thủ công?

Luồng BO3 mới tự xử lý ván 3 hòa bằng số quân còn lại; nếu số quân bằng nhau, phía B của ván 3 thắng. Thao tác `resolve_tiebreaker` chỉ dành cho cặp đấu cũ hoặc dữ liệu được phục hồi đang ở trạng thái `pending_tiebreaker`.

### “Dừng trận đấu” có hủy giải không?

Không. Nó hủy execution task đang chạy và giữ kết quả đã commit. **Hủy giải đấu** mới chuyển giải sang `cancelled`.

## Live và replay

### Live không cập nhật thì làm gì?

Client tự chuyển từ SSE sang polling khi stream lỗi. Nếu vẫn không cập nhật, kiểm tra giải còn `running`, pairing đã bắt đầu và không bị rate limit `429`.

### Vì sao competitor không thấy kết quả/replay?

Organizer chưa công bố kết quả, hoặc pairing chưa hoàn tất. Trước công bố, dữ liệu chỉ dành cho chủ giải.

### Conversion hiển thị khác replay cũ?

Replay mới lưu `conversionTo`. Replay legacy thiếu trường này dùng fallback lịch sử; vì vậy vị trí quân chuyển hóa có thể khác cách engine hiện tại ghi nhận.

## Vận hành

### Repository có chứng minh production đang chạy không?

Không. Nó có Docker/Compose và workflow Cloudflare Pages, nhưng code/config không chứng minh deployment hiện tại, domain, uptime hoặc trạng thái Azure/Cloudflare thực tế.

### Có thể chạy backend trên Cloudflare Pages không?

Workflow Pages chỉ build frontend tĩnh và Function proxy `/api` tới `API_ORIGIN`. Express/SQLite/Docker executor phải chạy ở backend riêng.

### Tài liệu nào dành cho lỗi vận hành?

Xem [Triển khai](deployment.md), [Bảo mật](security.md), [Bot Executor](bot-executor.md) và [Kiểm thử](testing.md).
