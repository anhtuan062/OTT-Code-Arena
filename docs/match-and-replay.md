# Trận đấu, xem trực tiếp và replay

## 1. Ván đấu được xử lý như thế nào

Match Runner tạo trạng thái ban đầu, gửi cho Bot trạng thái bàn cờ cùng danh sách nước hợp lệ `legalMoves`, kiểm tra phản hồi và áp dụng nước đi bằng Game Engine. Mỗi lượt có giới hạn thời gian; lỗi Bot được đổi thành lý do kết thúc chuẩn hóa. Khi ván kết thúc, hệ thống tạo kết quả, dữ liệu xem lại và ảnh chụp trạng thái trực tiếp cuối cùng.

Một **loạt đấu** (series) có thể chứa nhiều ván; BO là viết tắt của “best of”, tức số ván tối đa của loạt:

- BO1: một ván, chủ yếu cho dữ liệu/luồng legacy.
- BO2: luôn tối đa hai ván và đổi phía A/B ở ván 2; series có thể hòa.
- BO3: dừng khi một participant thắng hai ván; nếu cần ván 3 và ván này hòa, implementation dùng số quân còn lại để phân định. Nếu số quân vẫn bằng nhau, participant ở phía A của ván 3 thua, phía B thắng.

## 2. Xem trực tiếp

1. Mở giải đang chạy.
2. Chọn tab **Xem trực tiếp**.
3. Chọn cặp đấu có trạng thái đang thi đấu.

Trình duyệt mở luồng Server-Sent Events (SSE) để nhận cập nhật từ server. Mỗi sự kiện chứa một ảnh chụp trạng thái có số thứ tự `sequence`. Nếu luồng lỗi, trình duyệt chuyển sang hỏi lại định kỳ (polling); khi nhận lỗi `429`, nó chờ theo `Retry-After` và tăng dần khoảng chờ.

Live có thể báo `unavailable` khi:

- giải không ở trạng thái `running`;
- pairing chưa có snapshot;
- match ID/pairing ID không thuộc giải;
- trận đã chuyển sang trạng thái khác.

Trong BO2/BO3, UI giữ kết quả ván vừa hoàn tất trong thời gian chuyển sang ván kế tiếp, rồi cập nhật participant theo phía hiện tại.

## 3. Đọc bàn cờ và kết quả

- Bàn 9×9 có cột `a`–`i`, hàng `1`–`9`.
- Replay đánh dấu ô xuất phát/đích của nước gần nhất và quân bị ăn.
- Người thắng là phía A, B, `draw` (hòa) hoặc chưa có giá trị khi trận chưa kết thúc.
- Lý do kết thúc công khai chỉ lấy từ danh sách được phép: ăn hết quân, đạt đích, hết giới hạn lượt, lặp nước và các lỗi Bot đã chuẩn hóa.
- Kết quả dành cho người xem không chứa nguồn gốc thực thi và thông tin chẩn đoán nội bộ; ban tổ chức sở hữu giải nhận được dữ liệu chi tiết hơn.

Luật đầy đủ ở [Luật OTTv2](game-rules.md).

## 4. Replay

Replay lưu:

- trạng thái ban đầu;
- danh sách nước đi;
- trạng thái cuối;
- winner và termination reason;
- identity participant đã được phép công khai;
- envelope của series nếu là BO2/BO3;
- `ruleModifiers` với replay mới.

Dùng nút điều khiển replay để về đầu, lùi/tiến từng nước hoặc phát tự động. Client dựng lại state bằng cách áp dụng lần lượt các move.

Khi Conversion bật, move mới có `conversionTo`: quân bị ăn đổi chủ và được đặt ở ô trống do engine chọn. Replay cũ không có trường này dùng fallback lịch sử là vị trí xuất phát của quân tấn công; đây là tương thích dữ liệu cũ, không phải luật tạo replay mới.

## 5. Quyền xem

| Dữ liệu | Organizer sở hữu giải | Competitor/người dùng xác thực |
| --- | --- | --- |
| Live khi giải running và public-visible | Có | Có |
| Result/replay trước công bố | Có | Không |
| Result/replay sau công bố | Có | Có, qua public projection |
| Diagnostic/provenance executor | Có thể có ở owner endpoint | Bị loại khỏi public result |

Endpoint cố ý dùng `404` trong một số trường hợp không được phép xem để không làm lộ sự tồn tại của dữ liệu.

## 6. Tính toàn vẹn và lưu trữ

Tournament persistence ghi result, replay và file commit chứa hash. Recovery chỉ coi match là hoàn tất khi bộ dữ liệu commit hợp lệ và identity khớp. Public replay exporter kiểm tra hash, tạo file allowlisted và manifest; nó không xuất source hoặc executor diagnostic.

Nếu replay không tải được:

1. xác nhận trận/pairing đã hoàn tất;
2. với competitor, xác nhận organizer đã công bố;
3. tải lại trang để loại cache UI cũ;
4. nếu organizer vẫn không xem được, kiểm tra log persistence/commit integrity thay vì sửa trực tiếp JSON.

Xem implementation chi tiết ở [Match Runner](match-runner.md) và [Tournament & Live](tournament-live.md).
