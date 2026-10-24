async function loadDashboard() {
  const table = $('#dash-recent-tourneys tbody');
  const tableCard = $('#dash-recent-table');
  const emptyState = $('#dash-empty');
  const activityHeader = $('#dashboard-activity-header');
  const dashboardToolbar = $('#dashboard-tournament-toolbar');
  const botSection = $('#dash-bots-section');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  state.loading.add('dashboard');
  state.error = null;
  $('#dash-tourney-count').textContent = '—';
  $('#dash-bot-count').textContent = '—';
  emptyState.hidden = true;
  tableCard.hidden = false;
  activityHeader.hidden = false;
  renderTableMessage(table, 'Đang tải các giải đấu…', 5);
  renderLoadingSkeleton(table, 5, 5);
  void refreshQueueStats();
  try {
    const competitor = state.user?.role === 'competitor';
    syncTournamentStatusFilters();
    const dashboard = $('#dashboard');
    dashboard?.classList.toggle('player-dashboard', competitor);
    dashboard?.classList.toggle('organizer-dashboard', !competitor);
    if (dashboardToolbar) dashboardToolbar.hidden = competitor;
    const secondaryColumn = $('#dashboard-secondary-column');
    const dashboardCopy = $('#dashboard-welcome-copy');

    const activityTitle = $('#recent-tournaments-title');
    const activityCopy = $('#dashboard-activity-copy');
    const botLabel = $('#dash-bot-label');
    const tournamentLabel = $('#dash-tourney-label');
    const queueLabel = $('#dash-queue-label');
    const queueCard = $('#dash-queue-card');
    const recordCard = $('#dash-record-card');
    const pendingCard = $('#dash-pending-card');
    const dashboardIcons = {
      bot: competitor ? 'icon-bot' : 'icon-users',
      tournament: competitor ? 'icon-users' : 'icon-trophy',
      queue: competitor ? 'icon-user-round-plus' : 'icon-activity',
    };
    [['dash-bot-icon', dashboardIcons.bot], ['dash-bot-icon-main', dashboardIcons.bot], ['dash-tourney-icon-main', dashboardIcons.tournament], ['dash-queue-icon', dashboardIcons.queue], ['dash-queue-icon-main', dashboardIcons.queue]].forEach(([id, iconId]) => {
      const use = $(`#${id}`); if (use) use.setAttribute('href', `#${iconId}`);
    });
    if (dashboardCopy) {
      dashboardCopy.replaceChildren(
        create('span', { className: 'welcome-greeting', text: 'Chào mừng trở lại, ' }),
        create('strong', { className: 'welcome-user', text: state.user?.username || '', attrs: { id: 'dashboard-username' } }),
        create('span', { className: 'welcome-message', text: competitor
          ? 'Xây dựng Bot, luyện tập và tìm giải đấu phù hợp để tham gia.'
          : 'Theo dõi và quản lý các giải đấu của bạn.' }),
      );
    }
    if (activityTitle) activityTitle.textContent = competitor ? 'Giải đấu dành cho bạn' : 'Danh sách giải đấu quản lý';
    if (activityCopy) activityCopy.textContent = competitor
      ? 'Mở chi tiết để xem thông tin, lịch đấu và đăng ký Bot khi còn thời hạn.'
      : 'Theo dõi các giải đấu gần đây và quản lý hoạt động thi đấu.';
    if (secondaryColumn) secondaryColumn.textContent = competitor ? 'Trạng thái tham gia' : 'Thể thức';
    const statusColumn = $('#dashboard-status-column');
    if (statusColumn) statusColumn.textContent = competitor ? 'Trạng thái giải' : 'Trạng thái';
    const openColumn = $('#dashboard-open-column');
    const closeColumn = $('#dashboard-close-column');
    if (openColumn) openColumn.textContent = 'Mở đăng ký';
    if (closeColumn) closeColumn.textContent = 'Đóng đăng ký';
    if (botLabel) botLabel.textContent = competitor ? 'Bot của tôi' : 'Giải mở đăng ký';
    if (tournamentLabel) tournamentLabel.textContent = competitor ? 'Đang tham gia' : 'Giải đấu quản lý';
    const botDetail = $('#dash-bot-detail');
    const tournamentDetail = $('#dash-tourney-detail');
    if (botDetail) botDetail.textContent = competitor ? 'Đã có phiên bản mã nguồn' : 'Đang nhận đăng ký từ người chơi.';
    if (tournamentDetail) tournamentDetail.textContent = competitor ? 'Giải đấu hiện tại' : 'Tổng số giải đấu do bạn tạo.';
    if (queueLabel) queueLabel.textContent = competitor ? 'Đang diễn ra' : 'Đang diễn ra';
    const queueDetail = $('#dash-queue-detail');
    if (queueDetail) queueDetail.textContent = competitor ? 'Giải đấu đang mở đăng ký' : 'Giải đấu đang thi đấu.';
    if (queueCard) queueCard.hidden = competitor;
    if (recordCard) recordCard.hidden = !competitor;
    if (pendingCard) pendingCard.hidden = competitor;
    const [tournamentResponse, bots, myTournamentResponse, botStats] = await Promise.all([
      request(competitor ? '/tournaments/discoverable' : '/tournaments'),
      competitor ? request('/bots') : Promise.resolve([]),
      competitor ? request('/my/tournaments') : Promise.resolve([]),
      competitor ? request('/my/bot-stats') : Promise.resolve(null),
    ]);
    if (!isCurrentView('dashboard', authRevision, viewRevision)) return;
    const tournaments = competitor
      ? tournamentResponse.filter(tournament => ['draft', 'registration_open', 'running'].includes(tournament.status))
      : tournamentResponse;
    if (competitor) state.bots = bots;
    const openCount = tournaments.filter(tournament => tournament.status === 'registration_open').length;
    const runningCount = tournaments.filter(tournament => ['running', 'in_progress'].includes(tournament.status)).length;
    const participatingCount = competitor
      ? myTournamentResponse.filter(tournament => tournament.participantId || tournament.request?.status === 'approved').length
      : 0;
    $('#dash-tourney-count').textContent = competitor ? participatingCount : tournaments.length;
    if (competitor) {
      if (pendingCard) pendingCard.hidden = true;
      $('#dash-bot-count').textContent = bots.length;
      const cppBotCount = bots.filter(bot => bot.selectedRevision?.runtimeId === 'cpp').length;
      const pythonBotCount = bots.filter(bot => bot.selectedRevision?.runtimeId === 'python3').length;
      if (botDetail) botDetail.textContent = `C++17: ${cppBotCount} · Python 3: ${pythonBotCount}`;
      const navBotsBadge = $('#nav-badge-bots');
      if (navBotsBadge) { navBotsBadge.textContent = bots.length; navBotsBadge.hidden = !bots.length; }
      const navTourneysBadge = $('#nav-badge-tourneys');
      if (navTourneysBadge) { navTourneysBadge.textContent = openCount; navTourneysBadge.hidden = !openCount; }
      const recordRate = $('#dash-record-rate');
      const recordMatches = $('#dash-record-matches');
      const totalMatches = Number(botStats?.totalMatches) || 0;
      const wins = Number(botStats?.wins) || 0;
      const top3Finishes = Number(botStats?.top3Finishes) || 0;
      if (tournamentDetail) tournamentDetail.textContent = `${top3Finishes} lần lọt Top 3`;
      const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;
      if (recordRate) recordRate.textContent = totalMatches > 0 ? `${winRate.toFixed(1).replace('.0', '')}%` : '—';
      if (recordMatches) {
        if (totalMatches > 0) {
          recordMatches.textContent = `${wins} thắng / ${totalMatches} trận`;
          let winBar = $('#dash-record-card .record-win-bar');
          if (!winBar) {
            winBar = create('div', { className: 'record-win-bar' });
            const fill = create('div', { className: 'record-win-bar-fill' });
            winBar.appendChild(fill);
            $('#dash-record-card .stat-card__header')?.appendChild(winBar);
          }
          const fill = winBar.querySelector('.record-win-bar-fill');
          if (fill) fill.style.width = `${Math.min(100, Math.max(0, winRate))}%`;
        } else {
          recordMatches.textContent = 'Chưa có trận tham gia';
          const winBar = $('#dash-record-card .record-win-bar');
          if (winBar) winBar.remove();
        }
      }
      $('#dash-queue-value').textContent = openCount;
      const queueLabelText = $('#dash-queue-label'); if (queueLabelText) queueLabelText.textContent = 'Giải đang mở đăng ký';
      if (botSection) { botSection.hidden = false; renderDashboardBotList(bots); }
    } else {
      if (recordCard) recordCard.hidden = true;
      if (pendingCard) pendingCard.hidden = false;
      const requestResults = await Promise.allSettled(tournaments.map(tournament => request(`/tournaments/${tournament.tournamentId}/requests`)));
      if (!isCurrentView('dashboard', authRevision, viewRevision)) return;
      const pendingCount = requestResults.reduce((total, result) => total + (result.status === 'fulfilled'
        ? result.value.filter(item => item.status === 'pending').length : 0), 0);
      $('#dash-bot-count').textContent = openCount;
      $('#dash-queue-value').textContent = runningCount;
      const pendingCountEl = $('#dash-pending-count');
      if (pendingCountEl) pendingCountEl.textContent = String(pendingCount);
      const pendingDetail = $('#dash-pending-detail');
      if (pendingDetail) pendingDetail.textContent = pendingCount > 0 ? `${pendingCount} đơn cần duyệt.` : 'Đã duyệt hết đơn đăng ký.';
      if (botSection) botSection.hidden = true;
    }
    clearLoadingSkeleton(table);
    clear(table);
    const searchTerm = state.dashboardTournamentSearch.trim().toLowerCase();
    const filteredTournaments = tournaments.filter(tournament => {
      const matchesSearch = !searchTerm || String(tournament.name || '').toLowerCase().includes(searchTerm);
      const matchesStatus = state.dashboardTournamentStatus === 'all' || tournament.status === state.dashboardTournamentStatus;
      return matchesSearch && matchesStatus;
    });
    const tournamentCountEl = $('#dashboard-tournament-count');
    if (tournamentCountEl) tournamentCountEl.textContent = `${filteredTournaments.length} giải đấu`;
    if (!tournaments.length) {
      tableCard.hidden = true;
      emptyState.hidden = false;
      activityHeader.hidden = !competitor;
      $('#dash-empty-title').textContent = competitor ? 'Chưa có giải đấu mở' : 'Bạn chưa tạo giải đấu nào';
      $('#dash-empty-copy').textContent = competitor
        ? 'Tạo Bot đầu tiên để sẵn sàng tham gia khi có giải đấu.'
        : 'Tạo giải đấu đầu tiên để bắt đầu tổ chức thi đấu.';
      if (competitor) {
        // Bot creation belongs to the Bot section below; keep the tournament
        // empty state focused on discovery instead of showing a duplicate CTA.
        $('#dash-empty-tournament').hidden = true;
      } else {
        $('#dash-empty-tournament').hidden = false;
      }
      return;
    }
    if (!filteredTournaments.length) {
      tableCard.hidden = false;
      emptyState.hidden = true;
      activityHeader.hidden = false;
      renderTableMessage(table, 'Không tìm thấy giải đấu phù hợp.', 5);
      return;
    }
    filteredTournaments.slice(0, 5).forEach(tournament => {
      const row = create('tr');
      const myStatus = tournament.myRequestStatus
        ? ({ pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' }[tournament.myRequestStatus] || tournament.myRequestStatus)
        : 'Chưa đăng ký';
      const nameCell = textCell(tournament.name);
      nameCell.classList.add('dashboard-tournament-name-cell');
      nameCell.dataset.label = 'Giải đấu';
      const secondaryCell = textCell(competitor ? myStatus : tournamentFormatLabel(tournament.format));
      secondaryCell.dataset.label = competitor ? 'Trạng thái tham gia' : 'Thể thức';
      const statusCell = create('td');
      statusCell.dataset.label = competitor ? 'Trạng thái giải' : 'Trạng thái';
      const displayStatus = competitor && tournament.status === 'draft'
        ? 'registration_not_open'
        : tournament.status;
      statusCell.appendChild(statusBadge(displayStatus));
      const schedule = tournament.schedule || {};
      const openCell = textCell(formatDashboardTournamentDate(schedule.registrationOpensAt || tournament.registrationOpenedAt));
      openCell.dataset.label = 'Mở đăng ký';
      const closeCell = textCell(formatDashboardTournamentDate(schedule.registrationClosesAt || tournament.registrationClosedAt));
      closeCell.dataset.label = 'Đóng đăng ký';
      const participantCell = textCell(`${tournament.participants?.length ?? tournament.participantCount ?? 0} Bot`);
      participantCell.dataset.label = 'Người tham gia';
      row.append(nameCell, secondaryCell, statusCell, openCell, closeCell, participantCell);
      const action = create('td');
      action.dataset.label = 'Mở giải đấu';
      action.appendChild(actionButton(competitor ? 'Xem chi tiết' : 'Xem', () => viewTournament(tournament.tournamentId), `view:${tournament.tournamentId}`));
      row.appendChild(action);
      table.appendChild(row);
    });
  } catch (error) {
    if (isCurrentView('dashboard', authRevision, viewRevision)) {
      state.error = localizeErrorMessage(error.message || 'Không thể tải trang tổng quan.');
      $('#dash-tourney-count').textContent = '—';
      $('#dash-bot-count').textContent = '—';
      emptyState.hidden = true;
      tableCard.hidden = false;
      activityHeader.hidden = false;
      renderTableMessage(table, state.error, 5, loadDashboard);
    }
  }
  finally { state.loading.delete('dashboard'); }
}

function formatDashboardTournamentDate(value) {
  if (!value) return 'Chưa thiết lập';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa thiết lập';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZoneName: 'short',
  }).format(date);
}

