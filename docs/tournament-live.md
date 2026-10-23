# Nội bộ giải đấu, điều phối trận và theo dõi trực tiếp

Tài liệu này mô tả chi tiết quy trình tổ chức giải đấu, điều phối thực thi trận đấu, phát sóng trực tiếp (Live Spectator) và quản lý Replay trong hệ thống OTT Code Arena.

---

## 1. Vòng đời Giải đấu và Trạng thái Tiến trình

Hệ thống phân biệt giữa **Trạng thái cốt lõi phía Server** (6 trạng thái danh định) và **Giai đoạn hiển thị trực quan phía Client** (7 giai đoạn giao diện):

### 1.1. Bảng ánh xạ Trạng thái Server và Giai đoạn Giao diện

| Giai đoạn UI | Nhãn hiển thị | Trạng thái Server (`TournamentStatus`) | Điều kiện bổ sung |
| :---: | :--- | :--- | :--- |
| **1** | **Tạo giải / Thiết lập** | `draft` | Mới khởi tạo, chỉ Ban tổ chức truy cập để chỉnh sửa cấu hình. |
| **2** | **Mở đăng ký** | `registration_open` | Mở nhận đơn nộp Bot từ thí sinh; Ban tổ chức xét duyệt. |
| **3** | **Chốt danh sách** | `registration_closed` | Đã đóng đăng ký; danh sách bot tham gia đã cố định nhưng chưa sinh lịch thi đấu (`rounds.length === 0 && stages.length === 0`). |
| **4** | **Lập lịch** | `registration_closed` | Đã sinh lịch thi đấu (`rounds.length > 0` hoặc `stages.length > 0`); sẵn sàng khởi tranh. |
| **5** | **Thi đấu** | `running` | Các trận đấu đang được xử lý trong hàng đợi nền; khán giả có thể xem trực tiếp qua Live Spectator. |
| **6** | **Hoàn thành** | `completed` | Toàn bộ các trận đấu đã hoàn tất nhưng Ban tổ chức **chưa công bố** chính thức (`resultsPublishedAt === null`). |
| **7** | **Công bố** | `completed` | Kết quả chung cuộc đã được công bố chính thức (`resultsPublishedAt !== null`); vinh danh Podium và mở xem Replay công khai. |
| — | **Đã hủy** | `cancelled` | Giải đấu bị hủy bỏ trước khi hoàn tất. |

---

## 2. Hai Thể thức Thi đấu Được Hỗ trợ

### 2.1. Vòng tròn một lượt (`single_round_robin`)
- **Quy mô**: Từ 2 đến 64 người tham gia (`MAX_PARTICIPANTS = 64`).
- **Thuật toán xếp lịch**: Áp dụng thuật toán xoay vòng vòng tròn (Circle method). Mỗi bot gặp tất cả các bot còn lại đúng một lần qua các vòng đấu (`rounds`).
- **Xếp hạng**: Tính theo tổng điểm từ các trận đấu tổng hợp (aggregate matches).

### 2.2. Thể thức nhiều giai đoạn (`multi_stage`)
Hỗ trợ giải đấu quy mô lớn lên tới **4,096 bot** (`tournament/multi-stage.ts`):
- **Quy hoạch theo số lượng Bot**:
  - *Dưới 4 bot*: Tự động phân nhánh loại trực tiếp (Knockout Bracket 2–3 bot).
  - *Từ 4 đến 200 bot*: Khởi đầu bằng **Vòng bảng (Group Stage)** gồm các bảng từ 4 đến 8 bot (số lượng bảng là lũy thừa của 2), sau đó chọn top 2 mỗi bảng tiến vào **Nhánh loại trực tiếp (Knockout Stage)**.
  - *Trên 200 bot*: Bổ sung **Vòng loại khu vực (Regional Qualifiers)** trước khi vào Vòng bảng và Nhánh loại trực tiếp.
- **Mô hình Dependency Slot**:
  Các cặp đấu ở nhánh loại trực tiếp sử dụng mô hình vị trí động (`PairingSlot`). Khi các trận vòng trước hoặc vòng bảng có kết quả commit, hệ thống tự động giải quyết (`resolve`) danh tính bot vào slot kế tiếp (`preliminary_winner`, `group_rank`, `knockout_winner`).
- **Phân định hòa cho dữ liệu tương thích**:
  BO3 mới tự phân định ván 3 hòa theo số quân còn lại; nếu số quân bằng nhau, phía B của ván 3 thắng. Trạng thái `pending_tiebreaker` chỉ còn dành cho dữ liệu cũ hoặc kết quả cũ được phục hồi. Ban tổ chức có thể xử lý trạng thái đó qua endpoint:
  ```text
  POST /api/tournaments/:id/pairings/:pairingId/resolve-tiebreaker
  ```

---

## 3. Quy trình Đăng ký Bot và Kiểm thực Preflight

1. **Thí sinh Nộp đơn**:
   - Gọi `POST /api/tournaments/:id/participation-requests`.
   - Giải phải ở trạng thái `registration_open`. Thí sinh chọn một bot và phiên bản mã nguồn (`revisionId`) thuộc sở hữu của mình.
   - Tạo một `ParticipationRequest` trạng thái `pending`.
2. **Kiểm tra Môi trường (Bot Preflight Validation)**:
   - Dịch vụ `server/bot-preflight.ts` tự động kiểm tra bot trong Docker sandbox độc lập: xác minh việc biên dịch C++ hoặc import Python, kiểm tra cấu trúc phản hồi với bàn cờ mẫu.
   - Kết quả được ghi nhận vào bảng SQLite `bot_preflight_validations` (`passed`, `failed`, hoặc `pending`).
3. **Ban tổ chức Xét duyệt**:
   - `POST /api/tournaments/:id/requests/:requestId/approve`: Chỉ cho phép duyệt nếu bot đã có kết quả preflight đạt (`passed`). Bot được thêm vào mảng `tournament.participants`.
   - `POST /api/tournaments/:id/requests/:requestId/reject`: Từ chối đơn đăng ký kèm lý do.
   - `POST /api/tournaments/:id/requests/:requestId/undo`: Hoàn tác quyết định về lại `pending`.
4. **Điều kiện Đóng Đăng ký & Tạo Lịch**:
   - **Bắt buộc** không còn đơn đăng ký nào ở trạng thái `pending`.
   - Tất cả các bot đã duyệt đều phải vượt qua kiểm tra preflight. Nếu còn bot đang kiểm tra (`pending`), server trả về mã `202 Accepted`. Nếu có bot thất bại (`failed`), server chặn chuyển giai đoạn với mã `409 Conflict`.

---

## 4. Điều phối Thi đấu và Hàng đợi Bền vững (Fair Match Dispatcher)

Hệ thống sử dụng bộ điều phối `FairMatchDispatcher` kết hợp với bảng SQLite `tournament_match_jobs` để thực thi các trận đấu:
- **Ngăn chặn chạy trùng lặp**: Mỗi trận đấu có một khóa lũy nghiệm `idempotency_key` duy nhất.
- **Cơ chế Thuê khóa (Lease Lock)**: Worker nhận job và giữ khóa trong một khoảng thời gian (`leaseExpiresAt`). Nếu worker bị treo hoặc crash, job sẽ được thu hồi an toàn sau khi hết hạn thuê.
- **Fencing Token**: Mỗi lần cấp phát job, token hàng rào tăng dần để vô hiệu hóa ngay lập tức mọi kết quả gửi muộn từ worker cũ.
- **Thực thi song song công bằng**: Điều phối luân phiên giữa các bảng đấu và các cặp đấu, tránh việc một bot phải thi đấu dồn dập trong khi bot khác chờ đợi quá lâu.

---

## 5. Cấu trúc Loạt trận BO3 (Best of 3)

- **Ván 1**: Phe A và Phe B theo thứ tự sắp xếp ban đầu.
- **Ván 2**: Đảo ngược bên thi đấu (bot B đi trước làm A, bot A đi sau làm B).
- **Ván 3** (nếu cần): Quyết định bên đi trước dựa trên mã băm SHA-256 tất định của hạt giống trận đấu (`seed`).
- **Bảo toàn danh tính**: Điểm số và kết quả trận được gắn cố định với ID của thí sinh (`participantId`), không bị phụ thuộc vào việc đổi bên A/B giữa các ván.
- **Dừng sớm**: Loạt trận kết thúc ngay khi một bên đạt đủ 2 ván thắng (ví dụ 2-0).
- **Phân định ván 3**: Nếu ván 3 hòa, bên còn nhiều quân hơn thắng ván 3; nếu số quân bằng nhau, phe A thua và phe B thắng.
- **Khoảng nghỉ**: Giữa các ván trong một series có khoảng nghỉ trễ 2.5 giây phía server để giải phóng container và chuẩn bị ván kế tiếp.

---

## 6. Theo dõi Trực tiếp (Live Spectator)

Người dùng đã đăng nhập có thể xem trực tiếp khi giải ở trạng thái `running` và nằm trong phạm vi được phép hiển thị:
- **Server-Sent Events (SSE) - Khuyến nghị**:
  ```text
  GET /api/tournaments/:id/spectator/matches/:matchId/live/stream
  ```
  Nhận luồng phát snapshot thời gian thực từ server theo nhịp bước đi.
- **HTTP Polling - Dự phòng**:
  ```text
  GET /api/tournaments/:id/spectator/matches/:matchId/live
  ```
  Trả về trạng thái hiện tại kèm header và trường `retryAfterMs` để điều tiết tần suất polling của client.
- **Đồng bộ hóa Client**:
  Snapshot mang cặp chỉ số `(gameNumber, sequence)`. Client sử dụng số thứ tự `sequence` để loại bỏ các gói tin đến muộn hoặc sai thứ tự. Khán giả tham gia giữa chừng (late join) lập tức nhận bàn cờ ở trạng thái hiện tại thay vì phải tua lại từ đầu.

---

## 7. Quản lý và Công bố Replay

- **Quyền xem Replay riêng tư**: Khi giải chưa công bố kết quả (`resultsPublishedAt === null`), chỉ có tài khoản Ban tổ chức sở hữu giải đấu mới có quyền xem replay của các trận đấu.
- **Quyền xem Replay công khai**: Khi Ban tổ chức thực hiện công bố kết quả (`POST /api/tournaments/:id/publish`), dịch vụ `PublicReplayExporter` xác thực tính toàn vẹn và cấp quyền xem lại cho tất cả người dùng trong hệ thống.
- **Bảo vệ mã nguồn**: Replay DTO dành cho người xem không chứa mã nguồn Bot, log biên dịch, stderr hoặc thông số hệ thống nội bộ.

---

## 8. Khả năng Phục hồi sau Sự cố (Recovery & Retry)

- **Chạy lại Trận đấu (Retry Pairing)**:
  Ban tổ chức có thể chạy lại một cặp đấu bị lỗi thông qua:
  ```text
  POST /api/tournaments/:id/pairings/:pairingId/retry
  ```
  Server hủy bỏ attempt cũ, làm sạch hàng đợi job và đưa cặp đấu về trạng thái sẵn sàng thực thi lại. Bảng xếp hạng không bao giờ bị tính điểm hai lần.
- **Phục hồi khi Server khởi động lại (Server Restart Reconciliation)**:
  - Kết quả có bộ result/replay/commit hợp lệ được giữ và không chạy lại chỉ vì trạng thái trong bộ nhớ bị mất.
  - Các job đang ở trạng thái `in_progress` / `running` chưa commit được reset an toàn về trạng thái `scheduled` / `queued`.
  - Tiến độ loạt trận BO3 đang dở dang tiếp tục thi đấu từ ván kế tiếp mà không phải hủy kết quả các ván đã xong.
