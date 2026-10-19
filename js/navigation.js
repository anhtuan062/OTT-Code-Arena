function toggleMobileNavigation() {
  const sidebar = $('#app-nav');
  const backdrop = $('#sidebar-backdrop');
  const toggle = $('#mobile-menu-toggle');
  const open = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', open);
  backdrop.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Đóng điều hướng' : 'Mở điều hướng');
}

const AUTHENTICATED_VIEWS = new Set(['dashboard', 'operations', 'bots', 'bot-workspace', 'tournaments', 'tournament-detail', 'replay-view']);

function closeMobileNavigation() {
  const sidebar = $('#app-nav');
  const backdrop = $('#sidebar-backdrop');
  const toggle = $('#mobile-menu-toggle');
  if (!sidebar || !backdrop || !toggle) return;
  sidebar.classList.remove('open');
  backdrop.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Mở điều hướng');
}

function isCurrentView(view, authRevision, viewRevision, tournamentId) {
  return state.user && state.authRevision === authRevision && state.viewRevision === viewRevision && state.activeView === view
    && (tournamentId === undefined || state.tournamentId === tournamentId);
}

function canLeaveBotWorkspace() {
  return state.activeView !== 'bot-workspace' || !state.sourceDirty
    || window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời không gian mã nguồn?');
}

function navigate(view, options = {}) {
  if (!state.user && view !== 'auth-screen') return false;
  if (state.user && view === 'auth-screen') view = 'dashboard';
  if (!AUTHENTICATED_VIEWS.has(view) && view !== 'auth-screen') return false;
  if (view !== 'tournament-detail' && typeof stopMultiStagePolling === 'function') stopMultiStagePolling();
  if (view !== 'tournament-detail' && typeof stopPhase2PreflightPolling === 'function') stopPhase2PreflightPolling();
  if (view !== 'operations' && typeof stopOperationsPolling === 'function') stopOperationsPolling();
  if (view === 'bot-workspace' && state.user?.role !== 'competitor') return false;
  if (view === 'operations' && state.user?.role !== 'organizer') return false;
  if (view !== state.activeView && !canLeaveBotWorkspace()) return false;
  if (view !== 'replay-view') {
    stopReplayPlayback();
    if (typeof stopPracticeReplay === 'function') stopPracticeReplay();
    stopLiveMatchPolling();
  }
  const target = document.getElementById(view);
  if (!target) return false;
  state.activeView = view;
  state.viewRevision += 1;
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(link => {
    const active = link.dataset.target === view
      && (!link.dataset.scope || link.dataset.scope === state.tournamentScope);
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('.bottom-nav [data-target]').forEach(link => {
    const active = view === 'tournaments'
      ? (state.tournamentScope === 'mine' ? link.dataset.target === 'my-tournaments' : link.dataset.target === 'tournaments')
      : link.dataset.target === view;
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
  const pageTitles = { dashboard: state.user?.role === 'organizer' ? 'Tổng quan giải đấu' : 'Tổng quan', operations: 'Vận hành hệ thống', bots: 'Bot của tôi', 'bot-workspace': 'Tạo Bot', tournaments: state.tournamentScope === 'mine' ? 'Giải đấu của tôi' : state.user?.role === 'organizer' ? 'Quản lý giải đấu' : 'Giải đấu đang mở', 'tournament-detail': 'Chi tiết giải đấu', 'replay-view': 'Xem lại trận đấu' };
  const pageTitle = $('#page-title');
  if (pageTitle) pageTitle.textContent = pageTitles[view] || 'OTT Code Arena';
  const topbarBreadcrumb = $('#topbar-breadcrumb');
  if (topbarBreadcrumb) {
    const sectionTitle = state.user?.role === 'organizer' ? 'Quản lý' : 'Giải đấu';
    const currentTitle = view === 'dashboard'
      ? 'Tổng quan'
      : pageTitles[view] || 'OTT Code Arena';
    topbarBreadcrumb.textContent = `${sectionTitle} / ${currentTitle}`;
  }
  closeMobileNavigation();
  target.classList.add('active');
  if (view === 'dashboard') void loadDashboard();
  if (view === 'operations') startOperationsPolling();
  if (view === 'bots') void loadBots();
  if (view === 'tournaments') void loadTournaments();
  if (view === 'bot-workspace') {
    const workspace = $('#bot-source-workspace');
    if (workspace) workspace.hidden = false;
  }
  if (options.history !== false && view === 'bot-workspace' && window.location.hash !== '#bot-workspace') {
    window.history.pushState({ view }, '', '#bot-workspace');
  }
  if (options.history !== false && ['dashboard', 'operations', 'bots', 'tournaments'].includes(view)) {
    const hash = `#${view}`;
    if (window.location.hash !== hash) window.history.pushState({ view }, '', hash);
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('ott_active_view', view);
      if (state.tournamentScope) window.sessionStorage.setItem('ott_tournament_scope', state.tournamentScope);
    }
  } catch {}
  return true;
}

function syncLocationRoute() {
  const requestedView = window.location.hash.slice(1);

  if (!state.user) {
    if (requestedView !== 'auth-screen' || state.activeView !== 'auth-screen') showAuthScreen();
    return;
  }

  let targetView = AUTHENTICATED_VIEWS.has(requestedView) ? requestedView : 'dashboard';
  if (state.user.role !== 'competitor' && (targetView === 'bots' || targetView === 'bot-workspace')) targetView = 'dashboard';
  if (state.user.role !== 'organizer' && targetView === 'operations') targetView = 'dashboard';
  if (requestedView !== targetView) window.history.replaceState({ view: targetView }, '', `#${targetView}`);
  if (state.activeView !== targetView || !document.getElementById(targetView)?.classList.contains('active')) {
    navigate(targetView, { history: false });
  }
}

