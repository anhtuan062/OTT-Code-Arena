# Bot Protocol 0.1.0

Tài liệu này mô tả chi tiết giao thức truyền thông JSON (Bot Protocol phiên bản `0.1.0`) giữa nền tảng OTT Code Arena và các Bot dự thi.

Giao thức này được định nghĩa tại `bot-protocol/types.ts` và được kiểm thực chặt chẽ tại `bot-protocol/validation.ts`. Đối với các bot sử dụng Strategy SDK (C++ hoặc Python), giao thức này được xử lý ngầm tự động; tài liệu này là cơ sở kỹ thuật cho chế độ chạy trực tiếp (`raw`) và tích hợp kiểm thử.

---

## 1. Cơ chế Truyền dữ liệu (Transport)

- **Kênh giao tiếp**: Chuẩn vào/ra tiêu chuẩn (`stdin` / `stdout`).
- **Định dạng dữ liệu**: Chuỗi JSON mã hóa UTF-8.
- **Mô hình**: Request / Response đồng bộ theo từng lượt đấu (`turn`):
  1. Nền tảng ghi một JSON object duy nhất vào `stdin` của Bot và đóng/flush stream.
  2. Bot đọc dữ liệu từ `stdin`, tính toán nước đi.
  3. Bot in đúng một JSON object chứa nước đi ra `stdout` và flush stream.
  4. Mọi thông tin ghi log, debug của Bot **bắt buộc** phải ghi ra `stderr`. Tuyệt đối không in log ra `stdout`.
  5. Bot kết thúc lượt với mã thoát (`exit code`) là 0.

---

## 2. Dữ liệu Gửi tới Bot (BotRequest)

Ở mỗi lượt đi, nền tảng gửi một JSON object tới Bot có cấu trúc như sau:

```json
{
  "protocol_version": "0.1.0",
  "match_id": "m-8f72a1b9",
  "turn": 1,
  "player": "A",
  "board_size": 9,
  "pieces": [
    {
      "id": "A-dam-1",
      "type": "dam",
      "player": "A",
      "pos": "c1"
    },
    {
      "id": "B-keo-1",
      "type": "keo",
      "player": "B",
      "pos": "g9"
    }
  ],
  "legal_moves": [
    {
      "piece_id": "A-dam-1",
      "from": "c1",
      "to": "c2",
      "captures": null
    },
    {
      "piece_id": "A-dam-1",
      "from": "c1",
      "to": "d2",
      "captures": "B-keo-1"
    }
  ]
}
```

### Chi tiết các trường của `BotRequest`:

| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `protocol_version` | `string` | Phiên bản giao thức, cố định là `"0.1.0"`. |
| `match_id` | `string` | Mã định danh duy nhất của trận đấu hoặc ván đấu hiện tại. |
| `turn` | `number` | Số thứ tự lượt đi hiện tại (bắt đầu từ `1`). |
| `player` | `'A' \| 'B'` | Phe mà Bot đang điều khiển trong ván đấu (`"A"` đi trước, `"B"` đi sau). |
| `board_size` | `number` | Kích thước cạnh bàn cờ, cố định là `9`. |
| `pieces` | `BotPiece[]` | Danh sách toàn bộ các quân cờ hiện còn trên bàn cờ. |
| `legal_moves` | `BotMoveOption[]`| Danh sách đầy đủ tất cả các nước đi hợp lệ mà Bot được phép chọn ở lượt này. |

### Cấu trúc phần tử `BotPiece`:
- `id` (`string`): Mã định danh duy nhất của quân cờ.
- `type` (`'dam' | 'la' | 'keo'`): Loại quân (`dam`: Búa, `la`: Bao, `keo`: Kéo).
- `player` (`'A' | 'B'`): Phe sở hữu quân cờ.
- `pos` (`string`): Tọa độ ô cờ hiện tại theo chuẩn đại số (`a1` đến `i9`).

### Cấu trúc phần tử `BotMoveOption`:
- `piece_id` (`string`): Mã quân cờ thực hiện nước đi.
- `from` (`string`): Tọa độ ô xuất phát (`a1`–`i9`).
- `to` (`string`): Tọa độ ô đích (`a1`–`i9`).
- `captures` (`string | null`): Mã quân cờ đối phương bị ăn tại ô đích, hoặc `null` nếu đi vào ô trống.

---

## 3. Dữ liệu Phản hồi từ Bot (BotResponse)

Bot phản hồi về `stdout` đúng một JSON object chứa thuộc tính `move`:

```json
{
  "move": {
    "piece_id": "A-dam-1",
    "from": "c1",
    "to": "d2"
  }
}
```

### Chi tiết các trường của `BotResponse`:

| Trường | Kiểu dữ liệu | Bắt buộc | Mô tả |
| :--- | :--- | :---: | :--- |
| `move` | `object` | Có | Đối tượng chứa thông tin nước đi. |
| `move.piece_id` | `string` | Có | Mã quân cờ được chọn để di chuyển. |
| `move.from` | `string` | Có | Tọa độ ô xuất phát (phải khớp vị trí hiện tại của quân cờ). |
| `move.to` | `string` | Có | Tọa độ ô đích (cách ô xuất phát đúng 1 ô theo 8 hướng). |

---

## 4. Quy tắc Kiểm thực và Xử lý Lỗi

Phía server thực thi quy trình kiểm tra phản hồi theo thứ tự nghiêm ngặt tại `bot-protocol/validation.ts`:

1. **Kiểm tra cú pháp JSON**: Phản hồi phải parse được bằng `JSON.parse`. Nếu lỗi cú pháp $\rightarrow$ Lỗi `INVALID_JSON`.
2. **Kiểm tra cấu trúc Root**: Phản hồi phải là object chứa trường `move` dạng object $\rightarrow$ Nếu thiếu hoặc sai kiểu: Lỗi `INVALID_RESPONSE` hoặc `MISSING_MOVE`.
3. **Kiểm tra trường dữ liệu**: `piece_id`, `from`, `to` phải là chuỗi không rỗng $\rightarrow$ Nếu sai: Lỗi `INVALID_PIECE_ID`, `INVALID_FROM`, `INVALID_TO`.
4. **Kiểm tra định dạng tọa độ**: `from` và `to` phải khớp biểu thức chính quy `/^[a-i][1-9]$/` $\rightarrow$ Nếu sai: Lỗi `INVALID_FROM` hoặc `INVALID_TO`.
5. **Kiểm tra khoảng cách**: Không được đứng yên (`from === to`) và khoảng cách mỗi trục không vượt quá 1 ô $\rightarrow$ Nếu sai: Lỗi `INVALID_MOVE_SAME_SQUARE` hoặc `INVALID_MOVE_DISTANCE`.
6. **Kiểm tra tính hợp lệ với Engine (`legal_moves`)**: Nước đi gửi về phải khớp chính xác với ít nhất một nước đi trong danh sách `legal_moves` mà server đã cung cấp ở lượt đó $\rightarrow$ Nếu không tìm thấy: Lỗi `ILLEGAL_MOVE`.

Mọi vi phạm kiểm thực ở trên đều dẫn đến việc bot bị xử thua ván đấu ngay lập tức theo cơ chế forfeit (`bot_invalid_json` hoặc `bot_illegal_move`).

---

## 5. Ví dụ Mẫu Bot triển khai Raw Protocol (Python 3)

Dưới đây là một ví dụ bot hoàn chỉnh ở chế độ `raw` (tự đọc/ghi JSON không thông qua Strategy SDK):

```python
import json
import sys

def main():
    try:
        # 1. Đọc dữ liệu yêu cầu từ stdin
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            sys.exit(1)

        request = json.loads(raw_input)

        # 2. Lấy danh sách nước đi hợp lệ
        legal_moves = request.get("legal_moves", [])
        if not legal_moves:
            sys.exit(0)

        # 3. Thuật toán chọn nước đi (ví dụ: chọn nước đi hợp lệ đầu tiên)
        chosen_move = legal_moves[0]

        # 4. Đóng gói phản hồi đúng định dạng giao thức 0.1.0
        response = {
            "move": {
                "piece_id": chosen_move["piece_id"],
                "from": chosen_move["from"],
                "to": chosen_move["to"]
            }
        }

        # 5. Xuất phản hồi ra stdout và flush
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()
        sys.exit(0)

    except Exception as exc:
        # Ghi log lỗi ra stderr, tuyệt đối không in ra stdout
        sys.stderr.write(f"Bot error: {exc}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
```
