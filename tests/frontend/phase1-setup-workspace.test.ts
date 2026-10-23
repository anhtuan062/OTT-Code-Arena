import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readAssembledFrontendMarkup, readAssembledFrontendStyles } from './frontend-fixtures';

async function source(file: string): Promise<string> {
  return readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
}

describe('Phase 1 Tournament Setup Workspace', () => {
  it('implements dedicated Tournament Setup Workspace structure in Phase 1', async () => {
    const [app, tournaments, markup] = await Promise.all([
      source('app.js'),
      source('js/tournaments.js'),
      readAssembledFrontendMarkup(),
    ]);

    // Header enhancements
    expect(markup).toContain('id="td-breadcrumb-root"');
    expect(markup).toContain('id="td-phase-label"');

    // Breadcrumb and phase label updates
    expect(tournaments).toContain("breadcrumbRoot.textContent = 'Quản lý giải đấu'");
    expect(tournaments).toContain("breadcrumbName.textContent = 'Chuẩn bị giải đấu'");
    expect(tournaments).toContain("text: 'Chuẩn bị giải đấu'");
    expect(tournaments).toContain("'aria-label': 'Nội dung giải đấu'");
    expect(tournaments).toContain("phaseLabel.textContent = 'Giai đoạn 1/7'");

    // 1-column workspace layout
    expect(tournaments).toContain('phase-setup-workspace-grid');
    expect(tournaments).toContain('phase-setup-workspace');

    // 4 configuration tabs
    expect(tournaments).toContain('phase-config-tabs');
    expect(tournaments).toContain("id: 'tab-config-info'");
    expect(tournaments).toContain("id: 'tab-config-rules'");
    expect(tournaments).toContain("id: 'tab-config-time'");
    expect(tournaments).toContain("id: 'tab-config-bots'");
    expect(tournaments).not.toContain("id: 'tab-config-results'");

    // Bundled app includes the workspace implementation
    expect(app).toContain('phase-setup-workspace-grid');
    expect(app).toContain('phase-setup-workspace');
    expect(app).toContain('phase-config-tabs');
  });

  it('implements organizer View, Edit, Save, and Cancel interactions with persistent API call', async () => {
    const tournaments = await source('js/tournaments.js');

    // Controls
    expect(tournaments).toContain('btn-edit-phase1-config');
    expect(tournaments).toContain('btn-save-phase1-config');
    expect(tournaments).toContain('btn-cancel-phase1-config');

    // Form inputs
    expect(tournaments).toContain("id: 'edit-t-name'");
    expect(tournaments).toContain("id: 'edit-t-desc'");
    expect(tournaments).toContain("id: 'edit-t-organizer'");
    expect(tournaments).toContain("id: 'edit-t-contact'");
    expect(tournaments).toContain("id: 'edit-t-rules'");
    expect(tournaments).toContain("id: 'edit-t-policy'");
    expect(tournaments).toContain("phase1Date('edit-t-visibleAt'");
    expect(tournaments).toContain('function phase1DisplayDate(value)');
    expect(tournaments).toContain("phase1DisplayDate(phase1Schedule(tournament).visibleAt)");
    expect(tournaments).toContain("phase1Date('edit-t-registrationOpensAt'");
    expect(tournaments).toContain("phase1Date('edit-t-registrationClosesAt'");
    expect(tournaments).toContain("phase1Select('edit-t-ruleset'");
    expect(tournaments).toContain("'ott-standard', [{ value: 'ott-standard'");
    expect(tournaments).not.toContain("phase1Select('edit-t-best-of'");
    expect(tournaments).toContain("'Nhiều giai đoạn'");
    expect(tournaments).not.toContain("phase1Select('edit-t-format'");
    expect(tournaments).toContain("text: 'Vòng bảng: BO2'");
    expect(tournaments).toContain("text: 'Vòng loại: BO3'");
    expect(tournaments).toContain("text: 'Conversion'");
    expect(tournaments).toContain("phase1Number('edit-t-maxTurns'");
    expect(tournaments).toContain("phase1Number('edit-t-maxSourceBytes'");
    expect(tournaments).toContain("phase1Number('edit-t-maxSourceBytes', draft.botLimits.maxSourceBytes, 1, 65536, 1, true)");
    expect(tournaments).toContain("phase1Number('edit-t-turnTimeoutMs', draft.matchConfig.turnTimeoutMs, 5000");
    expect(tournaments).toContain("value: '2'");

    // Input validation
    expect(tournaments).toContain('Tên giải đấu phải từ 1 đến 100 ký tự.');

    // Persistent PATCH API call
    expect(tournaments).toContain("api(`/tournaments/${tournament.tournamentId}`, {");
    expect(tournaments).toContain("method: 'PATCH'");
    expect(tournaments).toContain('name: newName');
    expect(tournaments).toContain('function createPhase1Draft(tournament)');
    expect(tournaments).toContain('function capturePhase1DraftFromDom(tournament)');
    expect(tournaments).toContain('if (isEditing) capturePhase1DraftFromDom(tournament);');
    expect(tournaments).toContain('description: String(draft.description || \'\').trim()');
    expect(tournaments).toContain('organizerInfo: String(draft.organizerInfo || \'\').trim()');
    expect(tournaments).toContain('contactInfo: String(draft.contactInfo || \'\').trim()');
    expect(tournaments).toContain('rulesNotes: String(draft.rulesNotes || \'\').trim()');
    expect(tournaments).toContain('policyNotes: String(draft.policyNotes || \'\').trim()');
    expect(tournaments).toContain('schedule: current.schedule');
    expect(tournaments).toContain('rulesConfig: current.rulesConfig');
    expect(tournaments).toContain('botLimits: current.botLimits');
  });

  it('presents structured OTT game rules in 6 distinct articles with code-backed values', async () => {
    const tournaments = await source('js/tournaments.js');

    // 6 articles
    expect(tournaments).toContain('Điều 1');
    expect(tournaments).toContain('Tổng quan trò chơi');
    expect(tournaments).toContain('Mỗi ván diễn ra trên bàn cờ 9×9');

    expect(tournaments).toContain('Điều 2');
    expect(tournaments).toContain('Nước đi hợp lệ & Điều kiện chiến thắng');

    expect(tournaments).toContain('Điều 3');
    expect(tournaments).toContain('Giới hạn trận đấu & Thời gian suy nghĩ');
    expect(tournaments).toContain('matchConfig');
    expect(tournaments).toContain('turnTimeoutMs');

    expect(tournaments).toContain('Điều 4');
    expect(tournaments).toContain('Cấu trúc series (BO2 & BO3)');

    expect(tournaments).toContain('Điều 5');
    expect(tournaments).toContain('Tính điểm & Xếp hạng');
    expect(tournaments).toContain('scoringConfig');
    expect(tournaments).toContain('dùng mã đăng ký để giữ thứ tự cố định');

    expect(tournaments).toContain('Điều 6');
    expect(tournaments).toContain('Khi Bot không thể tiếp tục ván đấu');
    expect(tournaments).toContain('phase-rule-detail-list');
    expect(tournaments).toContain('Nước đi không nằm trong danh sách nước đi hợp lệ');

    // Clear organizer-facing tiebreaker notice
    expect(tournaments).toContain('được đánh dấu là chờ phân định');
  });

  it('does not present unsupported hardcoded tournament claims', async () => {
    const tournaments = await source('js/tournaments.js');

    expect(tournaments).not.toContain('timeout > 5s');
    expect(tournaments).not.toContain('Docker Sandbox cách ly (C++17, Python 3)');
    expect(tournaments).not.toContain('Sandbox Ready');
    expect(tournaments).not.toContain('Đổi bên xen kẽ giữa các ván đấu');
    expect(tournaments).not.toContain('Hiệu số ván thắng');
    expect(tournaments).not.toContain('Kết quả chính thức chỉ công bố khi Ban tổ chức xác nhận ở Giai đoạn 7');
    expect(tournaments).toContain('Nếu cần ván thứ ba, hệ thống xác định bên đi trước theo mã cặp đấu');
  });

  it('suppresses match progress, empty preliminary panels, and redundant next step guidance in Phase 1', async () => {
    const tournaments = await source('js/tournaments.js');

    // Next step guidance (#td-next-step) is hidden in draft
    expect(tournaments).toContain("if (tournament.status === 'draft' || tournament.status === 'registration_open') {");
    expect(tournaments).toContain('guidance.hidden = true;');

    // Multi-stage workspace is hidden and cleared during draft
    expect(tournaments).toContain('if (workspace) { workspace.hidden = true; clear(workspace); }');

    // Single primary open_registration CTA in header
    expect(tournaments).toContain('phase-open-reg-cta');
  });

  it('does not render the removed pre-flight readiness checklist panel', async () => {
    const tournaments = await source('js/tournaments.js');

    expect(tournaments).not.toContain('phase-setup-readiness');
    expect(tournaments).not.toContain('phase-readiness-checklist');
    expect(tournaments).not.toContain('Sẵn sàng mở đăng ký');
  });

  it('uses the Phase 2 API contract for schedule, rules, and Bot limits', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain('schedule: current.schedule');
    expect(tournaments).toContain('rulesConfig: current.rulesConfig');
    expect(tournaments).toContain('botLimits: current.botLimits');
    expect(tournaments).toContain('registrationClosesAt');
    expect(tournaments).toContain('phase-runtime-note');
    expect(tournaments).toContain('thực thi trận');
  });

  it('renders server-authoritative lifecycle countdowns and preserves pending review semantics', async () => {
    const tournaments = await source('js/tournaments.js');
    expect(tournaments).toContain('updateTournamentScheduleNotice');
    expect(tournaments).toContain('registrationClosedReason === \'scheduled\'');
    expect(tournaments).toContain('Backend sẽ không tạo lịch khi còn pending');
  });

  it('deduplicates Phase 3 roster rows by botId before rendering', async () => {
    const tournaments = await source('js/tournaments.js');

    expect(tournaments).toContain('const seenBotIds = new Set();');
    expect(tournaments).toContain('const identity = participant.bot?.botId || participant.participantId;');
    expect(tournaments).toContain('if (!identity || seenBotIds.has(identity)) return false;');
  });

  it('maintains responsive layout and light green visual language for Phase 1', async () => {
    const css = await readAssembledFrontendStyles();

    // Setup workspace styling
    expect(css).toContain('.phase-setup-workspace-grid');
    expect(css).toContain('.phase-setup-head');
    expect(css).toContain('.phase-config-tabs');
    expect(css).toContain('.phase-rules-articles');
    expect(css).toContain('.phase-rule-article');
    expect(css).toContain('.rule-badge');
    expect(css).toContain('.phase-rule-callout');
    expect(css).toContain('.phase-settings-grid');
    expect(css).toContain('.phase-settings-list');
    expect(css).toContain('.phase-runtime-note');
    expect(css).toContain('.phase-open-reg-cta');

    // Light green palette
    expect(css).toContain('#176b50');
    expect(css).toContain('#e4f1eb');
    expect(css).toContain('#edf5ef');

    // Responsive media queries
    expect(css).toContain('@media (max-width: 960px)');
    expect(css).toContain('grid-template-columns: 1fr;');
  });
});

