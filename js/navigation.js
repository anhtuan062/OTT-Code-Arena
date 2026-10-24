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

const AUTHENTICATED_VIEWS = new Set(['dashboard', 'bots', 'bot-workspace', 'tournaments', 'tournament-detail', 'replay-view', 'bot-playground', 'player-guide']);

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
  return state.activeView !== 'bot-workspace' || !hasUnsavedBotWorkspaceChanges()
    || window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời không gian mã nguồn?');
}

function renderTopbarBreadcrumb(sectionTitle, currentTitle, showParent = true, parentTarget = 'tournaments') {
  const topbarBreadcrumb = $('#topbar-breadcrumb');
  if (!topbarBreadcrumb) return;

  const current = create('span', {
    className: 'topbar-breadcrumb-current',
    text: currentTitle,
    attrs: { 'aria-current': 'page' },
  });

  if (Array.isArray(state.navigationTrail) && state.navigationTrail.length > 1) {
    const children = [];
    for (let i = 0; i < state.navigationTrail.length - 1; i += 1) {
      const entry = state.navigationTrail[i];
      const sectionLink = create('a', {
        className: 'topbar-breadcrumb-link',
        text: entry.title,
        attrs: {
          href: `#${entry.target || entry.view}`,
          'aria-label': `Về ${entry.title}`,
        },
      });
      const separator = create('span', {
        className: 'topbar-breadcrumb-separator',
        text: '/',
        attrs: { 'aria-hidden': 'true' },
      });
      children.push(sectionLink, separator);
    }
    children.push(current);
    topbarBreadcrumb.replaceChildren(...children);
    return;
  }

  if (!showParent) {
    topbarBreadcrumb.replaceChildren(current);
    return;
  }

  const sectionLink = create('a', {
    className: 'topbar-breadcrumb-link',
    text: sectionTitle,
    attrs: {
      href: `#${parentTarget}`,
      'aria-label': `Về ${sectionTitle}`,
    },
  });
  const separator = create('span', {
    className: 'topbar-breadcrumb-separator',
    text: '/',
    attrs: { 'aria-hidden': 'true' },
  });

  topbarBreadcrumb.replaceChildren(sectionLink, separator, current);
}

function updateTopbarTournamentBreadcrumb(name) {
  if (state.activeView !== 'tournament-detail' || !name) return;
  if (Array.isArray(state.navigationTrail)) {
    const item = state.navigationTrail.find(entry => entry.view === 'tournament-detail');
    if (item) item.title = name;
  }
  renderTopbarBreadcrumb(getTournamentDetailParentTitle(), name, true);
}

function getTournamentDetailParentTitle() {
  if (state.tournamentDetailSource === 'dashboard') return 'Tổng quan';
  if (state.tournamentDetailSource === 'tournaments') {
    return state.user?.role === 'organizer'
      ? 'Quản lý giải đấu'
      : state.tournamentScope === 'mine' ? 'Giải đấu của tôi' : 'Giải đấu';
  }
  return state.user?.role === 'organizer' ? 'Quản lý' : 'Giải đấu';
}

function getBotWorkspaceParent() {
  if (state.botWorkspaceSource === 'dashboard') return { title: 'Tổng quan', target: 'dashboard' };
  if (state.botWorkspaceSource === 'tournaments' || state.botWorkspaceSource === 'tournament-detail') return { title: 'Giải đấu', target: 'tournaments' };
  return { title: 'Bot của tôi', target: 'bots' };
}

function getReplayParent(sectionTitle) {
  if (state.replayContext?.practice && state.practiceReplayParent) return state.practiceReplayParent;
  if (state.replayContext?.practice && (state.practiceSourceMode === 'create' || !state.sourceWorkspaceBot?.id)) {
    return { title: 'Tạo Bot', target: 'bot-workspace' };
  }
  return state.replayContext?.practice
    ? { title: 'Bot của tôi', target: 'bots' }
    : { title: sectionTitle, target: 'tournaments' };
}

function navigate(view, options = {}) {
  const staticReplayOnly = typeof window !== 'undefined' && window.OTT_PUBLIC_REPLAY_STATIC_ONLY === true;
  if (!state.user && view !== 'auth-screen' && !(staticReplayOnly && view === 'replay-view')) return false;
  if (state.user && view === 'auth-screen') view = 'dashboard';
  if (!AUTHENTICATED_VIEWS.has(view) && view !== 'auth-screen') return false;
  if (view !== 'tournament-detail' && typeof stopMultiStagePolling === 'function') stopMultiStagePolling();
  if (view !== 'tournament-detail' && typeof stopPhase2PreflightPolling === 'function') stopPhase2PreflightPolling();
  if (view === 'bot-workspace' && state.user?.role !== 'competitor') return false;
  if (view === 'player-guide' && state.user?.role !== 'competitor') return false;
  // Opening the practice replay does not replace the draft; keep the editor
  // state intact without treating the preview transition as a destructive exit.
  const isPracticeReplay = view === 'replay-view' && state.replayContext?.practice === true;
  if (view !== state.activeView && !isPracticeReplay && !canLeaveBotWorkspace()) return false;
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
    const target = link.dataset.target === 'my-tournaments' ? 'tournaments' : link.dataset.target;
    const active = target === view
      && (!link.dataset.scope || link.dataset.scope === state.tournamentScope);
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  });
  const tournamentCache = Array.isArray(state.tournaments) ? state.tournaments : [];
  const pageTitles = { dashboard: state.user?.role === 'organizer' ? 'Tổng quan giải đấu' : 'Tổng quan', bots: 'Bot của tôi', 'bot-workspace': 'Tạo Bot', 'bot-playground': 'Kiểm tra thế cờ', 'player-guide': 'Hướng dẫn người chơi', tournaments: state.user?.role === 'organizer' ? 'Quản lý giải đấu' : 'Giải đấu', 'tournament-detail': state.currentTournament?.name || tournamentCache.find(tournament => tournament.tournamentId === state.tournamentId)?.name || 'Chi tiết giải đấu', 'replay-view': 'Xem lại trận đấu' };
  const pageTitle = $('#page-title');
  if (pageTitle) pageTitle.textContent = pageTitles[view] || 'OTT Code Arena';
  const sectionTitle = state.user?.role === 'organizer' ? 'Quản lý' : 'Giải đấu';
  const currentTitle = view === 'dashboard'
    ? 'Tổng quan'
    : pageTitles[view] || 'OTT Code Arena';
  const botWorkspaceParent = view === 'bot-workspace' ? getBotWorkspaceParent() : null;
  const replayParent = view === 'replay-view' ? getReplayParent(sectionTitle) : null;
  const breadcrumbParent = view === 'tournament-detail'
    ? getTournamentDetailParentTitle()
    : replayParent?.title || botWorkspaceParent?.title || sectionTitle;
  const breadcrumbTarget = replayParent?.target || botWorkspaceParent?.target || 'tournaments';

  if (!Array.isArray(state.navigationTrail)) state.navigationTrail = [];
  if (options.fromNav === true) {
    state.navigationTrail = [{ view, title: currentTitle, target: view }];
  } else {
    const existingIndex = state.navigationTrail.findIndex(item => item.view === view);
    if (existingIndex !== -1) {
      state.navigationTrail = state.navigationTrail.slice(0, existingIndex + 1);
      state.navigationTrail[existingIndex].title = currentTitle;
    } else {
      if (!state.navigationTrail.length && ['bot-workspace', 'tournament-detail', 'replay-view'].includes(view)) {
        state.navigationTrail.push({ view: breadcrumbTarget, title: breadcrumbParent, target: breadcrumbTarget });
      }
      state.navigationTrail.push({ view, title: currentTitle, target: view });
    }
  }

  renderTopbarBreadcrumb(breadcrumbParent, currentTitle, ['bot-workspace', 'tournament-detail', 'replay-view'].includes(view), breadcrumbTarget);
  closeMobileNavigation();
  target.classList.add('active');
  if (view === 'dashboard') void loadDashboard();
  if (view === 'bots') void loadBots();
  if (view === 'tournaments') void loadTournaments();
  if (view === 'tournament-detail' && state.tournamentId && typeof refreshTournamentDetail === 'function') void refreshTournamentDetail();
  if (view === 'bot-playground' && typeof initBotPlayground === 'function') void initBotPlayground();
  if (view === 'bot-workspace') {
    const workspace = $('#bot-source-workspace');
    if (workspace) workspace.hidden = false;
  }
  if (options.history !== false && view === 'bot-workspace' && window.location.hash !== '#bot-workspace') {
    window.history.pushState({ view }, '', '#bot-workspace');
  }
  if (options.history !== false && ['dashboard', 'bots', 'tournaments', 'bot-playground', 'player-guide'].includes(view)) {
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
  if (state.user.role !== 'competitor' && (targetView === 'bots' || targetView === 'bot-workspace' || targetView === 'player-guide')) targetView = 'dashboard';
  if (requestedView !== targetView) window.history.replaceState({ view: targetView }, '', `#${targetView}`);
  if (state.activeView !== targetView || !document.getElementById(targetView)?.classList.contains('active')) {
    navigate(targetView, { history: false });
  }
}

