let operationsPollTimer = null;
let operationsTournamentTimer = null;
let operationsRequestInFlight = false;
let operationsTournamentInFlight = false;

const operationsText = (value, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const operationsNumber = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const operationsMs = value => operationsNumber(value) === null ? '—' : `${Math.round(value)} ms`;
const operationsPercent = value => operationsNumber(value) === null ? '—' : `${value.toFixed(1)}%`;
const operationsMetric = (metrics, name, field = 'p95') => metrics?.histograms?.[name]?.[field];
const capacityLabels = { healthy: 'Bình thường', recovery: 'Đang hồi phục', constrained: 'Hạn chế', critical: 'Nghiêm trọng' };
const tournamentStatusLabels = { running: 'Đang diễn ra', registration_closed: 'Đã đóng đăng ký' };

function setOperationsText(id, value, fallback = '—') {
  const element = document.getElementById(id);
  if (element) element.textContent = operationsText(value, fallback);
}

function setOperationsMeter(id, value) {
  const element = document.getElementById(id);
  const numeric = operationsNumber(value);
  if (element) element.style.width = `${Math.max(0, Math.min(100, numeric ?? 0))}%`;
}

function renderOperationsMetrics(metrics, queue) {
  const stateName = metrics?.statuses?.['host.capacity.state'];
  const stateLabel = stateName ? (capacityLabels[stateName] ?? stateName) : 'Chưa có dữ liệu';
  const stateBadge = $('#ops-capacity-state');
  if (stateBadge) {
    stateBadge.textContent = stateLabel;
    stateBadge.className = `ops-badge ${stateName ? `ops-badge-${stateName}` : 'ops-badge-muted'}`;
  }
  setOperationsText('ops-capacity-copy', stateName ? (stateName === 'healthy' ? 'Máy chủ đang hoạt động bình thường' : 'Cần theo dõi năng lực máy chủ') : 'Chưa có dữ liệu năng lực máy chủ');
  const cpu = metrics?.host?.cpu?.usagePercent;
  const memory = metrics?.host?.memory?.usedPercent;
  setOperationsText('ops-cpu', operationsPercent(cpu)); setOperationsMeter('ops-cpu-meter', cpu);
  setOperationsText('ops-memory', operationsPercent(memory)); setOperationsMeter('ops-memory-meter', memory);
  setOperationsText('ops-memory-free', operationsNumber(metrics?.host?.memory?.freeBytes) === null ? 'RAM trống: —' : `RAM trống: ${(metrics.host.memory.freeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);

  setOperationsText('ops-docker-active', metrics?.gauges?.['docker.limiter.active']);
  setOperationsText('ops-docker-pending', metrics?.gauges?.['docker.limiter.pending']);
  setOperationsText('ops-docker-wait', operationsMs(operationsMetric(metrics, 'docker.limiter.wait_ms')));
  setOperationsText('ops-docker-execution', operationsMs(operationsMetric(metrics, 'docker.limiter.execution_ms')));

  setOperationsText('ops-match-active', metrics?.gauges?.['queue.execution.active'] ?? queue?.activeCount);
  setOperationsText('ops-match-queued', metrics?.gauges?.['queue.execution.depth'] ?? queue?.queueLength);
  setOperationsText('ops-match-wait', operationsMs(operationsMetric(metrics, 'queue.execution.wait_ms')));
  setOperationsText('ops-match-execution', operationsMs(operationsMetric(metrics, 'queue.execution.execution_ms')));
  setOperationsText('ops-preflight-active', metrics?.gauges?.['queue.preflight.active']);
  setOperationsText('ops-preflight-queued', metrics?.gauges?.['queue.preflight.depth']);
  setOperationsText('ops-preflight-wait', operationsMs(operationsMetric(metrics, 'queue.preflight.wait_ms')));
  setOperationsText('ops-preflight-execution', operationsMs(operationsMetric(metrics, 'queue.preflight.execution_ms')));

  setOperationsText('ops-api-p95', operationsMs(operationsMetric(metrics, 'api.latency_ms')));
  setOperationsText('ops-api-errors', operationsPercent((metrics?.rates?.apiErrorRate ?? null) === null ? null : metrics.rates.apiErrorRate * 100));
  setOperationsText('ops-persistence-read', operationsMs(operationsMetric(metrics, 'persistence.read_ms')));
  setOperationsText('ops-persistence-write', operationsMs(operationsMetric(metrics, 'persistence.write_ms')));
  setOperationsText('ops-persistence-commit', operationsMs(operationsMetric(metrics, 'persistence.commit_ms')));
  const hits = metrics?.counters?.['cache.projection.hits']; const misses = metrics?.counters?.['cache.projection.misses'];
  const hitRate = operationsNumber(hits) !== null && operationsNumber(misses) !== null && hits + misses > 0 ? hits / (hits + misses) * 100 : null;
  setOperationsText('ops-cache-efficiency', operationsPercent(hitRate), 'Cache efficiency unavailable');
  setOperationsText('ops-cache-hits', hits); setOperationsText('ops-cache-misses', misses); setOperationsText('ops-cache-source-reads', metrics?.counters?.['cache.projection.source_reads']);

  const warning = $('#ops-warning');
  if (warning) { warning.hidden = !['constrained', 'critical'].includes(stateName); warning.textContent = stateName === 'critical' ? 'Tải máy chủ nghiêm trọng: tạm dừng nhận trận mới. Các loạt trận đang chạy vẫn được bảo toàn.' : 'Tải máy chủ đang hạn chế: hệ thống có thể giảm nhận thêm trận mới.'; }
  const dot = $('#ops-status-dot'); if (dot) dot.className = `operations-status-dot ${stateName === 'healthy' ? 'is-live' : stateName ? 'is-warning' : ''}`;
}

function tournamentProgress(tournament) {
  const pairings = (tournament?.rounds ?? []).flatMap(round => round.pairings ?? []);
  const completed = pairings.filter(pairing => pairing.status === 'completed').length;
  return { completed, total: pairings.length, percent: pairings.length ? completed / pairings.length * 100 : 0 };
}

function renderOperationsTournaments(tournaments) {
  const active = (Array.isArray(tournaments) ? tournaments : []).filter(tournament => ['running', 'registration_closed'].includes(tournament.status));
  setOperationsText('ops-tournament-count', `${active.length} đang hoạt động`);
  const target = $('#ops-tournaments'); if (!target) return;
  target.replaceChildren();
  if (!active.length) { target.appendChild(create('p', { className: 'operations-empty', text: 'Không có giải đấu đang hoạt động.' })); return; }
  active.forEach(tournament => {
    const progress = tournamentProgress(tournament);
    const row = create('div', { className: 'operations-tournament-row' });
    row.append(create('span', { className: 'operations-tournament-name', text: tournament.name || tournament.tournamentId }), create('span', { className: 'operations-tournament-status', text: `${tournamentStatusLabels[tournament.status] ?? tournament.status} · ${progress.completed}/${progress.total} trận` }));
    const bar = create('div', { className: 'operations-progress', attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(Math.max(progress.total, 1)), 'aria-valuenow': String(progress.completed), 'aria-label': `Tiến độ ${tournament.name || tournament.tournamentId}: ${progress.completed}/${progress.total} trận` } });
    bar.appendChild(create('span', { attrs: { style: `width:${progress.percent}%` } })); row.appendChild(bar); target.appendChild(row);
  });
}

async function refreshOperations({ includeTournaments = false } = {}) {
  if (state.user?.role !== 'organizer' || state.activeView !== 'operations' || operationsRequestInFlight) return;
  operationsRequestInFlight = true;
  try {
    const requests = [request('/system/metrics'), request('/system/queue')];
    if (includeTournaments) requests.push(request('/tournaments'));
    const [metrics, queue, tournaments] = await Promise.all(requests);
    if (state.activeView !== 'operations' || state.user?.role !== 'organizer') return;
    renderOperationsMetrics(metrics, queue);
    if (includeTournaments) renderOperationsTournaments(tournaments);
    setOperationsText('ops-last-updated', `Cập nhật ${new Date().toLocaleTimeString('vi-VN')}`);
    const error = $('#ops-error'); if (error) error.hidden = true;
  } catch (error) {
    const target = $('#ops-error'); if (target) { target.hidden = false; target.textContent = error?.status === 403 ? 'Bạn không có quyền xem bảng vận hành hệ thống.' : 'Một hoặc nhiều chỉ số hiện không khả dụng.'; }
  } finally { operationsRequestInFlight = false; }
}

function stopOperationsPolling() {
  if (operationsPollTimer) window.clearInterval(operationsPollTimer); if (operationsTournamentTimer) window.clearInterval(operationsTournamentTimer);
  operationsPollTimer = null; operationsTournamentTimer = null; operationsRequestInFlight = false; operationsTournamentInFlight = false;
}

function startOperationsPolling() {
  stopOperationsPolling();
  if (state.user?.role !== 'organizer' || state.activeView !== 'operations') return;
  void refreshOperations({ includeTournaments: true });
  operationsPollTimer = window.setInterval(() => void refreshOperations(), 5000);
  operationsTournamentTimer = window.setInterval(() => void refreshOperations({ includeTournaments: true }), 15000);
}
