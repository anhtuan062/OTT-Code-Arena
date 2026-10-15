# Kiểm thử

## Lệnh chính

```powershell
npm.cmd test
npm.cmd run build
node --check app.js
git diff --check
```

Chạy theo phạm vi:

```powershell
npx vitest run tests/engine
npx vitest run tests/protocol
npx vitest run tests/bot-executor
npx vitest run tests/match
npx vitest run tests/tournament
npx vitest run tests/server
npx vitest run tests/frontend
```

Không ghi số lượng test cố định trong tài liệu vì suite thay đổi thường xuyên. Kết quả chỉ được coi là PASS khi lệnh thực tế đã chạy thành công trong môi trường hiện tại.

## Phạm vi cần bảo vệ

### Engine

- layout hợp lệ, đúng số lượng quân;
- di chuyển tám hướng và quan hệ ăn quân;
- A chỉ thắng ở `i9`, B chỉ thắng ở `a1`;
- ăn hết toàn bộ quân mới thắng;
- turn limit, repetition và insufficient material;
- layout theo seed ổn định và khác nhau giữa các ván BO3.

### Protocol và SDK

- serialize request đúng `0.1.0`;
- parse và validate response;
- starter C++17/Python 3 biên dịch/chạy được;
- SDK identity và source digest không bị thay đổi;
- lỗi encoding, kích thước và move ngoài legal list bị từ chối.

### Executor

- production fail closed;
- image bắt buộc dùng digest;
- timeout theo phase;
- giới hạn stdout/stderr;
- cleanup workspace, volume, container và prepared artifact;
- warm execution không làm thay đổi identity;
- cancellation không để lại tài nguyên test-owned.

### Match và tournament

- forfeit ánh xạ đúng winner;
- result/replay tái tạo đúng final state;
- BO1 tương thích dữ liệu cũ;
- BO3 đổi A/B, dừng sớm 2-0, chơi ván 3 khi cần và giữ điểm theo participant;
- bye không cộng điểm;
- retry xóa trạng thái attempt cũ nhưng không làm sai pairing;
- restart giữ result đã commit và đưa pairing dở về `scheduled`;
- standings được tính idempotent từ aggregate result.

### API và frontend

- role và ownership;
- CSRF và session;
- bot/revision lifecycle;
- organizer-only management;
- spectator live/replay authorization;
- DTO không lộ dữ liệu nội bộ;
- rate limit trả `429` và `Retry-After`;
- live chuyển ván, late join, reconnect và replay navigation;
- loading, empty, error state và responsive layout.

## Docker tests

Các bài test cần Docker phải dùng resource cô lập và image đã có sẵn. Không pull image, prune Docker hoặc dùng dữ liệu production trong test. Nếu Docker không sẵn sàng, báo BLOCKED/SKIPPED rõ ràng; không quy đổi thành PASS.

## Dữ liệu kiểm thử

- Dùng thư mục tạm hoặc `TOURNAMENT_DATA_DIR` riêng.
- Không chạy test ghi dữ liệu vào `data/tournaments` đang dùng.
- Dọn resource test-owned sau khi chạy.
- Không reset hoặc xóa thay đổi sẵn có trong worktree.
