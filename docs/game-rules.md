# Luật OTTv2 trên OTT Code Arena

Tài liệu này mô tả luật đang được `engine/`, Match Runner và series implementation thực thi.

## 1. Bàn cờ và quân

- Bàn cờ có 9×9 ô. Tọa độ cột là `a`–`i`, hàng là `1`–`9`; trong code dùng `row`/`col` từ 0 đến 8.
- Hai phía là A và B.
- Ba loại quân: Đấm (`dam`), Lá (`la`) và Kéo (`keo`). Một số màn hình cũ hiển thị Đấm là **Búa** và Lá là **Bao**; đó là hai tên hiển thị cho cùng mã quân, không phải loại quân khác.
- Mỗi bên bắt đầu với 9 quân: 3 quân mỗi loại.
- A ở phía trên và nhắm ô đích `i9`; B ở phía dưới và nhắm ô đích `a1`.

### Bố cục quân cờ lúc bắt đầu

Engine có ba bố cục seeded được dùng cho các ván tournament; Bố cục 1 cũng là bố cục mặc định/lịch sử. Mỗi bố cục vẫn có 9 quân mỗi bên; B là ảnh đối xứng của A qua tâm bàn cờ. Tọa độ dưới đây dùng đúng quy ước cột `a`–`i`, hàng `1`–`9`.

#### Bố cục 1 — bố cục lịch sử/mặc định

| Phía | Đấm | Lá | Kéo |
| --- | --- | --- | --- |
| A | `c1`, `g2`, `h3` | `f1`, `i2`, `b3` | `i1`, `d2`, `e3` |
| B | `g9`, `c8`, `b7` | `d9`, `a8`, `h7` | `a9`, `f8`, `e7` |

#### Bố cục 2

| Phía | Đấm (`dam`) | Lá (`la`) | Kéo (`keo`) |
| --- | --- | --- | --- |
| A | `b1`, `e2`, `h3` | `d1`, `h2`, `b3` | `g1`, `c2`, `f3` |
| B | `h9`, `e8`, `b7` | `f9`, `b8`, `h7` | `c9`, `g8`, `d7` |

#### Bố cục 3

| Phía | Đấm (`dam`) | Lá (`la`) | Kéo (`keo`) |
| --- | --- | --- | --- |
| A | `b1`, `f2`, `i3` | `e1`, `a2`, `g3` | `h1`, `d2`, `c3` |
| B | `h9`, `d8`, `a7` | `e9`, `i8`, `c7` | `b9`, `f8`, `g7` |

Trong tournament, hệ thống chọn một trong ba bố cục bằng `seed` ổn định của series và `gameNumber`. Vì vậy không được giả định ván 1 luôn dùng Bố cục 1; cùng một series sẽ giữ nguyên lựa chọn khi retry hoặc xem Replay, còn các ván khác trong series có thể có vị trí xuất phát khác. Chế độ kiểm tra Bot dùng kịch bản riêng và không đại diện cho bố cục tournament.

## 2. Di chuyển

Ở lượt của mình, người chơi chọn một quân và đi đúng một ô theo một trong tám hướng: ngang, dọc hoặc chéo.

Nước đi không hợp lệ nếu:

- ra ngoài bàn;
- đứng yên hoặc đi xa hơn một ô;
- chọn quân của đối phương;
- đi vào ô có quân cùng phía;
- cố ăn quân không đúng quan hệ;
- khi Conversion bật, engine không tìm được ô hợp lệ cho quân chuyển hóa.

Bot không cần tự suy đoán toàn bộ luật: request cung cấp danh sách `legalMoves`. Response phải chọn đúng một phần tử trong danh sách này.

## 3. Ăn quân

Quan hệ ăn quân:

| Quân tấn công | Ăn được |
| --- | --- |
| Đấm (`dam`) | Kéo (`keo`) |
| Kéo (`keo`) | Lá (`la`) |
| Lá (`la`) | Đấm (`dam`) |

Không được ăn quân cùng loại hoặc quân không bị khắc chế. Khi luật chuẩn được dùng, quân bị ăn bị loại và quân tấn công đi vào ô đó.

## 4. Rule modifier Conversion

Conversion mặc định tắt. Khi bật, một nước ăn hợp lệ không loại quân bị ăn mà:

1. đổi quân đó sang phía của quân tấn công;
2. di chuyển quân tấn công vào ô bị ăn;
3. đặt quân chuyển hóa vào ô trống gần ô bị ăn nhất theo khoảng cách Chebyshev;
4. nếu nhiều ô cùng khoảng cách, chọn deterministic theo thứ tự theo chiều kim đồng hồ bắt đầu từ phía trên;
5. loại ô đã có quân, hai ô đích và ô xuất phát của quân tấn công.

Nếu không có ô đặt hợp lệ, nước ăn không được tạo trong `legalMoves`. Replay mới ghi vị trí bằng `conversionTo`.

## 5. Thắng

Một phía thắng ngay khi:

- **Ăn hết toàn bộ quân đối phương** (`all_pieces_captured`); hoặc
- **Đạt ô đích** (`goal_reached`): A tới `i9`, B tới `a1`.

Ăn hết một hoặc hai loại quân nhưng đối phương vẫn còn quân không phải điều kiện thắng.

## 6. Hòa

Game Engine trả hòa khi:

- `state.turn > maxTurns` (`turn_limit`); mặc định `maxTurns=200`;
- cả hai bên chỉ còn đúng một loại quân và đó là cùng một loại (`insufficient_material`);
- Match Runner không còn legal move và không xác định được winner; nó kết thúc với lý do `insufficient_material`.

`checkDraw` trong engine có nhánh threefold-position `repetition`, nhưng authoritative Match Runner còn áp dụng repetition-loss riêng như phần dưới.

## 7. Thua do lặp

Sau nước của một Bot, Match Runner xử Bot đó thua và đối phương thắng với lý do `repetition` nếu xảy ra một trong các trường hợp:

- cùng một quân dao động giữa hai ô qua bốn nước liên tiếp của quân đó, ví dụ `d3-d4-d3-d4-d3`;
- cùng một quân thực hiện cùng một nước có hướng ba lần;
- cùng một board-state hash xuất hiện ba lần.

Các kiểm tra cấp quân chỉ xét chuỗi sau lần ăn quân gần nhất; một nước ăn sẽ cắt chuỗi lặp.

## 8. Thua do Bot

| Termination reason | Trường hợp |
| --- | --- |
| `bot_timeout` | Timeout preparation/compile/runtime được map theo policy |
| `bot_compilation_failed` | Compilation failure trong prewarm/series authoritative |
| `bot_crash` | Process/container crash hoặc vượt resource limit |
| `bot_empty_output` | Không có output |
| `bot_invalid_json` | Output không phải JSON hợp lệ |
| `bot_invalid_response` | Thiếu/sai field hoặc tọa độ/response không hợp lệ |
| `bot_illegal_move` | Nước không thuộc legal moves hoặc security violation được map theo policy |

Lỗi hạ tầng `EXECUTOR_UNAVAILABLE`/`EXECUTOR_ERROR` được map `engine_error` và được tầng tournament xử lý như lỗi có thể retry, không tự động quy thua Bot.

## 9. BO1, BO2 và BO3

- **BO1:** một ván; dùng trong các luồng/dữ liệu tương thích.
- **BO2:** hai ván, đổi phía ở ván 2; series có thể hòa. Group stage của multi-stage dùng BO2.
- **BO3:** tối đa ba ván, dừng khi một participant đạt hai thắng. Ván 2 đổi phía; phía ở ván 3 được chọn deterministic từ series seed.

Nếu ván 3 BO3 hòa, participant còn nhiều quân hơn thắng ván. Nếu vẫn bằng quân, participant ở phía A của ván 3 thua và phía B thắng. Quy tắc này chỉ áp dụng tiebreak ván 3 BO3, không đổi kết quả hòa của BO1/BO2.

## 10. Điểm bảng

Cấu hình mặc định cho giải mới:

- thắng series: 3 điểm;
- hòa series: 1 điểm;
- thua: 0 điểm;
- bye: 0 điểm.

Thứ tự xếp hạng dùng tổng điểm, đối đầu trực tiếp khi đúng hai participant bằng điểm, rồi participant ID để có thứ tự ổn định. Cấu hình scoring được lưu trong tournament; dữ liệu legacy có normalization riêng.

Xem thêm [Strategy SDK](strategy-sdk.md), [Trận đấu và replay](match-and-replay.md) và [Vòng đời giải](tournament-lifecycle.md).
