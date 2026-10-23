# Hướng dẫn sử dụng OTT Code Arena

Tài liệu này giúp người dùng đi từ đăng nhập đến theo dõi kết quả. Bot là chương trình tự động chọn nước đi. Mỗi lần lưu mã của Bot tạo một **phiên bản mã nguồn** (revision) không bị sửa lại. Nếu bạn viết Bot, xem thêm [Hướng dẫn người chơi](competitor-guide.md). Nếu bạn vận hành giải, xem [Hướng dẫn ban tổ chức](organizer-guide.md).

## 1. Tạo tài khoản và đăng nhập

1. Mở trang OTT Code Arena.
2. Chọn **Đăng ký**, nhập username dài 3–32 ký tự, chỉ gồm chữ, số hoặc dấu gạch dưới.
3. Nhập mật khẩu dài 12–128 ký tự và gửi biểu mẫu.
4. Sau khi đăng ký thành công, hệ thống đăng nhập ngay và mở workspace dành cho competitor.

Nếu username đã tồn tại, hãy chọn tên khác. Nếu thử đăng ký hoặc đăng nhập sai quá nhiều lần trong 15 phút, API trả `429`; chờ hết thời gian khóa rồi thử lại.

Tài khoản tự đăng ký không thể tạo hoặc quản lý giải đấu. Vai trò organizer phải được operator cấp ngoài giao diện công khai.

## 2. Điều hướng theo vai trò

### Competitor

- **Tổng quan:** thống kê Bot và giải của bạn.
- **Bot của tôi:** danh sách Bot và thao tác tạo/xóa.
- **Kiểm tra thế cờ:** tự dựng một thế cờ để kiểm tra nước đi theo luật; đây không phải thao tác chạy mã Bot.
- **Giải đấu:** tìm giải có thể xem, gửi đăng ký và theo dõi tiến trình.
- **Hướng dẫn:** nội dung luật và cách dùng tích hợp trong ứng dụng.

Không gian sửa mã Bot không phải mục riêng trên thanh điều hướng. Từ **Bot của tôi**, chọn **Mã nguồn** trên thẻ Bot để mở không gian này.

### Organizer

- **Tổng quan:** thông tin vận hành.
- **Quản lý giải đấu:** tạo giải và đi qua các giai đoạn tổ chức.

Các màn hình và nút được ẩn theo role, nhưng quyền vẫn được backend kiểm tra độc lập.

## 3. Luồng người chơi

1. Vào **Bot của tôi**, chọn **+ Tạo Bot mới**, nhập tên, chọn C++17 hoặc Python 3 rồi sửa mã mẫu. Bạn cũng có thể nhập URL GitHub công khai và chọn **Nạp mã**, hoặc chọn **Tải file mã nguồn (.cpp hoặc .py)**.
2. Chọn **Tạo Bot**. Khi thành công, hệ thống tạo Bot, lưu phiên bản mã nguồn đầu tiên và chọn phiên bản đó làm phiên bản hiện hành.
3. Muốn sửa Bot đã có, chọn **Mã nguồn** trên thẻ Bot, chọn **Tạo bản nháp** ở phiên bản cần sửa, thay đổi mã rồi chọn **Lưu phiên bản**. Hệ thống tạo và tự chọn phiên bản mới; phiên bản cũ vẫn được giữ nguyên.
4. Muốn quay lại một phiên bản khác, chọn trực tiếp thẻ phiên bản trong cột **Phiên bản**. Dấu chọn trên thẻ cho biết phiên bản hiện hành dùng khi đăng ký giải.
5. Dùng **Chạy thử** để kiểm tra mã hiện tại trong đúng một lượt. Thành công nghĩa là Bot biên dịch/chạy được và trả về một nước hợp lệ cho thế cờ thử; kết quả này không bảo đảm Bot hoàn thành được cả trận.
6. Vào **Giải đấu**, mở giải đang nhận đăng ký và chọn **Đăng ký Bot**.
7. Theo dõi trạng thái yêu cầu: chờ xử lý, đã chấp thuận hoặc bị từ chối.
8. Khi lịch đã có, dùng các tab **Thông tin giải đấu**, **Lịch & nhánh đấu**, **Xem trực tiếp** và **Công bố**.

Chi tiết và cách xử lý lỗi ở [Hướng dẫn người chơi](competitor-guide.md).

## 4. Luồng organizer

1. Chọn **Tạo giải đấu**, nhập tên và cấu hình khi giải còn ở trạng thái nháp.
2. Cấu hình lần lượt các tab **Thông tin**, **Luật chơi**, **Quy định** và **Thể thức**, rồi lưu thay đổi.
3. Chọn **Mở đăng ký** hoặc để bộ lập lịch tự chuyển trạng thái theo thời gian đã cấu hình.
4. Xét từng hồ sơ. Hệ thống chỉ cho duyệt phiên bản mã nguồn đã vượt qua bước kiểm tra trước thi đấu (`preflight`).
5. **Đóng đăng ký**, xử lý hết hồ sơ đang chờ rồi **Tạo lịch thi đấu**.
6. Bắt đầu/chạy giải. Với giải nhiều giai đoạn, hệ thống dừng sau mỗi giai đoạn và chờ **Chạy giai đoạn tiếp theo**.
7. Theo dõi cặp đấu lỗi và chỉ dùng thao tác thử lại hoặc đấu lại khi giao diện cung cấp. Trạng thái chờ phân định hòa chỉ còn có thể gặp ở dữ liệu cũ hoặc khi phục hồi kết quả cũ.
8. Khi giải hoàn tất, kiểm tra dữ liệu và chọn **Công bố kết quả**.

Xem điều kiện chi tiết tại [Hướng dẫn ban tổ chức](organizer-guide.md) và [Vòng đời giải đấu](tournament-lifecycle.md).

## 5. Live, kết quả và replay

- Live chỉ khả dụng khi giải đang `running` và pairing có snapshot.
- Trình duyệt ưu tiên SSE; nếu stream lỗi, UI chuyển sang polling có backoff.
- Competitor chỉ xem kết quả/replay sau khi organizer công bố kết quả.
- Organizer sở hữu giải có thể kiểm tra kết quả và replay chưa công bố.
- Replay cho phép tua theo từng nước; dữ liệu mới có thể chứa vị trí `conversionTo` của quân bị chuyển hóa.

Chi tiết ở [Live, kết quả và replay](match-and-replay.md).

## 6. Khi thao tác thất bại

| Hiện tượng | Cách xử lý |
| --- | --- |
| Phiên đăng nhập hết hạn hoặc nhận `401` | Đăng nhập lại. |
| Nhận `403` | Kiểm tra role, quyền sở hữu giải/Bot; tải lại trang để lấy CSRF token mới. |
| Không lưu được revision | Kiểm tra runtime, source không rỗng và dung lượng tối đa 64 KiB theo UTF-8. |
| Chạy thử báo sandbox chưa sẵn sàng | Operator phải bật source execution và Docker sandbox; người dùng không thể sửa từ UI. |
| Không đăng ký được giải | Giải phải đang mở, Bot phải có revision được chọn và chưa có yêu cầu đang hiệu lực. |
| Không thấy replay | Trận phải hoàn tất; competitor còn cần kết quả đã được công bố. |
| Live đứng hoặc báo unavailable | Pairing có thể chưa bắt đầu, giải không còn running hoặc stream đang chuyển sang polling. |

Xem thêm [FAQ](faq.md).
