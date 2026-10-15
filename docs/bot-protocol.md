# Bot Protocol 0.1.0

Bot Protocol là contract JSON giữa Match Runner và bot. Strategy SDK xử lý contract này tự động; tài liệu này chủ yếu dành cho chế độ `raw` và việc kiểm thử tích hợp.

## Transport

- Mã hóa UTF-8.
- Mỗi lần gọi nhận một JSON object qua stdin.
- Bot trả đúng một JSON object qua stdout.
- Log chẩn đoán ghi vào stderr.
- Mỗi lượt là một lần request/response độc lập.

## Request

```json
{
  "protocol_version": "0.1.0",
  "match_id": "match-123",
  "turn": 1,
  "player": "A",
  "board_size": 9,
  "pieces": [
    {"id": "A-dam-1", "type": "dam", "player": "A", "pos": "c1"}
  ],
  "legal_moves": [
    {"piece_id": "A-dam-1", "from": "c1", "to": "c2", "captures": null}
  ]
}
```

| Trường | Ý nghĩa |
| --- | --- |
| `protocol_version` | Luôn là `0.1.0` |
| `match_id` | Mã trận hoặc mã ván |
| `turn` | Lượt hiện tại, bắt đầu từ 1 |
| `player` | Bên của bot trong ván: A hoặc B |
| `board_size` | Luôn là 9 |
| `pieces` | Toàn bộ quân còn trên bàn |
| `legal_moves` | Danh sách nước đi engine chấp nhận |

`captures` là ID quân bị ăn hoặc `null`.

## Response

```json
{
  "move": {
    "piece_id": "A-dam-1",
    "from": "c1",
    "to": "c2"
  }
}
```

Response phải dùng tọa độ `a1`–`i9`, đi đúng một ô và khớp một phần tử trong `legal_moves`. Engine vẫn kiểm tra lại trước khi áp dụng.

## Quy tắc output

- Không in log hoặc văn bản khác ra stdout.
- Dùng stderr cho log.
- Exit code 0 khi hoàn thành bình thường.
- Output rỗng, JSON lỗi, response lỗi hoặc nước đi bất hợp lệ đều dẫn tới forfeit.

## Các nhóm lỗi

- Request: `INVALID_REQUEST`, `UNSUPPORTED_VERSION`, `INVALID_MATCH_ID`, `INVALID_TURN`, `INVALID_PLAYER`, `INVALID_BOARD_SIZE`, `INVALID_PIECES`, `INVALID_LEGAL_MOVES`.
- Response: `INVALID_JSON`, `INVALID_RESPONSE`, `MISSING_MOVE`, `INVALID_MOVE`, `INVALID_PIECE_ID`, `INVALID_FROM`, `INVALID_TO`, `INVALID_MOVE_SAME_SQUARE`, `INVALID_MOVE_DISTANCE`.
- Executor: `COMPILATION_TIMEOUT`, `RUNTIME_TIMEOUT`, `PROCESS_CRASHED`, `RESOURCE_LIMIT_EXCEEDED`, `SECURITY_VIOLATION`, `SANDBOX_REQUIRED`.

## Ví dụ Python raw

```python
import json
import sys

request = json.loads(sys.stdin.read())
move = request["legal_moves"][0]
print(json.dumps({
    "move": {
        "piece_id": move["piece_id"],
        "from": move["from"],
        "to": move["to"],
    }
}), flush=True)
```

## Kiểm thử

```powershell
npx vitest run tests/protocol
```
