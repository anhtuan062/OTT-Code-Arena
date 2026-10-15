# Strategy SDK 1.0.0

Strategy SDK cho phép người chơi chỉ viết hàm chọn nước đi. Nền tảng cung cấp wrapper, đọc/ghi JSON, kiểm tra protocol và chạy source trong Docker.

## Contract chung

- Runtime hỗ trợ: C++17 (`cpp`) và Python 3 (`python3`).
- `state.player` cho biết bot đang là A hay B trong ván hiện tại.
- `legalMoves` là danh sách do engine sinh và là nguồn hợp lệ duy nhất.
- Bot phải trả về một phần tử thuộc `legalMoves`.
- Nếu không có legal move, Match Runner tự kết thúc ván và không gọi strategy.
- Source UTF-8 tối đa 64 KiB.
- Revision strategy được ghim bằng source digest, SDK version và SDK digest.

## C++17

Triển khai:

```cpp
Move chooseMove(const GameState& state,
                const std::vector<Move>& legalMoves) {
    return legalMoves.front();
}
```

Dùng mẫu tại `bot-sdk/templates/cpp17.cpp`. Không viết `main`, không tự đọc stdin và không in JSON.

C++ được biên dịch bằng:

```text
-std=c++17 -O2 -pipe -s -static
```

## Python 3

Triển khai:

```python
def choose_move(state: GameState, legal_moves: list[Move]) -> Move:
    return legal_moves[0]
```

Dùng mẫu tại `bot-sdk/templates/python3.py`. Runner của SDK gọi hàm và xác nhận kết quả thuộc legal moves.

## Identity và kiểm tra toàn vẹn

Mỗi revision lưu:

- `runtimeId`;
- `executionMode=strategy`;
- SHA-256 của source;
- SDK version;
- SDK digest.

Server từ chối chạy nếu source hoặc SDK identity không khớp dữ liệu đã ghim. Revision cũ ở chế độ `raw` vẫn dùng wrapper tương thích riêng.

## Thời gian thực thi

- Source revision được cấp tối thiểu 5 giây runtime mỗi lượt.
- C++ có bước biên dịch riêng; timeout biên dịch mặc định của server hiện tại là 120 giây.
- Artifact C++ và warm container được tái sử dụng trong phạm vi một trận, sau đó được cleanup.
