function stopLiveMatchPolling() {
  state.liveTransitionToken += 1;
  if (state.liveMatchPollingTimer) clearTimeout(state.liveMatchPollingTimer);
  state.liveMatchPollingTimer = null;
  if (state.liveStreamSource) state.liveStreamSource.close();
  state.liveStreamSource = null;
  state.liveStreamMode = false;
  state.livePollBackoffMs = 0;
  state.liveMatchContext = null;
  state.liveMatchSnapshot = null;
  document.querySelector('#replay-view .replay-player-a-label')?.classList.remove('is-winner');
  document.querySelector('#replay-view .replay-player-b-label')?.classList.remove('is-winner');
  state.liveMatchStartedGames.clear();
  state.liveLatestSnapshot = null;
  state.liveHistoryGame = null;
  state.liveHistory = [];
  state.liveHistoryIndex = 0;
  state.liveHistoryQueue = [];
  state.liveLastSequence = 0;
  state.liveAcceptedSnapshot = null;
  if (state.liveTransitionTimer) clearTimeout(state.liveTransitionTimer);
  state.liveTransitionTimer = null;
  state.livePendingSnapshot = null;
  hideLiveGameResultModal();
  if (state.liveHistoryTimer) clearTimeout(state.liveHistoryTimer);
  state.liveHistoryTimer = null;
  $('#replay-view')?.classList.remove('live-match-view');
}

function showLiveGameResultModal(snapshot, completedGame = null) {
  const series = snapshot.series;
  if (snapshot.status !== 'finished' && snapshot.status !== 'completed') return;
  if (snapshot.status === 'finished' && series?.active) {
    const gameNumber = Number(completedGame || series.currentGame || snapshot.gameNumber || 1);
    const confirmedWins = Number(series.winsA ?? 0) + Number(series.winsB ?? 0);
    if (confirmedWins < gameNumber) {
      hideLiveGameResultModal();
      return;
    }
  }
  const game = completedGame || series.currentGame || snapshot.gameNumber || 1;
  // BO3 sides can swap between games. The modal must show the series score
  // against the fixed competitors, not the temporary A/B sides of the game
  // that just ended.
  const participants = snapshot.participants || {};
  const fixedA = series?.competitorA || series?.competitorX || participants.A;
  const fixedB = series?.competitorB || series?.competitorY || participants.B;
  const participantFor = (competitor, fallback) => {
    if (!competitor?.participantId) return fallback;
    return Object.values(participants).find(item => item?.participantId === competitor.participantId) || fallback;
  };
  const playerA = participantFor(fixedA, participants.A);
  const playerB = participantFor(fixedB, participants.B);
  const title = $('#live-game-result-title');
  const score = $('#live-game-result-score');
  const next = $('#live-game-result-next');
  const transition = Boolean(series?.active);
  if (title) title.textContent = transition ? `Ván ${game} đã kết thúc` : 'Trận đấu đã kết thúc';
  if (score) score.textContent = series ? `Tỷ số ${series.winsA ?? 0}-${series.winsB ?? 0}` : 'Kết quả đã được ghi nhận';
  const nextGame = series?.nextGame || (series && Number(game) < Number(series.bestOf || 3) ? Number(game) + 1 : null);
  const currentParticipants = snapshot.currentParticipants || snapshot.participants || {};
  const seriesDecidedWinner = (series?.winner === 'A' || series?.winner === 'B' || series?.winner === 'draw')
    ? series.winner
    : (series && typeof series.winsA === 'number' && typeof series.winsB === 'number' && (!series.active || series.winsA >= 2 || series.winsB >= 2)
      ? (series.winsA > series.winsB ? 'A' : series.winsB > series.winsA ? 'B' : (series.winsA === series.winsB && !series.active ? 'draw' : null))
      : null);
  const winnerSide = transition
    ? snapshot.winner
    : (seriesDecidedWinner || (series ? null : snapshot.winner));
  const winnerParticipants = transition ? currentParticipants : (snapshot.participants || currentParticipants);
  const winnerName = winnerSide && winnerSide !== 'draw'
    ? (winnerSide === 'A' ? (playerA?.participantName || fixedA?.participantName || fixedA?.name || winnerParticipants?.A?.participantName)
      : winnerSide === 'B' ? (playerB?.participantName || fixedB?.participantName || fixedB?.name || winnerParticipants?.B?.participantName)
      : (winnerParticipants?.[winnerSide]?.participantName || null))
    : null;
  const setText = (selector, value) => { const element = $(selector); if (element) element.textContent = value || '—'; };
  setText('#live-game-player-a', fixedA?.participantName || fixedA?.name);
  setText('#live-game-player-b', fixedB?.participantName || fixedB?.name);
  setText('#live-game-bot-a', playerA?.botName ? `Bot · ${playerA.botName}` : 'Đội A');
  setText('#live-game-bot-b', playerB?.botName ? `Bot · ${playerB.botName}` : 'Đội B');
  setText('#live-game-score-a', series ? String(series.winsA ?? 0) : '—');
  setText('#live-game-score-b', series ? String(series.winsB ?? 0) : '—');
  const scoreA = $('#live-game-score-a');
  const scoreB = $('#live-game-score-b');
  scoreA?.classList.toggle('is-leading', Boolean(series && (series.winsA ?? 0) > (series.winsB ?? 0)));
  scoreB?.classList.toggle('is-leading', Boolean(series && (series.winsB ?? 0) > (series.winsA ?? 0)));
  const winnerLabel = $('#live-game-result-winner');
  if (winnerLabel) winnerLabel.textContent = transition
    ? 'Kết quả ván đã được ghi nhận'
    : (winnerSide === 'draw' ? 'Trận đấu kết thúc với kết quả hòa' : (winnerName ? `${winnerName} chiến thắng` : 'Kết quả đã được ghi nhận'));
  if (next) next.textContent = transition
    ? (nextGame ? `Đang chuẩn bị Ván ${nextGame}` : 'Đang chuẩn bị ván tiếp theo')
    : (winnerSide === 'draw' ? 'Trận đấu kết thúc với kết quả hòa' : (winnerName ? `${winnerName} chiến thắng` : 'Kết quả đã được ghi nhận'));
  const close = $('#live-game-result-close');
  if (close) close.hidden = transition;
  const modal = $('#live-game-result-modal');
  if (modal) {
    modal.classList.add('is-visible');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function hideLiveGameResultModal() {
  const modal = $('#live-game-result-modal');
  if (modal) {
    modal.classList.remove('is-visible');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function closeLiveGameResultModal() {
  hideLiveGameResultModal();
}

function replayParticipantName(participants, player) {
  return participants?.[player]?.participantName || (player ? `Người chơi ${player}` : 'Người chơi');
}

function replayMovePlayer(move) {
  if (move?.player === 'A' || move?.player === 'B') return move.player;
  if (typeof move?.pieceId === 'string' && move.pieceId.startsWith('A-')) return 'A';
  if (typeof move?.pieceId === 'string' && move.pieceId.startsWith('B-')) return 'B';
  return null;
}

function updateReplayTurnHighlight(player) {
  document.querySelector('#replay-view .replay-player-a-label')?.classList.toggle('is-turn', player === 'A');
  document.querySelector('#replay-view .replay-player-b-label')?.classList.toggle('is-turn', player === 'B');
}

function updateReplaySeriesScore(winsA = 0, winsB = 0) {
  const scoreA = $('#r-p1-score');
  const scoreB = $('#r-p2-score');
  if (scoreA) scoreA.textContent = String(winsA);
  if (scoreB) scoreB.textContent = String(winsB);
  document.querySelector('#replay-view .replay-player-a-label')?.classList.toggle('is-leading', Number(winsA) > Number(winsB));
  document.querySelector('#replay-view .replay-player-b-label')?.classList.toggle('is-leading', Number(winsB) > Number(winsA));
}

function updateReplaySeriesSideColors(game, fixedAId, fixedBId) {
  const playerA = document.querySelector('#replay-view .replay-series-card .replay-player-a-label');
  const playerB = document.querySelector('#replay-view .replay-series-card .replay-player-b-label');
  if (!playerA || !playerB || !game) return;
  const fixedAIsSideA = game.participantA === fixedAId;
  const fixedBIsSideA = game.participantA === fixedBId;
  playerA.classList.toggle('is-current-side-a', fixedAIsSideA);
  playerA.classList.toggle('is-current-side-b', !fixedAIsSideA);
  playerB.classList.toggle('is-current-side-a', fixedBIsSideA);
  playerB.classList.toggle('is-current-side-b', !fixedBIsSideA);
}

function renderLiveMatchSnapshot(snapshot) {
  const statusText = snapshot.status === 'in_progress'
    ? `Đang thực thi · Lượt ${snapshot.turn}`
    : snapshot.status === 'finished' || snapshot.status === 'completed' ? 'Trận đấu đã hoàn tất' : snapshot.status === 'failed' ? 'Trận đấu lỗi' : 'Trận đấu đã hủy';
  const series = snapshot.series;
  if (snapshot.status === 'finished' || snapshot.status === 'completed') showLiveGameResultModal(snapshot);
  else if (snapshot.status === 'in_progress') hideLiveGameResultModal();
  const gameText = series ? `Ván ${series.currentGame}/${series.bestOf}` : 'Ván 1';
  const statusBadge = $('#replay-status-badge');
  if (statusBadge) statusBadge.textContent = snapshot.status === 'in_progress' ? 'Đang diễn ra' : snapshot.status === 'failed' ? 'Thất bại' : 'Đã hoàn thành';
  const contextNote = $('#replay-context-note');
  if (contextNote) contextNote.textContent = series ? `Trận BO${series.bestOf} · ${gameText}` : 'Trận BO1';
  const boardTitle = $('#replay-board-title');
  if (boardTitle) boardTitle.textContent = `${gameText} · Diễn biến`;
  const scoreText = series
    ? `${series.active ? 'Tỷ số hiện tại' : 'Tỷ số'} ${series.winsA}-${series.winsB}`
    : 'Tỷ số 0-0';
  const resultText = $('#r-result-text'); if (resultText) resultText.textContent = `${gameText} · ${scoreText} · ${statusText}${snapshot.error ? ` · ${snapshot.error}` : ''}`;
  const matchId = $('#r-match-id'); if (matchId) matchId.textContent = String(snapshot.matchId || '—');
  const winner = $('#r-winner'); if (winner) winner.textContent = snapshot.status === 'in_progress' ? 'Chưa có' : snapshot.status === 'failed' ? 'Không xác định' : 'Đang cập nhật';
  const termination = $('#r-termination'); if (termination) termination.textContent = snapshot.error || (snapshot.status === 'in_progress' ? 'Đang thực thi' : 'Đã kết thúc');
  const protocol = $('#r-protocol'); if (protocol) protocol.textContent = 'Dữ liệu trực tiếp';
  const participants = snapshot.participants || {};
  const currentParticipants = snapshot.currentParticipants || participants;
  const latestMove = snapshot.state?.lastMove || snapshot.latestMove;
  const latestMovePlayer = replayMovePlayer(latestMove);
  const activePlayer = snapshot.currentPlayer;
  const fixedAId = participants.A?.participantId;
  const fixedBId = participants.B?.participantId;
  const currentSideAId = currentParticipants.A?.participantId;
  const currentSideBId = currentParticipants.B?.participantId;
  updateReplaySeriesSideColors(
    { participantA: currentSideAId, participantB: currentSideBId },
    fixedAId,
    fixedBId,
  );
  const activeParticipantId = activePlayer === 'A' ? currentSideAId : currentSideBId;
  const fixedActivePlayer = activeParticipantId === fixedAId ? 'A' : activeParticipantId === fixedBId ? 'B' : activePlayer;
  const currentMove = $('#r-current-move'); if (currentMove) currentMove.textContent = latestMove?.pieceId
    ? `Lượt ${latestMove.turn ?? snapshot.turn} · ${replayParticipantName(currentParticipants, latestMovePlayer)}: ${replayCoordinate(latestMove.from)} → ${replayCoordinate(latestMove.to)}`
    : `Lượt ${snapshot.turn} · ${replayParticipantName(currentParticipants, snapshot.currentPlayer)} đang thực thi`;
  const latestParticipantId = latestMovePlayer === 'A' ? currentSideAId : latestMovePlayer === 'B' ? currentSideBId : null;
  // The move highlight follows the army that made the move in this game,
  // while the header identity remains fixed to the series competitor.
  currentMove?.classList.toggle('replay-current-move-a', latestMovePlayer === 'A');
  currentMove?.classList.toggle('replay-current-move-b', latestMovePlayer === 'B');
  const selected = $('#r-selected-move'); if (selected) selected.textContent = currentMove?.textContent || statusText;
  const turnDisplay = $('#r-turn-display'); if (turnDisplay) turnDisplay.textContent = `Lượt ${snapshot.turn}`;
  $('#r-p1-name').textContent = replayParticipantName(participants, 'A');
  $('#r-p2-name').textContent = replayParticipantName(participants, 'B');
  $('#r-p1-bot').textContent = participants.A?.botId ? `Bot ${shortId(participants.A.botId)}` : '';
  $('#r-p2-bot').textContent = participants.B?.botId ? `Bot ${shortId(participants.B.botId)}` : '';
  updateReplaySeriesScore(series?.winsA ?? 0, series?.winsB ?? 0);
  updateReplayTurnHighlight(fixedActivePlayer);
  $('#replay-content').hidden = false;
  const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = false;
  $('#replay-loading').hidden = true;
  $('#replay-error').hidden = true;
  renderReplayBoard(snapshot.state, latestMove);
  renderReplayPieceCounts(snapshot.state, {
    A: currentSideAId === fixedAId ? 'A' : 'B',
    B: currentSideBId === fixedAId ? 'A' : 'B',
  });
  if (series?.active && snapshot.status === 'finished') {
    const transition = $('#r-result-text');
    if (transition) transition.textContent = `Ván ${series.currentGame}/${series.bestOf} · Tỷ số ${series.winsA}-${series.winsB} · Đang chuyển sang Ván ${series.nextGame}`;
  }
}

function playLiveHistoryFrame() {
  const latest = state.liveLatestSnapshot;
  if (!latest || state.activeView !== 'replay-view') return;
  const frame = state.liveHistoryQueue.shift();
  const hasMove = Boolean(frame?.state?.lastMove || frame?.latestMove);
  if (frame) {
    renderLiveMatchSnapshot({
      ...latest,
      ...frame,
      series: latest.series,
      participants: latest.participants,
      // A history frame belongs to its own game. BO3 may swap sides between
      // games, so never reuse the latest game's side mapping for an older
      // frame; doing so labels a move with the wrong Bot name.
      currentParticipants: frame.currentParticipants || latest.currentParticipants,
      history: latest.history,
    });
    state.liveLastSequence = Math.max(state.liveLastSequence, Number(frame.sequence) || 0);
  }
  // Give each actual move enough time to be readable instead of flashing
  // through several turns when the live endpoint returns a burst of snapshots.
  state.liveHistoryTimer = state.liveHistoryQueue.length
    ? setTimeout(playLiveHistoryFrame, hasMove ? 900 : 800)
    : null;
  if (!state.liveHistoryTimer && state.livePendingSnapshot && !state.liveTransitionTimer) {
    const pending = state.livePendingSnapshot;
    const completedGame = state.liveHistoryGame;
    state.livePendingSnapshot = null;
    showLiveGameResultModal({ ...pending, status: 'finished' }, completedGame);
    const transitionToken = state.liveTransitionToken;
    state.liveTransitionTimer = setTimeout(() => {
      if (transitionToken !== state.liveTransitionToken || state.activeView !== 'replay-view') return;
      state.liveTransitionTimer = null;
      hideLiveGameResultModal();
      updateLiveHistory(pending);
    }, 300);
  }
}

function updateLiveHistory(snapshot) {
  // Series progress is authoritative during BO3 transitions. A completed
  // game snapshot may still be attached to the response while game 2/3 is
  // already active, so do not let the old frame pin the viewer to game 1.
  const game = snapshot.series?.currentGame || snapshot.gameNumber || 1;
  const currentGame = state.liveHistoryGame === null ? null : Number(state.liveHistoryGame);
  const incomingSequence = Number(snapshot.sequence) || 0;
  const lastSequence = Number(state.liveLastSequence) || 0;
  const previousAccepted = state.liveAcceptedSnapshot;
  const sameFrame = previousAccepted
    && Number(previousAccepted.gameNumber ?? previousAccepted.series?.currentGame ?? 1) === Number(game)
    && Number(previousAccepted.sequence) === incomingSequence
    && JSON.stringify(previousAccepted) === JSON.stringify(snapshot);
  const sameSequenceLifecycleUpdate = currentGame !== null && game === currentGame && incomingSequence === lastSequence && !sameFrame;
  if (currentGame !== null && (game < currentGame || (game === currentGame && incomingSequence < lastSequence))) return;
  if (sameFrame) return;
  state.liveAcceptedSnapshot = snapshot;
  if (snapshot.status === 'in_progress' && state.liveHistoryGame !== null && game > state.liveHistoryGame) {
    hideLiveGameResultModal();
  }
  const history = (snapshot.history || [])
    .filter(frame => (frame.gameNumber || 1) === game)
    .sort((left, right) => left.sequence - right.sequence);
  if (state.liveStreamMode) {
    state.liveHistoryGame = game;
    state.liveHistory = history;
    state.liveHistoryIndex = history.length;
    state.liveHistoryQueue = [];
    state.liveLastSequence = Number(snapshot.sequence) || Number(history.at(-1)?.sequence) || 0;
    if (state.liveHistoryTimer) clearTimeout(state.liveHistoryTimer);
    state.liveHistoryTimer = null;
    renderLiveMatchSnapshot(snapshot);
    return;
  }
  if (state.liveHistoryGame !== null && game > state.liveHistoryGame
    && (state.liveHistoryQueue.length || state.liveHistoryTimer)) {
    state.livePendingSnapshot = snapshot;
    return;
  }
  // Live view must open at the current snapshot. Replaying history from
  // turn one belongs to the explicit replay view, not to live spectating.
  if (state.liveHistoryGame !== game) {
    const previousGame = state.liveHistoryGame;
    state.liveHistoryGame = game;
    state.liveHistory = history;
    state.liveHistoryIndex = history.length;
    state.liveHistoryQueue = [];
    state.liveLastSequence = Number(snapshot.sequence) || Number(history.at(-1)?.sequence) || 0;
    if (state.liveHistoryTimer) clearTimeout(state.liveHistoryTimer);
    state.liveHistoryTimer = null;
    if (previousGame !== null && game > previousGame) {
      if (state.liveTransitionTimer) clearTimeout(state.liveTransitionTimer);
      state.livePendingSnapshot = snapshot;
      const resultText = $('#r-result-text');
      if (resultText) resultText.textContent = `Ván ${previousGame} hoàn tất · Tỷ số ${snapshot.series?.winsA ?? 0}-${snapshot.series?.winsB ?? 0} · Đang chuyển sang Ván ${game}`;
      const transitionToken = state.liveTransitionToken;
      state.liveTransitionTimer = setTimeout(() => {
        if (transitionToken !== state.liveTransitionToken || state.activeView !== 'replay-view') return;
        state.liveTransitionTimer = null;
        const pending = state.livePendingSnapshot;
        state.livePendingSnapshot = null;
        if (pending && state.activeView === 'replay-view') renderLiveMatchSnapshot(pending);
        if (!state.liveHistoryTimer && state.liveHistoryQueue.length) playLiveHistoryFrame();
      }, 0);
    } else {
      renderLiveMatchSnapshot(snapshot);
    }
  } else {
    state.liveHistory = history;
    if (sameSequenceLifecycleUpdate) renderLiveMatchSnapshot(snapshot);
    const queuedSequences = new Set(state.liveHistoryQueue.map(frame => Number(frame.sequence)));
    for (const frame of history) {
      const sequence = Number(frame.sequence) || 0;
      if (sequence > state.liveLastSequence && !queuedSequences.has(sequence)) state.liveHistoryQueue.push(frame);
    }
    state.liveHistoryQueue.sort((left, right) => (Number(left.sequence) || 0) - (Number(right.sequence) || 0));
  }
  if (!state.liveTransitionTimer && !state.liveHistoryTimer && state.liveHistoryQueue.length) playLiveHistoryFrame();
}

function scheduleLiveMatchPoll() {
  if (!state.liveMatchContext || state.activeView !== 'replay-view') return;
  if (state.liveMatchPollingTimer) return;
  const transitioning = state.liveLatestSnapshot?.status === 'finished' && state.liveLatestSnapshot?.series?.active;
  const baseDelay = transitioning ? 500 : 1500;
  const delay = Math.min(30_000, state.livePollBackoffMs || baseDelay) + Math.floor(Math.random() * 250);
  state.liveMatchPollingTimer = setTimeout(() => { void pollLiveMatch(); }, delay);
}

function startLiveMatchStream() {
  const context = state.liveMatchContext;
  const StreamCtor = typeof window !== 'undefined' ? window['Event' + 'Source'] : undefined;
  if (!context || typeof StreamCtor !== 'function') return false;
  const endpoint = `/api/tournaments/${context.tournamentId}/spectator/matches/${context.matchId}/live/stream`;
  const source = new StreamCtor(endpoint, { withCredentials: true });
  state.liveStreamSource = source;
  state.liveStreamMode = true;
  source.onmessage = event => {
    if (state.liveStreamSource !== source || state.liveMatchContext !== context || state.activeView !== 'replay-view') return;
    try {
      const raw = JSON.parse(event.data);
      if (raw.status === 'unavailable') {
        $('#replay-content').hidden = true;
        const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = true;
        $('#replay-loading').hidden = false;
        return;
      }
      const snapshot = normalizeSpectatorLive(raw);
      state.livePollBackoffMs = 0;
      state.liveLatestSnapshot = snapshot;
      updateLiveHistory(snapshot);
      if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
        source.close();
        state.liveStreamSource = null;
      }
    } catch {
      // Ignore malformed individual events; the stream error handler will recover.
    }
  };
  source.onerror = () => {
    if (state.liveStreamSource !== source) return;
    source.close();
    state.liveStreamSource = null;
    scheduleLiveMatchPoll();
  };
  return true;
}

async function pollLiveMatch() {
  const context = state.liveMatchContext;
  if (!context || state.activeView !== 'replay-view') return;
  try {
    // Live snapshots are ephemeral; prevent an intermediary/browser cache
    // from returning the same turn (notably the old turn-100 snapshot).
    const endpoint = context.spectator
      ? `/tournaments/${context.tournamentId}/spectator/matches/${context.matchId}/live?ts=${Date.now()}`
      : `/tournaments/${context.tournamentId}/matches/${context.matchId}/live?ts=${Date.now()}`;
    const rawSnapshot = await api(endpoint);
    const snapshot = context.spectator ? normalizeSpectatorLive(rawSnapshot) : rawSnapshot;
    state.livePollBackoffMs = 0;
    if (state.liveMatchContext !== context || state.activeView !== 'replay-view') return;
    if (snapshot.status === 'unavailable') {
      $('#replay-content').hidden = true;
      const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = true;
      $('#replay-loading').hidden = false;
      const resultText = $('#r-result-text'); if (resultText) resultText.textContent = 'Chưa có dữ liệu trực tiếp';
      scheduleLiveMatchPoll();
      return;
    }
    state.liveLatestSnapshot = snapshot;
    updateLiveHistory(snapshot);
    if (snapshot.status === 'in_progress' || snapshot.series?.active) scheduleLiveMatchPoll();
  } catch (error) {
    $('#replay-content').hidden = true;
    const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = true;
    $('#replay-loading').hidden = false;
    if (state.liveMatchContext !== context || state.activeView !== 'replay-view') return;
    if (error?.status === 429) state.livePollBackoffMs = Math.min(30_000, Math.max(3_000, (state.livePollBackoffMs || 1500) * 2));
    const resultText = $('#r-result-text'); if (resultText) resultText.textContent = error.message || 'Không thể tải dữ liệu trực tiếp';
    scheduleLiveMatchPoll();
  }
}

function normalizeSpectatorLive(response) {
  const game = response.game;
  const series = response.series || {};
  const frame = game ? {
    matchId: response.matchId,
    gameNumber: game.gameNumber,
    status: game.status,
    sequence: game.sequence,
    turn: game.turn,
    currentPlayer: game.currentPlayer,
    state: game.board,
    latestMove: game.latestMove,
    outcome: game.outcome,
    winner: game.outcome?.winner || null,
    updatedAt: game.observedAt,
  } : null;
  const history = (response.history || []).map(item => ({
    ...item,
    matchId: response.matchId,
    state: item.board,
    latestMove: item.latestMove,
    updatedAt: item.observedAt,
    status: item.status,
    sequence: item.sequence,
    turn: item.turn,
    currentPlayer: item.currentPlayer,
    gameNumber: item.gameNumber,
    currentParticipants: {
      A: item.sideA ? { participantId: item.sideA.participantId, participantName: item.sideA.name } : null,
      B: item.sideB ? { participantId: item.sideB.participantId, participantName: item.sideB.name } : null,
    },
  }));
  return {
    ...frame,
    ...(frame || { matchId: response.matchId, status: response.status, gameNumber: series.currentGameNumber || 1, sequence: 0, turn: 0, currentPlayer: 'A', state: null, latestMove: null, updatedAt: new Date().toISOString() }),
    status: response.status === 'between_games' ? 'finished' : response.status,
    history,
    series: {
      format: series.format,
      bestOf: series.bestOf,
      currentGame: series.currentGameNumber,
      competitorA: series.competitorX,
      competitorB: series.competitorY,
      winsA: series.score?.A ?? 0,
      winsB: series.score?.B ?? 0,
      winner: series.winner ?? null,
      active: response.status === 'in_progress' || response.status === 'between_games',
    },
    participants: {
      A: series.competitorX ? { participantId: series.competitorX.participantId, participantName: series.competitorX.name } : null,
      B: series.competitorY ? { participantId: series.competitorY.participantId, participantName: series.competitorY.name } : null,
    },
    currentParticipants: {
      A: game?.sideA ? { participantId: game.sideA.participantId, participantName: game.sideA.name } : null,
      B: game?.sideB ? { participantId: game.sideB.participantId, participantName: game.sideB.name } : null,
    },
    historyTruncated: response.historyTruncated,
  };
}

function openLiveMatch(tournamentId, matchId, pairingId = null) {
  stopReplayPlayback();
  stopLiveMatchPolling();
  hideLiveGameResultModal();
  // Game selector buttons belong to replay navigation, not live viewing.
  document.querySelector('#replay-series-controls')?.remove();
  const inferredPairingId = pairingId || (String(matchId).startsWith(`${tournamentId}-`) ? String(matchId).slice(String(tournamentId).length + 1) : null);
  state.liveMatchContext = { tournamentId, matchId, pairingId: inferredPairingId, spectator: state.spectatorMode === true };
  state.replayMatchId = matchId;
  $('#replay-view').classList.add('live-match-view');
  $('#replay-view-kicker').textContent = 'XEM TRỰC TIẾP TRẬN ĐẤU';
  setReplayBackLabel('Quay lại chi tiết giải đấu');
  $('#replay-view-title').textContent = 'Diễn biến trận đấu';
  $('#replay-content').hidden = true;
  const seriesCard = $('#replay-series-card'); if (seriesCard) seriesCard.hidden = true;
  $('#replay-error').hidden = true;
  $('#replay-loading').hidden = false;
  $('#replay-loading').textContent = 'Đang kết nối dữ liệu trực tiếp…';
  navigate('replay-view');
  state.liveMatchContext = { tournamentId, matchId, pairingId: inferredPairingId, spectator: state.spectatorMode === true };
  if (!startLiveMatchStream()) void pollLiveMatch();
  if (!inferredPairingId) {
    void request(`/tournaments/${tournamentId}`).then(tournament => {
      const pairing = tournament.rounds?.flatMap(round => round.pairings || []).find(item => item.matchId === matchId);
      if (state.liveMatchContext?.matchId !== matchId || !pairing) return;
      state.liveMatchContext.pairingId = pairing.pairingId;
    }).catch(() => {});
  }
}

function closeReplay() {
  stopReplayPlayback();
  stopLiveMatchPolling();
  const isPracticeReplay = state.replayContext?.practice === true;
  state.replay = null;
  state.replaySeries = null;
  state.replayGameIndex = 0;
  state.replayContext = null;
  state.replayMatchId = null;
  state.replayMoveIndex = -1;
  state.replayLoading = false;
  state.liveMatchContext = null;
  state.liveMatchSnapshot = null;
  if (isPracticeReplay) {
    state.practiceAbortController?.abort();
    state.practiceAbortController = null;
    clearPracticeResult();
    state.practiceReplay = null;
    state.practiceReplayMoveIndex = -1;
    state.practiceRevision = null;
    state.practiceDraft = null;
    state.practiceRequestToken += 1;
  }
  navigate(isPracticeReplay ? 'bot-workspace' : 'tournament-detail');
}

function setReplayLoading(isLoading) {
  state.replayLoading = isLoading;
  const loading = $('#replay-loading');
  const content = $('#replay-content');
  if (loading) loading.hidden = !isLoading;
  if (content) content.hidden = isLoading;
  if (isLoading) {
    const seriesCard = $('#replay-series-card');
    if (seriesCard) seriesCard.hidden = true;
    document.querySelector('#replay-view .replay-player-a-label')?.classList.remove('is-winner');
    document.querySelector('#replay-view .replay-player-b-label')?.classList.remove('is-winner');
  }
}

