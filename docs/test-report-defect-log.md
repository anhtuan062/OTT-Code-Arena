# Báo cáo Kiểm thử Hệ thống & Nhật ký Lỗi (Defect Log)

- **Người thực hiện:** Đặng Thị Hoàng Ngân
- **Vai trò:** Software QA / Testing Engineer
- **Thời gian thực hiện:** 23/10/2026
- **Môi trường:** Local Windows x64, Node.js v24.14.1, Vitest Test Runner
- **Nhánh Git (Worktree):** `test/data-flow-coverage`
- **Tiêu chuẩn nghiệm thu đối chiếu:** `docs/testing.md` (Yêu cầu toàn bộ test suites trả về mã thoát `0` / PASS)

---

## 1. Tổng quan Kết quả Thực thi Baseline Test Suite

### 1.1. Lần chạy toàn bộ hệ thống (`npm test`)
- **Tổng số Test Files:** 122 files (113 passed, 6 failed, 3 skipped)
- **Tổng số Test Cases:** 1234 tests (1189 passed, 12 failed, 33 skipped)
- **Thời gian thực thi:** 123.10s
- **Trạng thái:** **FAILED (Exit Code != 0)** — Chưa đủ điều kiện nghiệm thu theo quy chuẩn kỹ thuật.

### 1.2. Lần chạy cô lập sau khi build (`npm run build` -> `npx vitest run tests/tournament/large-tournament-reliability.test.ts`)
- **Tệp kiểm thử:** `tests/tournament/large-tournament-reliability.test.ts`
- **Kết quả:** **5 failed / 4 passed** (Tổng 9 tests, thời gian thực thi: 104.77s).
- **Đánh giá:** Các lỗi cốt lõi xuất phát từ logic xử lý dữ liệu, kiểm soát đồng thời (concurrency) và sự lệch pha giữa đặc tả với bộ test case cũ, không phụ thuộc vào trạng thái build mã nguồn.

---

## 2. Chi tiết Nhật ký Lỗi (Defect Log & Root Cause Analysis)

### DEFECT-TOURNAMENT-001: Sai lệch số lượng trận đấu giữa logic thực thi và test case (766 vs 383 / 80 vs 40)
- **Phân hệ:** `tournament`
- **Mức độ nghiêm trọng:** High (Cần làm rõ đặc tả & quy tắc tính toán)
- **Vị trí phát hiện:** `tests/tournament/large-tournament-reliability.test.ts`
  - **Dòng 284:** Ca kiểm thử `1. 256-Bot Full Tournament Reliability & Telemetry > executes 256-bot multi-stage tournament end-to-end with metrics, zero lost results, and zero duplicates`
    - *Expected:* `383` (Công thức giả định trong test case: 128 prelim + 192 group + 63 knockout = 383)
    - *Received:* `766` (`AssertionError: expected 766 to be 383 // Object.is equality`)
  - **Dòng 467:** Ca kiểm thử `3. Fault Injection, Pause/Resume, and Persistence Boundaries > aborts cleanly via AbortSignal mid-tournament and resumes without corruption`
    - *Expected:* `383` (`expect(executor.executedMatches.length).toBe(383)`)
    - *Received:* `766` (`AssertionError: expected 766 to be 383`)
  - **Dòng 500:** Ca kiểm thử `3. Fault Injection, Pause/Resume, and Persistence Boundaries > recovers from server restart when a pairing was interrupted mid-flight`
    - *Expected:* `40` (`expect(executor1.executedMatches.length).toBe(40)`)
    - *Received:* `80` (`AssertionError: expected 80 to be 40`)
- **Phân tích hiện trạng & Hướng xử lý:**
  - Kết quả thực tế nhận về luôn gấp đúng $2\times$ so với giá trị kỳ vọng của bộ test hiện tại ($383 \times 2 = 766$, $40 \times 2 = 80$).
  - **Cần bàn lại cách tính trận đấu:** Có hai giả định cần làm rõ:
    1. *Khả năng 1:* Hệ thống thực thi đang dính lỗi nhân đôi (kích hoạt hoặc ghi nhận 2 lần cho mỗi cặp đấu khi phục hồi sau sự cố/restart).
    2. *Khả năng 2:* Test case cũ được viết theo công thức trận đơn (Single Match), trong khi thể thức thực tế cấu hình thể thức 2 lượt (Lượt đi - Lượt về / Home - Away / BO2), dẫn tới việc test case cũ bị lệch chuẩn so với thiết kế mới.

---

### DEFECT-TOURNAMENT-002: Bỏ qua điều kiện chặn khi có hòa sinh tử (Tiebreaker Bypass)
- **Phân hệ:** `tournament`
- **Mức độ nghiêm trọng:** High (Nghiệp vụ giải đấu)
- **Vị trí phát hiện:** `tests/tournament/large-tournament-reliability.test.ts:757`
  - Ca kiểm thử: `4. Idempotency, Concurrency & Elimination Tiebreaker > handles elimination draw with pending_tiebreaker, halts infinite loop, and resumes on resolveTiebreaker`
  - Đoạn mã kiểm tra:
    ```typescript
    const runRes = await manager.runPairingById(tournamentId, firstPairing.pairingId);
    expect(runRes.success).toBe(false);
    expect(runRes.error).toContain('tiebreaker pending');
    ```
- **Kết quả thực tế:** `runRes.success` trả về `true` (`AssertionError: expected true to be false`).
- **Nguyên nhân gốc:** Hàm `manager.runPairingById` không bắt cờ trạng thái `pending_tiebreaker`. Hệ thống vẫn cho phép chạy tiếp thay vì dừng lại để đợi kích hoạt hàm phân định hòa `resolveTiebreaker`, dễ dẫn tới vòng lặp vô tận (infinite loop).

---

### DEFECT-TOURNAMENT-003: Treo bế tắc và Timeout khi xử lý cặp đấu đồng thời (Deadlock / Race Condition)
- **Phân hệ:** `tournament`
- **Mức độ nghiêm trọng:** High (Xử lý bất đồng bộ)
- **Vị trí phát hiện:** `tests/tournament/large-tournament-reliability.test.ts`
  - Ca kiểm thử: `4. Idempotency, Concurrency & Elimination Tiebreaker > rejects duplicate concurrent execution of the same pairing`
- **Kết quả thực tế:** `Error: Test timed out in 15000ms`.
- **Nguyên nhân gốc:** Thiếu cơ chế khóa đồng thời (Mutex/Concurrency Lock) theo `pairingId`. Khi hai luồng cùng gọi một trận đấu, hệ thống bị treo Promise thay vì lập tức từ chối yêu cầu trùng lặp thứ hai.

---

### DEFECT-SCALE-004: Timeout và rò rỉ tài nguyên khi kiểm thử tải 256 Bot
- **Phân hệ:** `tournament / scale-readiness / durability-recovery`
- **Mức độ nghiêm trọng:** High (Hiệu năng quy mô lớn)
- **Vị trí phát hiện:**
  - `tests/tournament/durability-recovery.test.ts: Multi-Cycle 256-Bot Resource & Heap Trend Analysis` (`timed out in 60000ms`)
  - `tests/tournament/durability-recovery.test.ts: Heterogeneous 4-Region State & Server Restart Simulation` (`timed out in 45000ms`)
  - `tests/tournament/scale-readiness.test.ts: Pull-based Sequential Concurrency & Backpressure` (`timed out in 60000ms`)
- **Nguyên nhân gốc:** Cơ chế áp lực ngược (backpressure) và giải phóng hàng đợi (queue) không đáp ứng kịp khi mô phỏng tải lớn, dẫn tới hiện tượng nghẽn tài nguyên và vượt quá ngưỡng thời gian chờ mặc định.

---

### DEFECT-BUILD-005: Thiếu hụt artifact build trong thư mục dist/ khi chưa kích hoạt pipeline
- **Phân hệ:** `bot-executor`, `server`
- **Mức độ nghiêm trọng:** Medium
- **Vị trí phát hiện:**
  - `tests/bot-executor/phase8.5f-benchmark.test.ts`
  - `tests/bot-executor/phase8.5g-diagnostics.test.ts`
  - `tests/server/child-process-graceful-shutdown.test.ts`
- **Chi tiết lỗi:**
  - `Failed to load url ../dist/bot-executor/revision-docker-executor.js`
  - `ERR_MODULE_NOT_FOUND: Cannot find module '.../dist/tournament/persistence.js'`
- **Nguyên nhân:** Một số test case tích hợp gọi trực tiếp tệp JavaScript đã biên dịch trong thư mục `dist/`. Nếu chạy kiểm thử mà chưa thực hiện lệnh `npm run build`, các suite này sẽ lập tức báo lỗi thiếu tệp.

---

### DEFECT-DATAFLOW-006: Dị thường luồng dữ liệu (Data Flow Anomaly - ur-anomaly)
- **Phân hệ:** `frontend`, `practice-api`
- **Mức độ nghiêm trọng:** Medium
- **Mô tả:** Hệ thống cho phép truy xuất/sử dụng dữ liệu Bot (`use`) khi người dùng chưa từng khởi tạo hoặc tải lên bất kỳ mã nguồn bot nào (`define`).
- **Hiện trạng:**
  - Thiếu màn hình trạng thái rỗng (Empty State) cảnh báo tài khoản mới chưa có bot.
  - Không có thông báo hoặc nút điều hướng người dùng sang trang tạo bot, dẫn tới giao diện treo hoặc lỗi truy xuất biến không xác định.
- **Kỳ vọng:** Khi `botList` rỗng hoặc `null`, tầng UI/API phải kiểm tra điều kiện, chặn luồng chọn bot và hiển thị Call-to-Action hướng dẫn tạo bot.

---

## 3. Kiến nghị Hành động (Action Plan)

1. **Đối với Dev:**
   - **Xử lý DEFECT-TOURNAMENT-001:** Họp nhóm làm rõ lại quy tắc tính tổng số trận đấu trong giải đấu đa tầng. Xác định rõ hệ thống đang chạy thể thức 1 lượt hay 2 lượt (lượt đi/về) để quyết định sửa code ghi nhận trận hay cập nhật lại giá trị kỳ vọng trong test case cũ.
   - **Xử lý DEFECT-TOURNAMENT-002:** Bổ sung điều kiện kiểm tra ở đầu hàm `runPairingById`: nếu trạng thái trận đấu đang là `pending_tiebreaker`, lập tức trả về `{ success: false, error: 'tiebreaker pending' }`.
   - **Xử lý DEFECT-TOURNAMENT-003:** Bổ sung concurrency lock theo `pairingId` để từ chối các request trùng lặp, tránh treo Promise dẫn đến timeout.
   - Đảm bảo commit và push đầy đủ mã nguồn đã sửa lên nhánh remote trên GitHub để cả nhóm cùng kiểm thử đồng bộ.

2. **Đối với QA:**
   - Giữ nguyên nhánh làm việc `test/data-flow-coverage`.
   - Bổ sung bộ test case bẫy lỗi `ur-anomaly` cho phân hệ Frontend và Practice API.
   - Tiến hành kiểm thử hồi quy (Regression Testing) ngay khi Dev hoàn tất cập nhật mã nguồn trên Git.