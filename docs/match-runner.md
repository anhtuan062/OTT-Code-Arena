# Match Runner

## Nhiệm vụ

Match Runner điều phối một ván giữa hai bot:

1. tạo Game Engine với layout đã chọn;
2. lấy trạng thái và legal moves;
3. gọi bot đang đến lượt;
4. kiểm tra response;
5. áp dụng move bằng engine;
6. phát live snapshot;
7. tạo result và replay khi ván kết thúc.

## Vòng lặp lượt

Lượt bắt đầu từ 1. Sau mỗi move hợp lệ:

- quân được di chuyển và quân bị ăn được loại khỏi state;
- `currentPlayer` đổi bên;
- turn tăng;
- snapshot mới có `sequence`, `turn`, `gameNumber`, board và latest move;
- engine kiểm tra thắng hoặc hòa.

Nếu không có legal move, runner hỏi engine về trạng thái cuối. Nếu engine chưa xác định người thắng, ván được ghi hòa với `insufficient_material`.

## Xử lý lỗi bot

| Lỗi | Kết quả |
| --- | --- |
| Timeout/compile timeout/runtime timeout | Đối thủ thắng, `bot_timeout` |
| Process crash/resource limit | Đối thủ thắng, `bot_crash` |
| JSON hoặc response lỗi | Đối thủ thắng, `bot_invalid_json` hoặc `bot_invalid_response` |
| Output rỗng | Đối thủ thắng, `bot_empty_output` |
| Illegal move | Đối thủ thắng, `bot_illegal_move` |
| Lỗi executor/hạ tầng | `engine_error`, pairing có thể thất bại và chạy lại |

Source revision được cấp tối thiểu 5 giây runtime mỗi lượt. Bot legacy dùng `turnTimeoutMs` của trận.

## Result

`MatchResult` chứa:

- match ID và protocol version;
- trạng thái, winner và termination reason;
- số lượt, thời gian bắt đầu/kết thúc;
- identity bot A/B;
- initial state và final state;
- turn log;
- execution provenance/diagnostics giới hạn.

## Replay

`MatchReplay` lưu initial state, danh sách move, final state, winner và termination reason. Replay BO3 có thêm:

- series seed;
- điểm số theo participant cố định;
- tối đa ba game replay;
- participant A/B riêng của từng game;
- winner participant ID.

Replay không suy điểm số từ phía A/B của ván hiện tại vì A/B có thể đổi qua từng ván.

## Live snapshot

Callback `onSnapshot` phát:

- snapshot đầu ván ở lượt 1;
- snapshot sau từng move;
- snapshot cuối ván.

Server giữ history có thứ tự theo cặp `(gameNumber, sequence)`. Frontend nhận live stream chung theo nhịp server để các viewer quan sát cùng tiến trình; polling là đường dự phòng.

## Hủy và cleanup

Abort signal dừng execution đang chạy. Khi match kết thúc hoặc bị hủy, source executor giải phóng artifact và warm container thuộc match scope. Kết quả chỉ được xem là đã commit sau khi persistence hoàn tất.
