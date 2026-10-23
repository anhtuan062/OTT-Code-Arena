function stopReplayPlayback() {
  if (state.replayTimer) clearTimeout(state.replayTimer);
  state.replayTimer = null;
  state.replayPlaybackActive = false;
  state.replayPlaybackToken = (state.replayPlaybackToken || 0) + 1;
  const button = $('#btn-replay-play');
  if (button) {
    const label = button.querySelector('.replay-control-label'); if (label) label.textContent = 'Phát';
    const playIcon = button.querySelector('use'); if (playIcon) playIcon.setAttribute('href', '#icon-play');
    button.setAttribute('aria-label', 'Phát'); button.setAttribute('title', 'Phát');
    button.setAttribute('aria-pressed', 'false');
  }
}

function setReplayBackLabel(label) {
  const target = $('#replay-back-label');
  if (target) target.textContent = label;
}


function formatReplayReason(reason) { return localizeReason(reason); }

function replayResultLabel(replay) {
  if (replay.winner === 'A') return 'Người chơi A chiến thắng';
  if (replay.winner === 'B') return 'Người chơi B chiến thắng';
  if (replay.winner === 'draw') return 'Trận hòa';
  return replay.terminationReason ? 'Trận đấu đã kết thúc' : 'Trận đấu chưa hoàn tất';
}

function replayWinnerLabel(replay) {
  // A selected BO2/BO3 game can have a local winner side that differs from
  // the aggregate series winner. Prefer the series winner whenever the
  // replay envelope contains a series result.
  const winner = replay?.series?.winner ?? replay?.winner;
  if (winner === 'A' || winner === 'B') {
    const identity = replay.participantIdentities?.[winner]?.participantName;
    return identity ? `${identity} chiến thắng` : replayResultLabel(replay);
  }
  if (winner === 'draw') return 'Hòa';
  return '—';
}

function getActiveReplay() {
  return state.replay;
}

function renderReplaySeriesControls(replay) {
  const existing = $('#replay-series-controls');
  if (existing) existing.remove();
  if (!Array.isArray(replay?.series?.games) || !replay.series.games.length) return;
  const controls = create('div', { className: 'replay-series-controls', attrs: { id: 'replay-series-controls', role: 'group', 'aria-label': 'Chọn ván trong series BO3' } });
  const identities = Object.values(replay.participantIdentities || {}).filter(Boolean);
  const names = new Map(identities.map(identity => [identity.participantId, identity.participantName]));
  const seriesLabel = replay.series.format?.toUpperCase() || `BO${replay.series.bestOf || 3}`;
  controls.setAttribute('aria-label', `Chá»n vÃ¡n trong series ${seriesLabel}`);
  replay.series.games.forEach((game, index) => {
    const available = isReplayShape(game.replay);
    const sideA = names.get(game.participantA) || game.participantA;
    const sideB = names.get(game.participantB) || game.participantB;
    const result = game.winnerParticipantId ? ` · ${names.get(game.winnerParticipantId) || game.winnerParticipantId} thắng` : ' · Hòa';
    const button = actionButton(`Ván ${game.gameNumber}: ${sideA} / ${sideB}${result}`, () => selectReplayGame(index), `replay-series-game:${index}`, 'secondary-btn');
    button.classList.toggle('active', index === state.replayGameIndex);
    button.textContent = `Ván ${game.gameNumber}`;
    button.disabled = !available;
    if (!available) button.title = 'Ván đấu này không có dữ liệu xem lại hợp lệ.';
    controls.appendChild(button);
  });
  $('#replay-series-slot')?.appendChild(controls);
}

function selectReplayGame(index) {
  const game = state.replaySeries?.series?.games?.[index];
  if (!isReplayShape(game?.replay)) return;
  stopReplayPlayback();
  state.replayGameIndex = index;
  state.replay = game.replay;
  document.querySelector('#replay-view .replay-player-a-label')?.classList.remove('is-winner');
  document.querySelector('#replay-view .replay-player-b-label')?.classList.remove('is-winner');
  renderReplaySeriesControls(state.replaySeries);
  renderReplaySummaryV2(state.replaySeries);
  goToReplayTurn(-1);
}

function isReplayShape(replay) {
  return replay && replay.initialState && Number(replay.initialState.boardSize) === 9
    && Array.isArray(replay.initialState.pieces) && Array.isArray(replay.moves)
    && replay.finalState && Number(replay.finalState.boardSize) === 9;
}

function availableSeriesReplayIndexes(replay) {
  return Array.isArray(replay?.series?.games)
    ? replay.series.games.map((game, index) => isReplayShape(game?.replay) ? index : -1).filter(index => index >= 0)
    : [];
}

function applyReplayParticipantIdentities(replay) {
  const identities = replay.participantIdentities || {};
  const revisions = replay.metadata?.sourceRevisions || [];
  const runtimeLabel = runtime => runtime === 'cpp' ? 'C++17' : runtime === 'python3' ? 'Python 3' : '';
  const renderIdentity = (side, fallback) => {
    const identity = identities[side] || {};
    const revision = revisions.find(item => item.player === side);
    const participantName = identity.participantName || fallback;
    $(`#r-p${side === 'A' ? '1' : '2'}-name`).textContent = participantName;
    // In practice matches the participant and bot can intentionally have the
    // same display name. Do not render the same name twice in the header.
    const botName = identity.botName && identity.botName !== participantName ? identity.botName : '';
    const details = [botName, runtimeLabel(identity.runtimeId || revision?.runtimeId), revision?.revisionId ? `Revision ${shortId(revision.revisionId)}` : ''].filter(Boolean).join(' · ');
    $(`#r-p${side === 'A' ? '1' : '2'}-bot`).textContent = details;
  };
  renderIdentity('A', 'Người chơi A');
  renderIdentity('B', 'Người chơi B');
}

function renderReplaySummary(replay) {
  const title = $('#replay-view-title'); if (title) title.textContent = `Trận đấu ${shortId(replay.matchId || state.replayMatchId)}`;
  $('#r-match-id').textContent = String(replay.matchId || state.replayMatchId || 'â€”');
  $('#replay-scrubber').max = String(Math.max(-1, replay.moves.length - 1));
  applyReplayParticipantIdentities(replay);
  // Practice replays are BO1 and use this legacy summary renderer. The score
  // cards must still reflect the completed result instead of staying at 0-0.
  updateReplaySeriesScore(replay.winner === 'A' ? 1 : 0, replay.winner === 'B' ? 1 : 0);
  $('#r-result-text').textContent = `${replayResultLabel(replay)} · ${formatReplayReason(replay.terminationReason)}`;
  const winnerText = replayWinnerLabel(replay);
  const winnerEl = $('#r-winner');
  if (winnerEl) {
    winnerEl.textContent = (replay.winner === 'A' || replay.winner === 'B') ? `🏆 ${winnerText}` : winnerText;
    winnerEl.classList.toggle('has-winner', replay.winner === 'A' || replay.winner === 'B');
  }
  $('#r-termination').textContent = formatReplayReason(replay.terminationReason) || 'Chưa xác định';
  $('#r-protocol').textContent = String(replay.protocolVersion || 'unknown');
  const statusBadge = $('#replay-status-badge'); if (statusBadge) statusBadge.textContent = 'Đã hoàn thành';
  const contextNote = $('#replay-context-note'); if (contextNote) contextNote.textContent = state.replayContext?.practice ? 'Trận đấu thử' : 'Trận BO1';
  const boardTitle = $('#replay-board-title'); if (boardTitle) boardTitle.textContent = 'Ván 1 · Diễn biến';
  const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = false;
}

function replayParentSeries() {
  return state.replaySeries?.series || state.replayContext?.seriesContext || null;
}

function replayParentSeriesEnvelope() {
  if (state.replaySeries) return state.replaySeries;
  const series = replayParentSeries();
  return series ? { series, participantIdentities: series.participantIdentities || {}, winner: series.winner } : null;
}

function replaySeriesDrawCount(series) {
  return (series?.games || []).filter(game => game?.winner === 'draw' || game?.winnerParticipantId === null).length;
}

function replaySeriesScoreText(series) {
  const label = series?.format?.toUpperCase() || `BO${series?.bestOf || 3}`;
  const draws = replaySeriesDrawCount(series);
  return `${label} · Tỷ số ${series?.winsA || 0}-${series?.winsB || 0}${draws ? ` · ${draws} hòa` : ''}`;
}

function renderReplaySummaryV2Base(replay) {
  const active = state.replay || replay;
  const seriesEnvelope = replayParentSeriesEnvelope();
  const series = seriesEnvelope?.series;
  const title = $('#replay-view-title');
  if (title) title.textContent = series ? `Series ${series.format?.toUpperCase() || `BO${series.bestOf || 3}`}` : `Trận đấu ${shortId(active.matchId || state.replayMatchId)}`;
  $('#r-match-id').textContent = String(seriesEnvelope?.matchId || active.matchId || state.replayMatchId || '—');
  $('#replay-scrubber').max = String(Math.max(-1, active.moves.length - 1));
  // BO3 can swap temporary sides A/B. Keep the aggregate series identities
  // in the header while the board uses the selected game's replay.
  const identityReplay = series && seriesEnvelope?.participantIdentities
    ? { ...active, participantIdentities: seriesEnvelope.participantIdentities, metadata: seriesEnvelope.metadata }
    : active;
  applyReplayParticipantIdentities(identityReplay);
  if (series) {
    const identities = seriesEnvelope?.participantIdentities || {};
    const playerAId = identities.A?.participantId;
    const playerBId = identities.B?.participantId;
    const selectedIndex = Math.max(0, Math.min(Number(state.replayGameIndex) || 0, series.games.length - 1));
    updateReplaySeriesSideColors(series.games[selectedIndex], playerAId, playerBId);
    const visibleGames = series.games.slice(0, selectedIndex + 1);
    // A/ B are game-local sides and may be swapped between BO3 games. Prefer
    // the immutable participant identity; only fall back to the local side
    // when a legacy game record does not include winnerParticipantId.
    const winnerParticipantId = game => game?.winnerParticipantId
      ?? (game?.winner === 'A' ? game.participantA : game?.winner === 'B' ? game.participantB : null);
    const scoreA = visibleGames.filter(game => winnerParticipantId(game) === playerAId).length;
    const scoreB = visibleGames.filter(game => winnerParticipantId(game) === playerBId).length;
    const shownScoreA = playerAId ? scoreA : series.winsA;
    const shownScoreB = playerBId ? scoreB : series.winsB;
    updateReplaySeriesScore(shownScoreA, shownScoreB);
    $('#r-result-text').textContent = `${replaySeriesScoreText(series)} · ${replayWinnerLabel(seriesEnvelope)}`;
    $('#r-winner').textContent = replayWinnerLabel(seriesEnvelope);
    $('#r-termination').textContent = `Đã đấu ${series.games.length} ván`;
    const contextNote = $('#replay-context-note'); if (contextNote) contextNote.textContent = `Trận ${series.format?.toUpperCase() || `BO${series.bestOf || 3}`} · Ván ${(Number(state.replayGameIndex) || 0) + 1}/${series.games.length}`;
    const boardTitle = $('#replay-board-title'); if (boardTitle) boardTitle.textContent = `Ván ${selectedIndex + 1} · Diễn biến`;
  } else {
    updateReplaySeriesScore(active.winner === 'A' ? 1 : 0, active.winner === 'B' ? 1 : 0);
    $('#r-result-text').textContent = `${replayResultLabel(active)} · ${formatReplayReason(active.terminationReason)}`;
    $('#r-winner').textContent = replayWinnerLabel(active);
    $('#r-termination').textContent = formatReplayReason(active.terminationReason) || 'Chưa xác định';
    const contextNote = $('#replay-context-note'); if (contextNote) contextNote.textContent = 'Trận BO1';
    const boardTitle = $('#replay-board-title'); if (boardTitle) boardTitle.textContent = 'Ván 1 · Diễn biến';
  }
  $('#r-protocol').textContent = String(active.protocolVersion || 'unknown');
  const statusBadge = $('#replay-status-badge'); if (statusBadge) statusBadge.textContent = 'Đã hoàn thành';
  const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = false;
}

function renderReplaySummaryV2(replay) {
  renderReplaySummaryV2Base(replay);
  const series = replayParentSeries();
  if (!series) return;
  const seriesLabel = series.format?.toUpperCase() || `BO${series.bestOf || 3}`;
  const active = state.replay || replay;
  const title = $('#replay-view-title'); if (title) title.textContent = `Series ${seriesLabel} · Ván ${(Number(state.replayGameIndex) || 0) + 1}`;
  const result = $('#r-result-text'); if (result) result.textContent = `${replaySeriesScoreText(series)} · ${replayWinnerLabel(replayParentSeriesEnvelope())}`;
  const contextNote = $('#replay-context-note'); if (contextNote) contextNote.textContent = `Trận ${seriesLabel} · Ván ${(Number(state.replayGameIndex) || 0) + 1}/${series.games.length}`;
  const boardTitle = $('#replay-board-title'); if (boardTitle) boardTitle.textContent = `Ván ${(Number(state.replayGameIndex) || 0) + 1} · Diễn biến`;
  if (active) $('#r-match-id').textContent = String(replayParentSeriesEnvelope()?.matchId || active.matchId || state.replayMatchId || '—');
}

class PublicReplayTerminalError extends Error {
  constructor(message) { super(message); this.name = 'PublicReplayTerminalError'; this.publicReplayTerminal = true; }
}

class PublicReplayUnavailableError extends Error {
  constructor(message) { super(message); this.name = 'PublicReplayUnavailableError'; this.publicReplayRecoverable = true; }
}

function publicReplayBaseUrl() {
  const configured = typeof window !== 'undefined' ? window.OTT_PUBLIC_REPLAY_BASE_URL : '';
  if (typeof configured !== 'string' || !configured.trim()) return null;
  try {
    const url = new URL(configured, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('invalid public replay base');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    url.search = '';
    return url;
  } catch {
    throw new PublicReplayTerminalError('Cấu hình replay công khai không hợp lệ.');
  }
}

function publicReplaySafeId(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value); }
function publicReplayHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }

function publicReplayUrl(base, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\') || relativePath.includes('%')) {
    throw new PublicReplayTerminalError('Đường dẫn replay công khai không hợp lệ.');
  }
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(relativePath) || relativePath.split('/').some(part => part === '..' || part === '.')) {
    throw new PublicReplayTerminalError('Đường dẫn replay công khai không an toàn.');
  }
  const resolved = new URL(relativePath, base);
  if (resolved.origin !== base.origin || resolved.search || resolved.hash) throw new PublicReplayTerminalError('Đường dẫn replay công khai không an toàn.');
  return resolved;
}

async function publicReplayFetchJson(url, missingMessage) {
  let response;
  try { response = await fetch(url, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } }); }
  catch { throw new PublicReplayUnavailableError('Không thể kết nối kho replay công khai.'); }
  if (response.status === 404) throw new PublicReplayUnavailableError(missingMessage);
  if (!response.ok) throw new PublicReplayTerminalError(`Kho replay công khai trả về lỗi ${response.status}.`);
  let bytes;
  try { bytes = await response.arrayBuffer(); }
  catch { throw new PublicReplayUnavailableError('Không thể đọc dữ liệu replay công khai.'); }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new PublicReplayTerminalError('Dữ liệu replay công khai không hợp lệ.'); }
}

async function publicReplaySha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new PublicReplayTerminalError('Trình duyệt không hỗ trợ kiểm tra toàn vẹn replay.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function publicReplayShapeMatches(replay, requestedMatchId) {
  if (!isReplayShape(replay)) return false;
  if (replay.matchId === requestedMatchId) return true;
  return Array.isArray(replay.series?.games) && replay.series.games.some(game => game?.matchId === requestedMatchId && isReplayShape(game.replay));
}

async function loadPublicReplay(tournamentId, requestedMatchId, seriesContext = null) {
  const base = publicReplayBaseUrl();
  if (!base) return null;
  if (!publicReplaySafeId(tournamentId) || !publicReplaySafeId(requestedMatchId)) throw new PublicReplayTerminalError('Định danh replay công khai không hợp lệ.');
  const manifestUrl = publicReplayUrl(base, `tournaments/${tournamentId}/index.json`);
  const manifest = await publicReplayFetchJson(manifestUrl, 'Không tìm thấy manifest replay công khai.');
  if (!manifest || manifest.schemaVersion !== 1 || manifest.tournamentId !== tournamentId) throw new PublicReplayTerminalError('Manifest replay công khai không hợp lệ.');
  if (manifest.status !== 'published') throw new PublicReplayTerminalError('Replay công khai đã bị thu hồi hoặc chưa được phát hành.');
  if (!Array.isArray(manifest.entries)) throw new PublicReplayTerminalError('Manifest replay công khai không hợp lệ.');
  const aggregateMatchId = publicReplaySafeId(seriesContext?.matchId) ? seriesContext.matchId : requestedMatchId;
  const entry = manifest.entries.find(item => item?.matchId === aggregateMatchId);
  if (!entry || !publicReplaySafeId(entry.matchId) || !publicReplayHash(entry.replayHash) || entry.matchId !== aggregateMatchId) {
    throw new PublicReplayUnavailableError('Không tìm thấy replay công khai cho trận đấu này.');
  }
  const expectedPath = `tournaments/${tournamentId}/matches/${entry.matchId}-${entry.replayHash}.json`;
  if (entry.path !== expectedPath || entry.sha256 !== entry.replayHash) throw new PublicReplayTerminalError('Manifest replay công khai không toàn vẹn.');
  const replayUrl = publicReplayUrl(base, entry.path);
  let response;
  try { response = await fetch(replayUrl, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } }); }
  catch { throw new PublicReplayUnavailableError('Không thể kết nối replay công khai.'); }
  if (response.status === 404) throw new PublicReplayUnavailableError('Không tìm thấy tệp replay công khai.');
  if (!response.ok) throw new PublicReplayTerminalError(`Tệp replay công khai trả về lỗi ${response.status}.`);
  let bytes;
  try { bytes = await response.arrayBuffer(); }
  catch { throw new PublicReplayUnavailableError('Không thể đọc tệp replay công khai.'); }
  if (await publicReplaySha256(bytes) !== entry.replayHash) throw new PublicReplayTerminalError('Replay công khai không vượt qua kiểm tra SHA-256.');
  let replay;
  try { replay = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new PublicReplayTerminalError('JSON replay công khai không hợp lệ.'); }
  if (!publicReplayShapeMatches(replay, requestedMatchId)) throw new PublicReplayTerminalError('Replay công khai không khớp với trận đấu được yêu cầu.');
  return replay;
}

async function loadReplayWithAuthorizedFallback(tournamentId, matchId, seriesContext = null) {
  let publicReplayError = null;
  try {
    const replay = await loadPublicReplay(tournamentId, matchId, seriesContext);
    if (replay) return replay;
  } catch (error) {
    publicReplayError = error;
  }
  // A static export is deliberately public-only.  It must not turn a revoked,
  // corrupt or missing public artifact into an API request just because the
  // embedding page happens to have an application session.
  if (typeof window !== 'undefined' && window.OTT_PUBLIC_REPLAY_STATIC_ONLY) {
    throw publicReplayError || new Error('Replay công khai không khả dụng.');
  }
  if (!await ensureReplaySession()) throw publicReplayError || new Error('Cần đăng nhập để xem replay này.');
  return api(state.spectatorMode
    ? `/tournaments/${tournamentId}/spectator/matches/${matchId}/replay`
    : `/tournaments/${tournamentId}/replays/${matchId}`);
}

function replayPieceSideMap() {
  const series = replayParentSeries();
  const identities = replayParentSeriesEnvelope()?.participantIdentities || {};
  const selectedGame = series?.games?.[Math.max(0, Number(state.replayGameIndex) || 0)];
  if (!selectedGame || !identities.A?.participantId || !identities.B?.participantId) {
    return { A: 'A', B: 'B' };
  }
  return {
    A: selectedGame.participantA === identities.A.participantId ? 'A' : 'B',
    B: selectedGame.participantA === identities.B.participantId ? 'A' : 'B',
  };
}

function renderReplayPieceCounts(board, sideMap = replayPieceSideMap()) {
  const labels = { dam: 'B\u00faa', la: 'Bao', keo: 'K\u00e9o' };
  ['A', 'B'].forEach(fixedSide => {
    const boardSide = sideMap[fixedSide] || fixedSide;
    const counts = { dam: 0, la: 0, keo: 0 };
    board.pieces.filter(piece => piece.player === boardSide).forEach(piece => {
      if (Object.hasOwn(counts, piece.type)) counts[piece.type] += 1;
    });
    const target = $(`#r-p${fixedSide === 'A' ? '1' : '2'}-pieces`);
    if (!target) return;
    target.replaceChildren();
    Object.entries(labels).forEach(([type, label], index) => {
      const item = create('span', {
        className: 'replay-piece-count',
        attrs: { 'aria-label': `${label} ${counts[type]}` },
      });
      const pieceIcon = icon(PIECE_TYPES[type]);
      pieceIcon.classList.add('replay-count-icon');
      pieceIcon.setAttribute('aria-hidden', 'true');
      item.append(pieceIcon, create('span', { className: 'replay-count-value', text: `×${counts[type]}` }));
      target.append(item);
      if (index < Object.keys(labels).length - 1) target.append(create('span', { className: 'replay-piece-count-separator', text: '·', attrs: { 'aria-hidden': 'true' } }));
    });
  });
}

async function playReplay(tournamentId, matchId, seriesContext = null) {
  closeModal('tiebreaker-resolution-modal');
  stopReplayPlayback();
  stopLiveMatchPolling();
  $('#replay-view').classList.remove('live-match-view');
  $('#replay-view-kicker').textContent = 'XEM LẠI TRẬN ĐẤU';
  setReplayBackLabel('Quay lại chi tiết giải đấu');
  state.tournamentId = tournamentId;
  const authRevision = state.authRevision;
  const sourceViewRevision = state.viewRevision;
  const replayRevision = ++state.replayRevision;
  state.replayContext = { tournamentId, matchId, authRevision, sourceViewRevision, seriesContext };
  state.replay = null;
  state.replaySeries = null;
  state.replayMatchId = matchId;
  state.replayMoveIndex = -1;
  renderReplaySeriesControls(null);
  $('#replay-error').hidden = true;
  setReplayLoading(true);
  navigate('replay-view');
  const replayViewRevision = state.viewRevision;
  let replay;
  try {
    replay = await loadReplayWithAuthorizedFallback(tournamentId, matchId, seriesContext);
    if (!isReplayShape(replay)) throw new Error('Dữ liệu xem lại không hợp lệ.');
    if (replay.series && !availableSeriesReplayIndexes(replay).length) throw new Error('Series không có ván nào có dữ liệu xem lại hợp lệ.');
  }
  catch (error) {
    if (state.authRevision === authRevision && state.replayRevision === replayRevision && state.activeView === 'replay-view'
      && state.replayContext?.tournamentId === tournamentId && state.replayContext?.matchId === matchId) {
      setReplayLoading(false);
      $('#replay-content').hidden = true;
      const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = true;
      $('#replay-error-message').textContent = error.message || 'Không thể tải dữ liệu xem lại.';
      $('#replay-error').hidden = false;
    }
    return;
  }
  const staticReplayOnly = typeof window !== 'undefined' && window.OTT_PUBLIC_REPLAY_STATIC_ONLY === true;
  if ((!state.user && !staticReplayOnly) || state.authRevision !== authRevision || state.replayRevision !== replayRevision
    || state.activeView !== 'replay-view' || state.viewRevision !== replayViewRevision
    || state.tournamentId !== tournamentId || state.replayContext?.matchId !== matchId) return;
  state.replay = replay;
  state.replaySeries = replay.series ? replay : null;
  const availableIndexes = availableSeriesReplayIndexes(replay);
  const requestedGameNumber = seriesContext?.games?.find(game => game.matchId === matchId)?.gameNumber;
  const requestedGameIndex = replay.series?.games?.findIndex(game => game.matchId === matchId
    || (requestedGameNumber !== undefined && Number(game.gameNumber) === Number(requestedGameNumber))) ?? -1;
  state.replayGameIndex = availableIndexes.includes(requestedGameIndex)
    ? requestedGameIndex
    : (availableIndexes[0] ?? 0);
  if (state.replaySeries?.series?.games?.[state.replayGameIndex]?.replay) state.replay = state.replaySeries.series.games[state.replayGameIndex].replay;
  state.replayContext.replayViewRevision = replayViewRevision;
  renderReplaySeriesControls(replay);
  renderReplaySummaryV2(replay);
  setReplayLoading(false);
  goToReplayTurn(-1);
}

function retryReplay() {
  if (!state.replayContext) return;
  void playReplay(state.replayContext.tournamentId, state.replayContext.matchId, state.replayContext.seriesContext || null);
}

function buildStateAt(moveIndex) {
  if (!state.replay || !state.replay.initialState || !Array.isArray(state.replay.initialState.pieces)) return null;
  const board = { ...state.replay.initialState, pieces: state.replay.initialState.pieces.map(piece => ({ ...piece })) };
  for (let index = 0; index <= moveIndex; index += 1) {
    const move = state.replay.moves[index]; if (!move) continue;
    const piece = board.pieces.find(candidate => candidate.id === move.pieceId);
    if (!piece || !move.to) continue;
    if (move.captures) {
      const captured = board.pieces.find(candidate => candidate.id === move.captures);
      if (captured && state.replay.ruleModifiers?.conversion) {
        captured.player = move.player;
        captured.row = piece.row;
        captured.col = piece.col;
      } else {
        board.pieces = board.pieces.filter(candidate => candidate.id !== move.captures);
      }
    }
    piece.row = move.to.row; piece.col = move.to.col;
    board.currentPlayer = move.player === 'A' ? 'B' : 'A';
    board.turn = Number(move.turn) + 1;
  }
  return board;
}

function renderReplayBoard(board, liveMove = null) {
  const element = $('#r-board'); clear(element);
  const lastMove = liveMove || (state.replayMoveIndex >= 0 ? state.replay.moves[state.replayMoveIndex] : null);
  const previousBoard = state.replayMoveIndex > 0 ? buildStateAt(state.replayMoveIndex - 1) : state.replay?.initialState;
  const capturedPiece = lastMove?.captures && previousBoard?.pieces?.find(piece => piece.id === lastMove.captures);
  const boardSize = Number(board.boardSize) === 9 ? 9 : 0;
  if (!boardSize) {
    element.appendChild(create('p', { className: 'ui-message', text: 'Bản xem lại này có kích thước bàn cờ không được hỗ trợ.' }));
    return;
  }
  const columns = 'abcdefghi';
  for (let row = 0; row < boardSize; row += 1) for (let col = 0; col < boardSize; col += 1) {
    const coordinate = `${columns[col]}${row + 1}`;
    const cell = create('div', { className: 'replay-cell', attrs: { role: 'gridcell', 'aria-label': `${coordinate}, ô trống` } });
    if (lastMove?.pieceId && lastMove.from?.row === row && lastMove.from?.col === col) cell.classList.add('move-from');
    if (lastMove?.pieceId && lastMove.to?.row === row && lastMove.to?.col === col) cell.classList.add('move-to');
    if (capturedPiece?.row === row && capturedPiece?.col === col) cell.classList.add('capture');
    const goal = row === 0 && col === 0
      ? 'Mục tiêu của người chơi B'
      : row === 8 && col === 8 ? 'Mục tiêu của người chơi A' : '';
    if (goal) {
      cell.classList.add('goal');
      cell.setAttribute('aria-label', `${coordinate}, ${goal}, ô trống`);
    }
    const piece = board.pieces.find(candidate => candidate.row === row && candidate.col === col);
    if (piece) {
      const isPlayerA = piece.player === 'A';
      const isGoalReached = (row === 8 && col === 8 && isPlayerA) || (row === 0 && col === 0 && !isPlayerA);
      if (isGoalReached) {
        cell.classList.add('goal-reached', 'victory-cell');
      }
      const label = `Người chơi ${piece.player}, ${PIECE_LABELS[piece.type] || piece.type}${isGoalReached ? ' (ĐẠT Ô ĐÍCH CHIẾN THẮNG)' : ''}`;
      const token = create('span', { className: `replay-piece replay-player-${piece.player.toLowerCase()}${isGoalReached ? ' victory-piece' : ''}`, attrs: { 'aria-label': label, title: label } });
      const symbolId = PIECE_TYPES[piece.type];
      if (symbolId) token.appendChild(icon(symbolId));
      else token.textContent = '?';
      cell.setAttribute('aria-label', `${coordinate}, ${goal ? `${goal}, ` : ''}${label}`);
      cell.appendChild(token);
    }
    element.appendChild(cell);
  }
}

function getReplayWinningParticipantSlot() {
  const replay = state.replay;
  if (!replay) return null;
  const matchWinner = replay.winner;
  if (matchWinner !== 'A' && matchWinner !== 'B') return null;

  // Case 1: BO3 Series Game
  if (state.replaySeries?.series?.games) {
    const series = state.replaySeries.series;
    const selectedIndex = Math.max(0, Math.min(Number(state.replayGameIndex) || 0, series.games.length - 1));
    const currentGame = series.games[selectedIndex];
    const identities = state.replaySeries.participantIdentities || {};
    const playerAId = identities.A?.participantId;
    const playerBId = identities.B?.participantId;

    if (currentGame) {
      const winnerId = currentGame.winnerParticipantId || (
        currentGame.winner === 'A' ? currentGame.participantA :
        currentGame.winner === 'B' ? currentGame.participantB : null
      );
      if (winnerId && playerAId && winnerId === playerAId) return 'A';
      if (winnerId && playerBId && winnerId === playerBId) return 'B';
    }
  }

  // Case 2: Swapped side classes on participant labels
  const playerAEl = document.querySelector('#replay-view .replay-player-a-label');
  const playerBEl = document.querySelector('#replay-view .replay-player-b-label');
  if (playerAEl && playerBEl) {
    if (playerAEl.classList.contains('is-current-side-b')) {
      return matchWinner === 'B' ? 'A' : 'B';
    }
    if (playerAEl.classList.contains('is-current-side-a')) {
      return matchWinner === 'A' ? 'A' : 'B';
    }
  }

  // Case 3: Standard BO1 / Practice matches
  return matchWinner === 'A' ? 'A' : 'B';
}

function goToReplayTurn(index) {
  if (!state.replay || state.activeView !== 'replay-view') return;
  state.replayMoveIndex = Math.max(-1, Math.min(index, state.replay.moves.length - 1));
  $('#r-turn-display').textContent = `${Math.max(0, state.replayMoveIndex + 1)} / ${state.replay.moves.length} lượt`;
  const scrubber = $('#replay-scrubber');
  if (scrubber) scrubber.value = String(state.replayMoveIndex);
  const board = buildStateAt(state.replayMoveIndex);
  if (board) { renderReplayBoard(board); renderReplayPieceCounts(board); }
  renderReplayTimeline();
  const move = state.replayMoveIndex >= 0 ? state.replay.moves[state.replayMoveIndex] : null;
  $('#btn-replay-start').disabled = state.replayMoveIndex < 0;
  $('#btn-replay-prev').disabled = state.replayMoveIndex < 0;
  $('#btn-replay-next').disabled = state.replayMoveIndex >= state.replay.moves.length - 1;
  $('#btn-replay-end').disabled = state.replayMoveIndex >= state.replay.moves.length - 1;
  const selected = $('#r-selected-move');
  if (selected) selected.textContent = move?.pieceId
    ? `Move ${move.turn} · Player ${move.player}: ${replayCoordinate(move.from)} → ${replayCoordinate(move.to)}`
    : state.replayMoveIndex < 0 ? 'Initial position' : 'No applied move at this position';
  const currentMove = $('#r-current-move');
  currentMove?.classList.toggle('replay-current-move-a', move?.player === 'A');
  currentMove?.classList.toggle('replay-current-move-b', move?.player === 'B');
  const totalMoves = state.replay?.moves?.length || 0;
  const isFinalMove = totalMoves === 0 ? true : (state.replayMoveIndex >= totalMoves - 1 && state.replayMoveIndex >= 0);
  const matchWinner = state.replay?.winner;
  const isDecidedMatch = isFinalMove && (matchWinner === 'A' || matchWinner === 'B');
  currentMove?.classList.toggle('is-victory-announcement', isDecidedMatch);

  // Update winner visual states on participant cards (A = left card / Player 1, B = right card / Player 2)
  const winningSlot = isDecidedMatch ? getReplayWinningParticipantSlot() : null;
  document.querySelector('#replay-view .replay-player-a-label')?.classList.toggle('is-winner', winningSlot === 'A');
  document.querySelector('#replay-view .replay-player-b-label')?.classList.toggle('is-winner', winningSlot === 'B');

  if (isDecidedMatch) {
    const winningCardName = winningSlot === 'A'
      ? document.querySelector('#replay-view #r-p1-name')?.textContent?.trim()
      : winningSlot === 'B'
        ? document.querySelector('#replay-view #r-p2-name')?.textContent?.trim()
        : '';
    const rawWinner = replayWinnerLabel(state.replay);
    const cleanWinner = winningCardName || (rawWinner.endsWith(' chiến thắng') ? rawWinner.slice(0, -' chiến thắng'.length) : rawWinner);
    const reason = formatReplayReason(state.replay.terminationReason) || 'Chiến thắng';
    currentMove.textContent = `🏆 CHIẾN THẮNG: ${cleanWinner} (${reason})`;
  } else {
    currentMove.textContent = move?.pieceId
      ? `Lượt ${move.turn} · ${replayHistoryPlayerName(move.player)}: ${replayCoordinate(move.from)} → ${replayCoordinate(move.to)}`
      : state.replayMoveIndex >= 0 ? `Lượt ${move.turn} · ${replayHistoryPlayerName(move.player)}: không có nước đi được áp dụng` : 'Vị trí ban đầu';
  }
}

  if (false) {
    const selected = $('#r-selected-move');
  if (selected) selected.textContent = move?.pieceId ? $('#r-current-move').textContent : state.replayMoveIndex < 0 ? 'Vị trí ban đầu' : 'Không có nước đi được áp dụng';
}

function setupReplayCoordinates() {
  const header = $('#coord-header'); const side = $('#coord-side'); clear(header); clear(side);
  'abcdefghi'.split('').forEach(column => header.appendChild(create('span', { className: 'coord', text: column, attrs: { 'aria-hidden': 'true' } })));
  Array.from({ length: 9 }, (_, index) => index + 1).forEach(row => side.appendChild(create('span', { className: 'coord', text: row, attrs: { 'aria-hidden': 'true' } })));
}

function replayCoordinate(position) { return position ? `${'abcdefghi'[position.col] || '?'}${Number(position.row) + 1}` : '?'; }
function replayHistoryPlayerName(player) {
  const identity = state.replay?.participantIdentities?.[player];
  if (identity?.participantName) return identity.participantName;
  const name = $(`#r-p${player === 'A' ? '1' : '2'}-name`)?.textContent?.trim();
  return name || `Người chơi ${player}`;
}
function renderReplayTimeline() {
  const list = $('#replay-timeline'); clear(list);
  const moves = state.replay?.moves || [];
  const historyTitle = $('#replay-history-title'); if (historyTitle) historyTitle.textContent = 'Lịch sử nước đi';
  const historyCount = $('#replay-history-count'); if (historyCount) historyCount.textContent = `${moves.length} lượt`;
  if (!state.replay?.moves.length) { list.appendChild(create('p', { className: 'ui-message', text: 'Chưa có nước đi nào được ghi nhận cho trận đấu này.' })); return; }
  state.replay.moves.forEach((move, index) => {
    const item = actionButton('', () => { stopReplayPlayback(); goToReplayTurn(index); }, `replay-seek:${index}`, 'replay-move');
    item.classList.toggle('active', index === state.replayMoveIndex);
    const applied = Boolean(move.pieceId);
    item.classList.toggle('replay-move-unapplied', !applied);
    const playerName = replayHistoryPlayerName(move.player);
    const side = String(move.player || '').toLowerCase();
    item.classList.add(`replay-move-side-${side}`);
    const label = applied ? `Lượt ${move.turn} · ${playerName}: ${replayCoordinate(move.from)} → ${replayCoordinate(move.to)}${move.captures ? ' · ăn quân' : ''}` : `Lượt ${move.turn} · ${playerName}: không có nước đi được áp dụng`;
    item.setAttribute('aria-label', label);
    item.setAttribute('aria-current', index === state.replayMoveIndex ? 'step' : 'false');
    const number = create('span', { className: 'replay-move-number', text: `#${index + 1}` });
    const player = create('span', { className: `replay-move-player replay-move-player-${side}`, text: playerName });
    const path = create('span', { className: 'replay-move-path', text: applied ? `${replayCoordinate(move.from)} → ${replayCoordinate(move.to)}${move.captures ? ' · Ăn quân' : ''}` : 'Không có nước đi được áp dụng' });
    item.append(number, player, path);
    list.appendChild(item);
  });
  const active = list.querySelector('.replay-move.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function toggleReplayPlayback() {
  if (!state.replay || state.activeView !== 'replay-view') return;
  if (state.replayPlaybackActive) return stopReplayPlayback();
  if (state.replayTimer) return stopReplayPlayback();
  if (state.replayMoveIndex >= state.replay.moves.length - 1) goToReplayTurn(-1);
  const token = (state.replayPlaybackToken || 0) + 1;
  state.replayPlaybackToken = token;
  state.replayPlaybackActive = true;
  const replayId = state.replayMatchId;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const tick = () => {
    const isPracticeReplay = state.replayContext?.practice === true;
    if (state.replayPlaybackToken !== token || !state.replay || state.replayMatchId !== replayId
      || (!isPracticeReplay && state.replayContext?.tournamentId !== state.tournamentId)
      || !isCurrentView('replay-view', authRevision, viewRevision) || state.replayMoveIndex >= state.replay.moves.length - 1) {
    if (state.replayPlaybackToken === token) stopReplayPlayback();
      return;
    }
    goToReplayTurn(state.replayMoveIndex + 1);
    state.replayTimer = setTimeout(tick, state.replaySpeed);
  };
  const playButton = $('#btn-replay-play');
  const playLabel = playButton?.querySelector('.replay-control-label'); if (playLabel) playLabel.textContent = 'Tạm dừng';
  const pauseIcon = playButton?.querySelector('use'); if (pauseIcon) pauseIcon.setAttribute('href', '#icon-pause');
  if (playButton) { playButton.setAttribute('aria-label', 'Tạm dừng'); playButton.setAttribute('title', 'Tạm dừng'); }
  $('#btn-replay-play').setAttribute('aria-pressed', 'true');
  state.replayTimer = setTimeout(tick, state.replaySpeed);
}

