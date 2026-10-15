# Luật chơi OTTv2

## Bàn cờ và quân

- Bàn cờ có kích thước 9×9.
- Tọa độ ngoài dùng từ `a1` đến `i9`; bên trong dùng `row` và `col` từ 0 đến 8.
- Mỗi bên bắt đầu với 9 quân: 3 Búa (`dam`), 3 Bao (`la`) và 3 Kéo (`keo`).
- Bên A đi trước và xuất phát ở ba hàng phía trên; bên B xuất phát ở ba hàng phía dưới.

Trong BO3, layout được chọn ổn định từ series seed. Ván 1, 2 và 3 dùng ba layout khác nhau; chạy lại hoặc khởi động lại vẫn tái tạo đúng layout của ván đó.

## Di chuyển

Một quân đi đúng một ô theo một trong tám hướng:

- ngang;
- dọc;
- chéo.

Không được đi ra ngoài bàn cờ, đứng yên hoặc đi vào ô có quân cùng bên.

## Ăn quân

Quan hệ ăn quân:

| Quân đi | Ăn được |
| --- | --- |
| Búa (`dam`) | Kéo (`keo`) |
| Kéo (`keo`) | Bao (`la`) |
| Bao (`la`) | Búa (`dam`) |

Không được ăn quân cùng loại hoặc quân cùng bên.

## Điều kiện thắng

Một bên thắng ngay khi:

1. ăn hết toàn bộ quân đối thủ; hoặc
2. đưa một quân tới ô đích của mình.

Ô đích được gắn theo bên:

- A thắng khi tới `i9`;
- B thắng khi tới `a1`.

Chỉ ăn hết một loại quân của đối thủ không tạo chiến thắng.

## Điều kiện hòa

Ván đấu hòa khi:

- số lượt vượt quá `maxTurns` của trận, mặc định 200;
- cùng một thế cờ với cùng bên đến lượt xuất hiện ba lần khi position history được cung cấp;
- hai bên chỉ còn một loại quân giống nhau;
- không còn legal move nhưng engine không xác định được bên thắng.

## Lỗi bot

Bot thua ván theo forfeit nếu:

- timeout;
- process crash;
- output rỗng hoặc không phải JSON hợp lệ;
- response thiếu trường bắt buộc;
- nước đi không nằm trong legal moves;
- vi phạm policy bảo mật hoặc giới hạn tài nguyên.

Lỗi hạ tầng như Docker không sẵn sàng được phân biệt với kết quả thi đấu; pairing có thể chuyển sang `failed` để organizer chạy lại.

## BO1, BO3 và điểm giải

- BO1 kết thúc sau một ván và hiển thị tỷ số `1-0`, `0-1` hoặc `0-0` nếu hòa.
- BO3 kết thúc khi một participant đủ hai ván thắng hoặc sau ba ván.
- Ván hòa không cộng vào số ván thắng.
- Điểm bảng xếp hạng tính theo series: thắng 3, hòa 1, thua 0.
- Miễn đấu chỉ giúp participant đi tiếp trong lịch; không đánh dấu là thắng và không cộng điểm.
