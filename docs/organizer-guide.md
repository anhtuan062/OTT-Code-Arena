# Hướng dẫn ban tổ chức

Tài liệu này áp dụng cho tài khoản ban tổ chức có vai trò `organizer`. Tài khoản tự đăng ký luôn là người chơi (`competitor`); người vận hành hệ thống phải cấp vai trò ban tổ chức bằng công cụ ngoài giao diện công khai.

Trong tài liệu này, **preflight** là bước biên dịch/chạy kiểm tra Bot trước khi duyệt; **participant** là Bot đã được duyệt chính thức; **pairing** là một cặp đấu; **stage** là một giai đoạn của giải nhiều giai đoạn.

## 1. Tạo và cấu hình giải

1. Mở **Quản lý giải đấu** và chọn **Tạo giải đấu**.
2. Nhập tên giải.
3. Khi giải còn `draft` (nháp), cấu hình lần lượt các tab **Thông tin**, **Luật chơi**, **Quy định** và **Thể thức**.
4. Lưu thay đổi trước khi mở đăng ký.

Giải mới dùng `multi_stage` theo flow UI hiện tại; backend vẫn giữ hỗ trợ `single_round_robin` cho dữ liệu/luồng tương thích. Cấu hình có thể gồm:

- thời điểm bắt đầu hiển thị, mở đăng ký và đóng đăng ký;
- luật Conversion;
- giới hạn lượt, thời gian chờ mỗi lượt, BO2/BO3 và cách tính điểm;
- giới hạn số Bot tham gia.

Backend khóa hoặc từ chối các thay đổi không còn hợp lệ theo trạng thái. Khi mở đăng ký, ruleset snapshot được ghim để hồ sơ và execution không phụ thuộc vào sửa đổi sau đó.

## 2. Mở và đóng đăng ký

- Chọn **Mở đăng ký** từ trạng thái nháp.
- Scheduler cũng có thể chuyển trạng thái theo các mốc thời gian đã lưu.
- Chọn **Đóng đăng ký** để ngừng nhận hồ sơ mới.
- Đóng theo lịch vẫn giữ hồ sơ `pending`; organizer phải xử lý chúng trước khi lập lịch.

## 3. Xử lý hồ sơ

Mỗi hồ sơ tham gia tham chiếu Bot và source revision đã ghim.

1. Mở danh sách hồ sơ trong không gian quản lý giải.
2. Chờ trạng thái kiểm tra trước thi đấu hoàn tất.
3. Nếu kiểm tra lỗi hạ tầng hoặc cần chạy lại, dùng thao tác thử lại mà giao diện cung cấp.
4. Chọn thao tác duyệt hoặc từ chối trên hồ sơ.
5. Có thể hoàn tác quyết định khi state machine còn cho phép.

Backend từ chối duyệt nếu preflight chưa `passed`, revision không còn hợp lệ hoặc hồ sơ/giải sai trạng thái. Không tạo lịch khi còn hồ sơ đang chờ.

## 4. Chốt danh sách và lập lịch

Sau khi đóng đăng ký và xử lý hết `pending`, chọn **Tạo lịch thi đấu**.

- `single_round_robin`: mọi Bot tham gia gặp nhau một lần ở cấp cặp đấu.
- `multi_stage`: tạo các giai đoạn vòng loại khu vực, vòng bảng và loại trực tiếp tùy quy mô; hệ thống tự chọn cấu trúc bằng `auto-format`.
- Group dùng BO2; regional qualifier và knockout dùng BO3 theo cấu hình giải mới.
- Bye và placeholder nguồn (winner/rank từ stage trước) được biểu diễn trong pairing/slot, sau đó resolve khi có kết quả.

Không sửa tay các file tournament để đổi lịch. Repository dùng validation, checkpoint và commit evidence để bảo toàn tính nhất quán.

## 5. Chạy giải

1. Bắt đầu giải sau khi đã có lịch.
2. Chọn **Chạy tất cả trận đấu**; tác vụ chạy nền và trạng thái hàng đợi được cập nhật trên giao diện. Khi chạy lại sau khi dừng hoặc có lỗi, nhãn có thể đổi thành **Tiếp tục giải đấu** hoặc **Chạy lại giải đấu**.
3. Theo dõi số cặp đấu đang chờ, đang chạy, đã hoàn tất hoặc bị lỗi.
4. **Dừng trận đấu** hủy tác vụ execution đang hoạt động nhưng giữ kết quả đã commit; giải không tự chuyển thành `cancelled`.
5. Khi một stage hoàn tất, multi-stage dừng ở manual gate. Chọn **Chạy giai đoạn tiếp theo** để tiếp tục.

Scheduler mặc định trong cấu hình ứng dụng bật concurrency 2 ở cấp series, nhưng Docker executor có limiter riêng (Compose mặc định `OTT_DOCKER_EXECUTION_CONCURRENCY=1`). Concurrency thực tế là giao của các giới hạn scheduler, dispatcher, host capacity và Docker limiter.

## 6. Xử lý cặp đấu lỗi

- **Thử lại/đưa lại vào hàng đợi:** đưa cặp đấu thất bại hoặc chưa hoàn tất trở lại hàng đợi khi backend cho phép.
- **Đấu lại:** tạo lần thực thi mới cho cặp đấu; chỉ dùng khi giao diện cho phép. Backend vẫn kiểm tra xung đột với kết quả đã được ghi bền vững.
- **Phân định hòa:** API vẫn có `resolve_tiebreaker` cho cặp đấu cũ đang ở `pending_tiebreaker`. Luồng BO3 mới tự phân định ván 3 bằng số quân còn lại, rồi chọn phía B của ván 3 nếu số quân bằng nhau; vì vậy trạng thái chờ xử lý thủ công không phải kết quả thông thường của cặp BO3 mới.

Lỗi biên dịch hoặc lỗi khi chạy Bot có thể bị xử thua theo quy tắc trận. Lỗi hạ tầng như Docker executor không khả dụng được coi là lỗi có thể thử lại, không tự quy thua Bot.

## 7. Kiểm tra và công bố

Khi mọi stage/pairing hoàn tất, giải chuyển `completed` nhưng kết quả chưa mặc nhiên công khai.

1. Kiểm tra standings, kết quả và replay bằng quyền chủ giải.
2. Xác nhận không còn dữ liệu thiếu hoặc commit/replay không nhất quán.
3. Chọn **Công bố kết quả**.

Publish chỉ thành công ở trạng thái phù hợp và sau validation. Sau khi công bố, competitor đã xác thực có thể xem public projection của kết quả/replay. UI cảnh báo thao tác công bố không thể hoàn tác; backend có exporter tĩnh với cơ chế revoke riêng cho operator nhưng không phải flow công bố thông thường trên UI.

## 8. Hủy và xóa

- **Hủy giải đấu:** state transition sang `cancelled`; UI coi đây là hành động không hoàn tác trong workspace.
- **Xóa giải đấu:** xóa dữ liệu giải qua API owner-scoped; modal cảnh báo dữ liệu giải, participant và kết quả sẽ bị xóa vĩnh viễn.

Hai thao tác này khác với **Dừng trận đấu**, vốn chỉ dừng execution.

## 9. Checklist vận hành

- Docker daemon và các image digest đã sẵn sàng.
- Source execution/preflight hoạt động trước khi mở đăng ký.
- Các mốc thời gian đúng múi giờ mong muốn.
- Không còn hồ sơ `pending` trước khi lập lịch.
- Theo dõi `/api/system/queue` và `/api/system/metrics` bằng tài khoản organizer.
- Chỉ công bố sau khi standings, match result và replay nhất quán.

Xem thêm [Vòng đời giải đấu](tournament-lifecycle.md), [Triển khai](deployment.md) và [Bảo mật](security.md).
