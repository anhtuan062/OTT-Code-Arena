# Mô hình dữ liệu

Hệ thống dùng hai lớp persistence: SQLite cho tài khoản/bot và filesystem cho tournament/result/replay.

## SQLite

Schema hiện tại được quản lý theo version trong `server/db.ts`.

### User

- `id`, `username`, `password_hash`;
- `role`: `competitor` hoặc `organizer`;
- thời gian tạo và đăng nhập gần nhất.

### Session

- token đã băm/định danh session;
- user ID, CSRF token;
- thời gian tạo và hết hạn.

### Bot

- bot ID, owner ID và tên;
- metadata legacy command để tương thích;
- `current_revision_id` trỏ tới phiên bản đang chọn.

### Bot revision

- revision ID, bot ID và owner ID;
- source digest, storage reference và source size;
- runtime `cpp` hoặc `python3`;
- label, thời gian tạo và execution mode;
- SDK version/digest với strategy revision.

Source thực tế nằm trong `data/tournaments/bot-revisions/<bot-id>/`.

### Rate limit

Lưu key, số lần thử và cửa sổ thời gian cho các endpoint cần giới hạn.

## Tournament filesystem

`Tournament` gồm:

- ID, tên, owner metadata và trạng thái;
- format `single_round_robin`;
- participants và participation requests;
- match config, scoring config;
- rounds, pairings và standings;
- thời điểm đăng ký, bắt đầu, hoàn thành và công bố.

Trạng thái tournament:

```text
draft → registration_open → registration_closed → running → completed
  └────────────────────────────────────────────────────────→ cancelled
```

Một số transition quay lại `draft` được hỗ trợ trước khi giải chạy.

## Pairing

`TournamentPairing` chứa participant A/B, round, status, match ID, result và lỗi an toàn để hiển thị. `participantB = null` nghĩa là miễn đấu.

Status:

- `scheduled`;
- `in_progress`;
- `completed`;
- `failed`;
- `cancelled`;
- `skipped`.

Pairing BO3 có `seriesProgress`: seed, ván tiếp theo, điểm hai participant và danh sách game đã commit.

## Match result và replay

Aggregate match record là đơn vị dùng cho bảng xếp hạng. Game record nội bộ của BO3 có `seriesGameOf` và không được tính riêng vào standings.

Replay lưu:

- initial/final state;
- move list;
- winner và termination reason;
- participant identity;
- source provenance giới hạn;
- envelope series và nested game replay với BO3.

## Live data

Live snapshot chỉ tồn tại cho luồng đang chạy và được đánh số bằng `gameNumber` + `sequence`. Spectator API chiếu snapshot thành DTO an toàn; live history bị giới hạn và không thay thế replay bền vững.

## Điểm số

- thắng: 3 điểm;
- hòa: 1 điểm;
- thua: 0 điểm;
- miễn đấu: 0 điểm.

Standings được tính lại từ aggregate match records để tránh cộng điểm lặp khi retry hoặc recovery.
