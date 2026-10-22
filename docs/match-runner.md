# Match Runner

Tài liệu này mô tả chi tiết kiến trúc và luồng xử lý của phân hệ Match Runner (`match-runner/`), chịu trách nhiệm điều phối toàn bộ vòng lặp một trận đấu giữa hai bot trong nền tảng OTT Code Arena.

---

## 1. Trách nhiệm của Match Runner

Match Runner hoạt động như một trọng tài độc lập, không thiên vị và không cho phép Bot can thiệp vào logic trò chơi:
1. Khởi tạo một phiên bản Game Engine độc lập (`engine/index.ts`) với cấu hình luật và bố cục quân cờ (`initialPieces`) tương ứng.
2. Lưu giữ trạng thái nguyên bản lúc bắt đầu trận (`initialState`) để phục vụ lưu trữ Replay.
3. Điều phối vòng lặp lượt đi: lấy trạng thái bàn cờ và danh sách nước đi hợp lệ (`legalMoves`) từ Engine.
4. Giao tiếp với Bot Executor để gửi yêu cầu (`BotRequest`) và nhận phản hồi (`BotResponse`) trong môi trường sandbox.
5. Kiểm tra tính hợp lệ của phản hồi từ Bot, tính toán các trường hợp vi phạm luật hoặc sự cố để xử thua (Forfeit).
6. Áp dụng nước đi hợp lệ vào Engine, phát snapshot thời gian thực (`LiveMatchSnapshot`) cho các client theo dõi trực tiếp (Spectator).
7. Đóng gói kết quả trận đấu (`MatchResult`) và dữ liệu tua lại (`MatchReplay`) khi ván đấu kết thúc.

---

## 2. Vòng lặp Trận đấu (Match Execution Loop)

Quy trình thực thi một ván đấu diễn ra tại hàm `runMatch(signal?: AbortSignal)` trong `match-runner/match.ts`:

```text
               Khởi tạo Engine & Lấy initialState
                               │
               ┌───────────────┴───────────────┐
               ▼                               │
         [Bắt đầu Lượt]                        │
               │                               │
        Lượt > maxTurns? ──(Có)──► Xử hòa (turn_limit)
               │ (Không)                       │
       Lấy legalMoves từ Engine                │
               │                               │
       legalMoves rỗng? ──(Có)──► Kiểm tra Engine / Xử hòa
               │ (Không)                       │
   Gọi Bot Executor trong Docker               │
               │                               │
       Bot gặp sự cố? ──(Có)────► Forfeit: Đối thủ thắng
               │ (Không)                       │
    Kiểm thực nước đi hợp lệ                   │
               │                               │
   Áp dụng nước đi vào Engine                  │
               │                               │
    Phát LiveMatchSnapshot                     │
               │                               │
    Có bên thắng/hòa? ──(Có)────► Kết thúc ván (finishMatch)
               │ (Không)                       │
     Đổi bên & Tăng lượt                       │
               └───────────────▲───────────────┘
```

### 2.1. Quản lý Lượt đấu và Định danh Thực thi
- Lượt đấu bắt đầu từ `turn = 1` với người chơi đi trước là `player = 'A'`.
- Mỗi lượt gọi bot sinh một mã định danh duy nhất (`executionId`) theo hàm `createTurnExecutionId`:
  ```typescript
  `${matchId}-turn-${turn}-${player}`
  ```
  Nếu chuỗi vượt quá 128 ký tự (giới hạn tên container của Docker), hệ thống tự động rút gọn bằng mã băm SHA-256 an toàn:
  `m-${sha256(matchId).slice(0, 32)}-turn-${turn}-${player}`.

### 2.2. Ngân sách Thời gian (Turn Timeout)
- Đối với bot chạy dạng mã nguồn (`source-revision` qua Docker): Thời gian chờ tối đa được bảo đảm không dưới mức sàn an toàn:
  $$\text{timeoutMs} = \max(\text{config.turnTimeoutMs}, 5000)$$
  (Quy định tại `match-runner/types.ts: SOURCE_REVISION_MIN_TURN_TIMEOUT_MS = 5000`).
- Đối với bot legacy chạy tiến trình host (development): Áp dụng đúng `config.turnTimeoutMs` (mặc định 2000 ms).

### 2.3. Bảng Ánh xạ Xử thua do Sự cố Bot (Forfeit Mapping)

Khi Bot Executor trả về lỗi, Match Runner lập tức xử dừng ván đấu và trao chiến thắng cho đối thủ (`winner = opponent(currentPlayer)`):

| Mã lỗi từ Bot Executor | Nguyên nhân xử thua | Mã lý do kết thúc (`TerminationReason`) |
| :--- | :--- | :--- |
| `TIMEOUT`<br>`COMPILATION_TIMEOUT`<br>`RUNTIME_TIMEOUT` | Quá thời gian quy định của lượt hoặc quá thời gian biên dịch mã nguồn C++. | `bot_timeout` |
| `PROCESS_CRASHED`<br>`RESOURCE_LIMIT_EXCEEDED` | Tiến trình bot thoát đột ngột (crash, segfault, OOM, exit code $\ne 0$). | `bot_crash` |
| `INVALID_JSON`<br>`INVALID_RESPONSE`<br>`MISSING_MOVE` | Bot in ra dữ liệu không parse được JSON hoặc JSON thiếu trường `move`. | `bot_invalid_json` |
| `EMPTY_OUTPUT` | Bot kết thúc lượt mà không in bất kỳ byte dữ liệu nào ra stdout. | `bot_empty_output` |
| `ILLEGAL_MOVE`<br>`SECURITY_VIOLATION` | Nước đi không nằm trong danh sách `legal_moves` hoặc vi phạm tọa độ/khoảng cách. | `bot_illegal_move` |
| `EXECUTOR_UNAVAILABLE`<br>`EXECUTOR_ERROR` | Lỗi hạ tầng máy chủ hoặc Docker daemon không phản hồi. | `engine_error` *(Không tính bot thua; pairing đánh dấu failed để retry).* |

---

## 3. Dữ liệu Snapshot Trực tiếp (LiveMatchSnapshot)

Trong suốt trận đấu, Match Runner phát snapshot thời gian thực thông qua callback `callbacks.onSnapshot`:
- **Snapshot khởi đầu**: Phát ở đầu ván (`status: 'in_progress'`, `turn: 1`).
- **Snapshot sau mỗi nước đi**: Phát ngay sau khi Engine cập nhật trạng thái bàn cờ (`state.pieces`, `state.lastMove`).
- **Snapshot kết thúc**: Phát khi ván đấu có kết quả chung cuộc (`status: 'finished'`).

### Cấu trúc `LiveMatchSnapshot`:
- `matchId` (`string`): Mã trận đấu.
- `status` (`'in_progress' | 'finished' | 'error'`): Trạng thái hiện tại.
- `sequence` (`number`): Số thứ tự snapshot tăng đơn điệu ($1, 2, 3\dots$) giúp client chống giật lag và loại bỏ frame cũ.
- `turn` (`number`), `currentPlayer` (`'A' | 'B'`).
- `state` (`GameState`): Trạng thái bàn cờ đầy đủ tại thời điểm đó (được clone sâu để chống đột biến).
- `latestMove` (`MoveRecord | null`): Nước đi vừa thực hiện.

---

## 4. Đóng gói Kết quả (`MatchResult`) và Replay (`MatchReplay`)

### 4.1. `MatchResult`
Khi ván đấu kết thúc tại hàm `finishMatch()`, đối tượng `MatchResult` được trả về với đầy đủ thông tin xác thực:
- `matchId`, `protocolVersion`.
- `status`: Luôn là `'completed'` (hoặc `'failed'` nếu lỗi hạ tầng).
- `winner`: `'A' | 'B' | 'draw' | null`.
- `terminationReason`: Lý do kết thúc chính thức.
- `turnCount`: Tổng số lượt thi đấu.
- `startTime`, `endTime`, `durationMs`.
- `playerA`, `playerB`: Định danh thông tin 2 bot.
- `initialState`: Bàn cờ lúc bắt đầu ván.
- `finalState`: Bàn cờ lúc kết thúc ván.
- `turnLog` (`TurnLog[]`): Nhật ký chi tiết từng lượt đấu (chứa request, response, duration, move đã áp dụng).
- `metadata`: Chứa `sourceRevisions` (thông tin provenance của bot tham gia).

### 4.2. `MatchReplay`
Được sinh thông qua hàm tĩnh `MatchRunner.createReplay(result)`:
- Chuyển đổi toàn bộ `turnLog` thành danh sách nước đi gọn nhẹ `moves`:
  ```typescript
  {
    turn: number,
    player: 'A' | 'B',
    pieceId: string,
    from: Position,
    to: Position,
    captures: string | null
  }
  ```
- Kết hợp với `initialState` và `finalState`, file Replay này cho phép client tua tiến/lùi bất kỳ nước đi nào một cách hoàn hảo mà không cần chạy lại Game Engine.

---

## 5. Hủy trận và Dọn dẹp Tài nguyên (Cancellation & Cleanup)

- Match Runner lắng nghe tín hiệu hủy `signal?: AbortSignal`. Khi nhận tín hiệu abort, trận đấu lập tức dừng vòng lặp và ném ngoại lệ `ExecutionCancelledError`.
- Khối `finally` trong `runMatch()` đảm bảo gọi `releaseRevisionScope(matchId)` để dọn dẹp triệt để các container Docker tạm thời và các volume dữ liệu phát sinh trong phạm vi trận đấu.
