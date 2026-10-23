# Luật chơi OTTv2

Tài liệu này mô tả chi tiết và chính xác các quy tắc vận hành trò chơi OTTv2 theo triển khai thực tế của Game Engine (`engine/`) và Match Runner (`match-runner/`).

---

## 1. Bàn cờ và Thiết lập quân cờ

### 1.1. Bàn cờ và Hệ tọa độ
- **Kích thước**: Bàn cờ hình vuông $9 \times 9$ ô (`BOARD_SIZE = 9`).
- **Tọa độ hiển thị (Algebraic notation)**: Từ `a1` đến `i9`. Cột biểu diễn bằng chữ cái `a` đến `i` (trái sang phải), hàng biểu diễn bằng số `1` đến `9` (trên xuống dưới).
- **Tọa độ nội bộ (Internal coordinates)**: Sử dụng cặp chỉ số nguyên 0-indexed:
  - `row`: $0 \le \text{row} \le 8$
  - `col`: $0 \le \text{col} \le 8$
  - Ánh xạ: Ô `a1` tương ứng với `(row: 0, col: 0)`; ô `i9` tương ứng với `(row: 8, col: 8)`.

### 1.2. Quân cờ và Lực lượng khởi đầu
Mỗi ván đấu có 2 người chơi (hoặc 2 bot): **Người chơi A** (đi trước) và **Người chơi B** (đi sau).

Mỗi bên khởi đầu với **9 quân cờ** thuộc 3 loại theo quy tắc Oẳn Tù Tì (OTT):
- **3 quân Búa** (`dam` - Rock)
- **3 quân Bao** (`la` - Paper)
- **3 quân Kéo** (`keo` - Scissors)

Tổng cộng có **18 quân cờ** trên bàn đấu. Quân của phe A xuất phát ở 3 hàng trên cùng (`row` 0, 1, 2); quân của phe B xuất phát đối xứng ở 3 hàng dưới cùng (`row` 6, 7, 8).

### 1.3. Bố cục khởi tạo (Initial Layouts)
Trong `engine/initial-layout.ts`, hệ thống định nghĩa 3 biến thể bố cục quân cờ (`A_LAYOUTS`):
- **Layout 0 (Bố cục chuẩn)**:
  - Phe A:
    - Búa (`dam`): `(0, 2)`, `(1, 6)`, `(2, 7)`
    - Bao (`la`): `(0, 5)`, `(1, 8)`, `(2, 1)`
    - Kéo (`keo`): `(0, 8)`, `(1, 3)`, `(2, 4)`
- **Layout 1 & Layout 2**: Hoán đổi vị trí chiến thuật nhưng bảo toàn tổng số lượng quân và khoảng cách tới ô đích.
- **Tính đối xứng của Phe B**: Tọa độ của phe B được sinh bằng hàm phản chiếu đối xứng qua tâm bàn cờ:
  $$\text{row}_B = 8 - \text{row}_A, \quad \text{col}_B = 8 - \text{col}_A$$
- **Trong loạt trận BO3**: Chỉ số layout cho từng ván được suy ra một cách tất định (deterministic) từ chuỗi `seed` của trận đấu:
  $$\text{index} = (\text{SHA256}(seed\text{":board-layout"})[0] + \text{gameNumber} - 1) \pmod 3$$
  Điều này đảm bảo Ván 1, Ván 2 và Ván 3 luôn sử dụng bố cục khác nhau nhưng hoàn toàn có thể tái lập khi replay hoặc server restart.

---

## 2. Quy tắc Di chuyển (Movement)

Ở mỗi lượt đi của mình, người chơi chọn **đúng một quân cờ** của phe mình và di chuyển **đúng 1 ô** theo một trong 8 hướng:
- Ngang: Trái, Phải
- Dọc: Lên, Xuống
- Chéo: 4 góc chéo

### Các ràng buộc di chuyển hợp lệ:
1. **Không ra ngoài biên**: Ô đích phải thỏa mãn $0 \le \text{row} \le 8$ và $0 \le \text{col} \le 8$.
2. **Khoảng cách di chuyển**: $|\Delta \text{row}| \le 1$ và $|\Delta \text{col}| \le 1$, đồng thời không được đứng yên ($|\Delta \text{row}| + |\Delta \text{col}| > 0$).
3. **Ô đích trống**: Nếu ô đích không có quân nào, nước đi luôn hợp lệ.
4. **Không ăn quân cùng phe**: Tuyệt đối không được di chuyển vào ô đang có quân của phe mình.

---

## 3. Quy tắc Ăn quân (Capture)

Khi người chơi di chuyển quân vào ô đang có quân của đối phương, hành động ăn quân xảy ra nếu tuân theo quan hệ khắc chế vòng tròn:

| Quân tấn công | Quân phòng thủ bị ăn | Kết quả |
| :--- | :--- | :--- |
| **Búa** (`dam`) | **Kéo** (`keo`) | Hợp lệ (Búa đập Kéo) |
| **Kéo** (`keo`) | **Bao** (`la`) | Hợp lệ (Kéo cắt Bao) |
| **Bao** (`la`) | **Búa** (`dam`) | Hợp lệ (Bao bọc Búa) |

### Các trường hợp cấm ăn quân:
- **Cùng loại**: Búa không thể ăn Búa, Kéo không thể ăn Kéo, Bao không thể ăn Bao.
- **Bị khắc ngược**: Kéo không thể ăn Búa, Bao không thể ăn Kéo, Búa không thể ăn Bao.
- **Quân phe mình**: Không thể ăn quân cùng màu.

### Cơ chế xử lý ăn quân trong Game Engine hiện tại:
- Khi ăn quân thành công (`move.captures !== null`):
  - Quân phòng thủ của đối phương bị **xóa hoàn toàn** khỏi mảng quân cờ của ván đấu (`newState.pieces.splice(capturedIdx, 1)`).
  - Quân tấn công chiếm giữ ô đích vừa di chuyển tới.
  - Lực lượng của đối phương giảm đi 1 quân.

---

## 4. Điều kiện Chiến thắng (Win Conditions)

Một bên giành chiến thắng ngay lập tức (`winReason`) khi đạt được một trong các điều kiện sau:

1. **Đạt ô đích (`goal_reached`)**:
   - **Phe A** đưa bất kỳ quân cờ nào của mình tới ô đích **`i9`** (`row: 8, col: 8`).
   - **Phe B** đưa bất kỳ quân cờ nào của mình tới ô đích **`a1`** (`row: 0, col: 0`).
   - *Lưu ý*: Ô đích được kiểm tra ngay sau khi nước đi được áp dụng.
2. **Ăn hết toàn bộ quân đối phương (`all_pieces_captured`)**:
   - Một phe ăn hết sạch toàn bộ 9 quân cờ của đối thủ, khiến số quân đối phương trên bàn bằng 0 trong khi phe mình còn ít nhất 1 quân.
   - *Lưu ý*: Chỉ tiêu diệt hết 1 hoặc 2 loại quân (ví dụ ăn hết Búa của đối thủ) **không** tạo thành chiến thắng.
3. **Đối phương lặp nước đi 3 lần (`repetition`)**:
   - Khi bot đối phương thực hiện nước đi khiến quân cờ dao động qua lại 3 lần (ví dụ $d3 \to d4 \to d3 \to d4 \to d3$, tức 4 nước đi lặp lại khiến ô $d3$ được viếng thăm 3 lần mà không có nước ăn quân ở giữa), hoặc thực hiện cùng 1 nước đi 3 lần, hoặc làm tái lặp thế cờ toàn cục 3 lần, bot lặp nước đi sẽ **bị xử thua ngay lập tức** và bot còn lại giành **chiến thắng**.

---

## 5. Điều kiện Hòa (Draw Conditions)

Ván đấu được xử hòa (`winner: 'draw'`) khi xảy ra một trong các trường hợp sau:

1. **Vượt giới hạn số lượt (`turn_limit`)**:
   - Số lượt đấu (`state.turn`) vượt quá cấu hình `maxTurns` của ván đấu (giá trị mặc định trong hệ thống là **200** lượt).
2. **Không đủ lực lượng thi đấu (`insufficient_material`)**:
   - Cả hai bên chỉ còn lại duy nhất 1 loại quân trên bàn cờ và loại quân đó **giống hệt nhau** (ví dụ cả hai bên chỉ còn Kéo). Khi đó không bên nào có khả năng ăn quân đối phương.
3. **Hết nước đi hợp lệ (`insufficient_material` fallback)**:
   - Đến lượt đi nhưng mảng `legalMoves` rỗng và engine không xác định được người thắng.

---

## 6. Xử thua do lỗi Bot & Lặp nước đi (Forfeit & Repetition Loss)

Bot bị xử thua ngay lập tức (đối thủ thắng ván) nếu vi phạm một trong các trường hợp sau:

| Mã kết thúc (`TerminationReason`) | Phân loại | Nguyên nhân |
| :--- | :--- | :--- |
| `repetition` | Luật thi đấu | Bot lặp nước đi / thế cờ 3 lần (ví dụ dao động 1 quân qua lại $d3 \to d4 \to d3 \to d4 \to d3$). Bot thực hiện nước đi lặp lần 3 bị xử thua, đối phương thắng. |
| `bot_timeout` | Vi phạm kỹ thuật | Quá thời gian suy nghĩ mỗi nước đi (`turnTimeoutMs`, mặc định 2000ms; tối thiểu 5000ms đối với Docker source revision). |
| `bot_crash` | Vi phạm kỹ thuật | Tiến trình bot thoát bất thường (non-zero exit code), bị kill do vượt giới hạn RAM/CPU, hoặc crash runtime. |
| `bot_empty_output` | Vi phạm kỹ thuật | Bot kết thúc mà không in bất kỳ dữ liệu nào ra stdout. |
| `bot_invalid_json` | Vi phạm kỹ thuật | Dữ liệu bot gửi về stdout không phải là một chuỗi JSON hợp lệ. |
| `bot_illegal_move` | Vi phạm kỹ thuật | Bot gửi nước đi không nằm trong danh sách `legal_moves` do Engine cung cấp ở lượt đó, hoặc vi phạm tọa độ/khoảng cách. |

*Lưu ý*: Nếu xảy ra lỗi hạ tầng (ví dụ Docker daemon không phản hồi, file hệ thống bị lỗi), trạng thái pairing được gán mã `failed` hoặc `engine_error` để Ban tổ chức có thể thực hiện chạy lại (retry) mà không tính thua oan cho bot.

---

## 7. Cấu trúc Loạt trận (BO1, BO2, BO3) và Điểm số

### 7.1. Loạt trận
- **BO1 (Best of 1)**: Thi đấu đúng 1 ván. Kết quả trận là kết quả của ván đó.
- **BO2 (Best of 2)**: Thi đấu 2 ván. Ván 2 đổi bên (A/B đảo ngược). Được sử dụng trong vòng bảng của thể thức Multi-stage.
- **BO3 (Best of 3)**: Thi đấu tối đa 3 ván:
  - **Ván 1**: Phe A và Phe B theo thứ tự bốc thăm ban đầu.
  - **Ván 2**: Đảo bên thi đấu (B đi trước làm A, A đi sau làm B).
  - **Ván 3** (nếu cần): Quyết định bên đi trước một cách tất định dựa trên hash SHA-256 của `seed` (`digest[0] % 2 === 0`).
  - *Quy tắc dừng sớm*: Loạt trận dừng ngay khi một bên giành được 2 ván thắng (ví dụ tỷ số 2-0). Nếu sau 2 ván tỷ số là 1-0 kèm 1 ván hòa, ván 3 vẫn được tổ chức để xác định kết quả cuối cùng.
  - Giữa các ván đấu trong một series có khoảng nghỉ trễ 2.5 giây phía server để chuẩn bị môi trường.

### 7.2. Điểm số Bảng xếp hạng (Standings Scoring)
Điểm số được tính trên toàn bộ loạt trận (series) theo cấu hình `DEFAULT_SCORING_CONFIG`:
- **Thắng trận**: **3 điểm**
- **Hòa trận**: **1 điểm**
- **Thua trận**: **0 điểm**
- **Miễn đấu (Bye)**: **0 điểm** (Miễn đấu chỉ giúp tiến vào vòng sau, không cộng điểm).
- **Tiêu chí xếp hạng**: Ưu tiên tổng điểm $\rightarrow$ Thành tích đối đầu trực tiếp (Head-to-head, khi đúng 2 bot bằng điểm) $\rightarrow$ Mã định danh đăng ký (đảm bảo thứ tự ổn định).

---

## 6. Xử thua do lỗi Bot (Forfeit)

Bot bị xử thua ngay lập tức (đối thủ thắng ván) nếu vi phạm một trong các lỗi sau:

| Mã lỗi (`TerminationReason`) | Nguyên nhân |
| :--- | :--- |
| `bot_timeout` | Quá thời gian suy nghĩ mỗi nước đi (`turnTimeoutMs`, mặc định 2000ms; tối thiểu 5000ms đối với Docker source revision). |
| `bot_crash` | Tiến trình bot thoát bất thường (non-zero exit code), bị kill do vượt giới hạn RAM/CPU, hoặc crash runtime. |
| `bot_empty_output` | Bot kết thúc mà không in bất kỳ dữ liệu nào ra stdout. |
| `bot_invalid_json` | Dữ liệu bot gửi về stdout không phải là một chuỗi JSON hợp lệ. |
| `bot_illegal_move` | Bot gửi nước đi không nằm trong danh sách `legal_moves` do Engine cung cấp ở lượt đó, hoặc vi phạm tọa độ/khoảng cách. |

*Lưu ý*: Nếu xảy ra lỗi hạ tầng (ví dụ Docker daemon không phản hồi, file hệ thống bị lỗi), trạng thái pairing được gán mã `failed` hoặc `engine_error` để Ban tổ chức có thể thực hiện chạy lại (retry) mà không tính thua oan cho bot.

---

## 7. Cấu trúc Loạt trận (BO1, BO2, BO3) và Điểm số

### 7.1. Loạt trận
- **BO1 (Best of 1)**: Thi đấu đúng 1 ván. Kết quả trận là kết quả của ván đó.
- **BO2 (Best of 2)**: Thi đấu 2 ván. Ván 2 đổi bên (A/B đảo ngược). Được sử dụng trong vòng bảng của thể thức Multi-stage.
- **BO3 (Best of 3)**: Thi đấu tối đa 3 ván:
  - **Ván 1**: Phe A và Phe B theo thứ tự bốc thăm ban đầu.
  - **Ván 2**: Đảo bên thi đấu (B đi trước làm A, A đi sau làm B).
  - **Ván 3** (nếu cần): Quyết định bên đi trước một cách tất định dựa trên hash SHA-256 của `seed` (`digest[0] % 2 === 0`).
  - *Quy tắc dừng sớm*: Loạt trận dừng ngay khi một bên giành được 2 ván thắng (ví dụ tỷ số 2-0). Nếu sau 2 ván tỷ số là 1-0 kèm 1 ván hòa, ván 3 vẫn được tổ chức để xác định kết quả cuối cùng.
  - Giữa các ván đấu trong một series có khoảng nghỉ trễ 2.5 giây phía server để chuẩn bị môi trường.

### 7.2. Điểm số Bảng xếp hạng (Standings Scoring)
Điểm số được tính trên toàn bộ loạt trận (series) theo cấu hình `DEFAULT_SCORING_CONFIG`:
- **Thắng trận**: **3 điểm**
- **Hòa trận**: **1 điểm**
- **Thua trận**: **0 điểm**
- **Miễn đấu (Bye)**: **0 điểm** (Miễn đấu chỉ giúp tiến vào vòng sau, không cộng điểm).
- **Tiêu chí xếp hạng**: Ưu tiên tổng điểm $\rightarrow$ Thành tích đối đầu trực tiếp (Head-to-head, khi đúng 2 bot bằng điểm) $\rightarrow$ Mã định danh đăng ký (đảm bảo thứ tự ổn định).

