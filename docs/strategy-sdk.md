# Strategy SDK 1.0.0

Strategy SDK (phiên bản `1.0.0`) là bộ thư viện tiêu chuẩn giúp người tham gia giải đấu tập trung hoàn toàn vào thuật toán ra quyết định (`chooseMove` / `choose_move`) mà không phải xử lý giao thức I/O, phân tích chuỗi JSON, hay vòng lặp stdin/stdout.

Toàn bộ mã nguồn SDK nằm tại thư mục `bot-sdk/`:
- Phiên bản: `bot-sdk/VERSION` (giá trị: `1.0.0`)
- C++17 Header: `bot-sdk/cpp/ott_strategy_sdk.hpp`
- Python 3 Module: `bot-sdk/python/ott_strategy_sdk.py` và runner: `bot-sdk/python/runner.py`
- Mẫu khởi tạo: `bot-sdk/templates/cpp17.cpp` và `bot-sdk/templates/python3.py`

---

## 1. Nguyên tắc Hoạt động

1. **Ranh giới Trách nhiệm**:
   - Thí sinh chỉ viết duy nhất thân hàm chọn nước đi.
   - Nền tảng tự động cung cấp file header/module, mã bọc (`wrapper`), đọc dữ liệu từ `stdin`, ánh xạ sang struct/class có kiểu dữ liệu mạnh, kiểm tra tính hợp lệ và xuất kết quả ra `stdout`.
2. **Nước đi hợp lệ (`legalMoves`)**:
   - Tham số `legalMoves` truyền vào hàm là danh sách các nước đi do Game Engine sinh ra cho thế cờ hiện tại.
   - Bot **bắt buộc** phải trả về một phần tử nằm trong danh sách `legalMoves`.
   - Nếu ở lượt đó không còn nước đi hợp lệ nào, Match Runner tự động xử lý kết thúc ván đấu mà không gọi hàm của Bot.
3. **Độ an toàn & Tính bất biến**:
   - Các đối tượng `GameState` và `Move` trong Python được đóng băng (`@dataclass(frozen=True)`).
   - Trong C++, dữ liệu truyền qua tham chiếu hằng (`const GameState&`, `const std::vector<Move>&`).
4. **Giới hạn mã nguồn**:
   - Kích thước file mã nguồn tải lên tối đa là **64 KiB** và phải mã hóa UTF-8 hợp lệ.

---

## 2. Hướng dẫn Lập trình C++17

### 2.1. Cấu trúc Dữ liệu (`ott_strategy_sdk.hpp`)

```cpp
struct Move {
    std::string piece_id;       // Mã quân cờ (ví dụ: "A-dam-1")
    std::string from;           // Ô xuất phát (ví dụ: "c1")
    std::string to;             // Ô đích (ví dụ: "c2")
    std::string captures;       // Mã quân bị ăn (nếu không ăn quân thì rỗng)
    bool has_capture;          // true nếu có ăn quân, false nếu không
};

struct Piece {
    std::string id;             // Mã quân cờ
    std::string type;           // "dam", "la" hoặc "keo"
    char player;                // 'A' hoặc 'B'
    std::string pos;            // Tọa độ hiện tại (ví dụ: "a1")
};

struct GameState {
    std::string protocol_version; // "0.1.0"
    std::string match_id;         // Mã trận đấu
    int turn;                     // Lượt hiện tại (bắt đầu từ 1)
    char player;                  // Phe của Bot: 'A' hoặc 'B'
    int board_size;               // 9
    std::vector<Piece> pieces;    // Toàn bộ quân cờ trên bàn
};
```

### 2.2. Triển khai Hàm `chooseMove`

Thí sinh triển khai mã nguồn theo mẫu tại `bot-sdk/templates/cpp17.cpp`:

```cpp
#include "ott_strategy_sdk.hpp"
#include <vector>

using namespace std;

Move chooseMove(const GameState& state, const vector<Move>& legalMoves) {
    // state.player cho biết Bot đang là bên A (đi trước) hay bên B (đi sau).
    // Ví dụ cơ bản: A chọn nước đầu tiên, B chọn nước cuối cùng trong danh sách hợp lệ.
    if (state.player == 'A') {
        return legalMoves.front();
    }
    return legalMoves.back();
}
```

*Lưu ý*:
- Không viết hàm `main()`.
- Không đọc từ `std::cin` và không ghi dữ liệu vào `std::cout`.
- Có thể dùng `std::cerr` để in thông tin debug.
- Lệnh biên dịch chuẩn của hệ thống trong container GCC:
  ```bash
  g++ -std=c++17 -O2 -pipe -s -static solution.cpp -o solution
  ```

---

## 3. Hướng dẫn Lập trình Python 3

### 3.1. Cấu trúc Dữ liệu (`ott_strategy_sdk.py`)

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Move:
    piece_id: str              # Mã quân cờ
    from_position: str         # Ô xuất phát
    to: str                    # Ô đích
    captures: str | None       # Mã quân bị ăn hoặc None
    has_capture: bool          # Có ăn quân hay không

@dataclass(frozen=True)
class Piece:
    id: str                    # Mã quân cờ
    type: str                  # "dam", "la", "keo"
    player: str                # "A" hoặc "B"
    pos: str                   # Tọa độ ô cờ hiện tại

@dataclass(frozen=True)
class GameState:
    protocol_version: str      # "0.1.0"
    match_id: str              # Mã trận đấu
    turn: int                  # Lượt đi hiện tại (>= 1)
    player: str                # "A" hoặc "B"
    board_size: int            # 9
    pieces: tuple[Piece, ...]  # Bộ danh sách quân cờ
```

### 3.2. Triển khai Hàm `choose_move`

Thí sinh triển khai mã nguồn theo mẫu tại `bot-sdk/templates/python3.py`:

```python
from ott_strategy_sdk import GameState, Move

def choose_move(state: GameState, legal_moves: list[Move]) -> Move:
    """
    Hệ thống tự động gọi hàm này ở mỗi lượt đi.
    legal_moves đã được lọc và đảm bảo chỉ chứa các nước đi hợp lệ.
    """
    # Ví dụ cơ bản: luôn chọn nước đi đầu tiên
    return legal_moves[0]
```

*Lưu ý*:
- Không gọi vòng lặp đọc `sys.stdin` hay `input()`.
- Không in kết quả ra `sys.stdout` hay dùng hàm `print()` thông thường.
- Có thể ghi log bằng `sys.stderr.write(...)`.
- Trình thực thi chạy qua lệnh: `python3 -B runner.py`.

---

## 4. Quản lý Phiên bản và Toàn vẹn (Integrity & Identity)

Khi người chơi tạo hoặc lưu một phiên bản bot dạng Strategy, hệ thống lưu trữ các thông tin định danh bất biến vào bảng `bot_revisions`:
- `runtime_id`: `'cpp'` hoặc `'python3'`.
- `execution_mode`: `'strategy'`.
- `source_digest`: Mã băm SHA-256 của file mã nguồn do người chơi nộp.
- `sdk_version`: Phiên bản SDK (hiện tại là `'1.0.0'`).
- `sdk_digest`: Mã băm SHA-256 của bộ file Strategy SDK tại thời điểm đăng ký.

Khi giải đấu diễn ra, Revision Docker Executor đọc lại mã nguồn từ lưu trữ và kiểm tra lại `source_digest` cũng như `sdk_digest`. Nếu phát hiện có bất kỳ sự thay đổi hoặc không khớp nào, hệ thống từ chối thực thi để ngăn chặn việc sửa đổi mã nguồn sau khi đã chốt danh sách.

---

## 5. Ngân sách Thời gian (Execution Budget)

- **Thời gian suy nghĩ mỗi nước đi**: Được cấp tối thiểu **5,000 ms** (5 giây) thời gian thực thi container cho bot dạng mã nguồn (`SOURCE_REVISION_MIN_TURN_TIMEOUT_MS`), ngay cả khi giải đấu cấu hình `turnTimeoutMs` thấp hơn.
- **Thời gian biên dịch C++**: Timeout biên dịch mặc định là **120 giây** (`BOT_CPP_COMPILE_TIMEOUT_MS`).
- **Thời gian chuẩn bị workspace**: Tối đa **10 giây**.
- **Cơ chế Warm Container**: Sau khi biên dịch hoặc nạp mã nguồn, container runtime được duy trì trong suốt phạm vi ván đấu (`match scope`) để tái sử dụng giữa các lượt đi, loại bỏ độ trễ khởi tạo container lặp lại.
