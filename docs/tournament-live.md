# Giải đấu, live và replay

## Vòng đời giải

1. Organizer tạo giải ở trạng thái `draft`.
2. Mở đăng ký.
3. Competitor gửi yêu cầu bằng bot và revision đang chọn.
4. Organizer duyệt hoặc từ chối.
5. Đóng đăng ký, sinh lịch vòng tròn và bắt đầu giải.
6. Server chạy pairing qua hàng đợi.
7. Organizer công bố kết quả sau khi giải hoàn tất.

API tạo giải hiện đặt `bestOf: 3`. Tournament cũ không có trường này được xử lý như BO1.

## BO3

- Ván 1: thứ tự participant ban đầu.
- Ván 2: đảo A/B.
- Ván 3: thứ tự quyết định ổn định từ seed.
- Score luôn gắn với participant, không gắn cố định với nhãn A/B.
- Dừng sớm khi một participant đủ hai ván thắng.
- Khoảng nghỉ server giữa các ván là 2,5 giây.
- Layout mỗi ván khác nhau nhưng deterministic theo seed.

## Live spectator

Điều kiện:

- người xem phải đăng nhập;
- tournament phải ở trạng thái `running`;
- match phải thuộc tournament.

Người xem không cần tham gia giải hoặc được mời. Organizer live endpoint riêng vẫn yêu cầu organizer sở hữu giải.

Frontend ưu tiên SSE tại:

```text
GET /api/tournaments/:id/spectator/matches/:matchId/live/stream
```

Polling dự phòng:

```text
GET /api/tournaments/:id/spectator/matches/:matchId/live
```

Payload gồm series score theo competitor, game hiện tại, history có thứ tự và thời gian polling đề xuất. Khi kết thúc ván, server cập nhật progress bền vững trước khi phát lại snapshot cuối để modal nhận đúng tỷ số.

## Đồng bộ nhiều người xem

SSE sử dụng nhịp phát chung phía server. Viewer late join nhận trạng thái hiện tại thay vì tự phát lại từ lượt 1. Cặp `gameNumber` và `sequence` dùng để loại frame cũ, tránh trộn ván hoặc bỏ thứ tự.

Frontend có thể tạo khoảng hiển thị ngắn giữa các move, nhưng không được dùng điểm aggregate tương lai để cập nhật ván chưa phát xong.

## Replay

- Replay chưa công bố: chỉ owner của tournament.
- Replay đã công bố: mọi tài khoản đã xác thực.
- Replay BO3 cho phép chọn từng ván và ánh xạ đúng tên participant khi A/B đổi.
- Source, SDK digest nội bộ, raw diagnostics và stderr không xuất hiện trong spectator replay.

## Retry

Organizer có thể chạy lại pairing hợp lệ qua:

```text
POST /api/tournaments/:id/pairings/:pairingId/retry
```

Server chuẩn bị lại pairing, ngăn nhiều lần retry đồng thời và chạy nền qua hàng đợi. Không cho retry pairing chưa có kết quả/lỗi cần thay thế. Result đã commit là nguồn dữ liệu authoritative; retry không được cộng standings hai lần.

## Restart server

Khi server khởi động:

- result/replay đã commit được giữ nguyên;
- pairing `in_progress` chưa có result được chuyển về `scheduled`;
- tiến độ BO3 đã lưu có thể tiếp tục từ game kế tiếp;
- organizer có thể tiếp tục chạy giải.

## Rate limit

Spectator polling có rate limit theo user, IP, tournament và match. Khi vượt giới hạn, API trả `429`, `Retry-After` và `retryAfterMs`. Frontend phải backoff theo response, không polling dồn dập.
