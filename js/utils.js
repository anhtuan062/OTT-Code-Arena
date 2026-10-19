const create = (tag, options = {}) => {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.type) element.type = options.type;
  if (options.attrs) Object.entries(options.attrs).forEach(([name, value]) => element.setAttribute(name, String(value)));
  if (Array.isArray(options.children)) element.append(...options.children.filter(Boolean));
  return element;
};

function tournamentFormatLabel(format) {
  return format === 'multi_stage' ? 'Nhiều giai đoạn' : 'Vòng tròn một lượt';
}
const clear = (element) => element.replaceChildren();
const textCell = (text, tag = 'td') => create(tag, { text });
const shortId = value => {
  const id = String(value || '');
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
};


function statusBadge(status) {
  const normalized = safeStatusClass(status);
  return create('span', {
    className: `status-badge status-${normalized}`,
    text: localizeStatus(normalized),
  });
}

function safeStatusClass(status) {
  const normalized = String(status || 'unknown');
  return /^[a-z][a-z0-9_-]*$/i.test(normalized) ? normalized : 'unknown';
}

function actionButton(label, action, key, className = 'secondary-btn') {
  const button = create('button', { className, text: label, type: 'button' });
  button.disabled = state.pending.has(key);
  button.addEventListener('click', () => runPending(key, button, action));
  return button;
}

async function runPending(key, button, action) {
  if (state.pending.has(key)) return;
  state.pending.add(key);
  const buttonText = button?.querySelector('.btn-text');
  const buttonLoading = button?.querySelector('.btn-loading');
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-loading');
    buttonText?.classList.add('hidden');
    buttonLoading?.classList.remove('hidden');
  }
  try { return await action(); }
  catch (error) {
    if (!error?.notified) showToast(error?.message || 'Thao tác thất bại. Vui lòng thử lại.', 'error');
    return undefined;
  } finally {
    state.pending.delete(key);
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.classList.remove('is-loading');
      buttonText?.classList.remove('hidden');
      buttonLoading?.classList.add('hidden');
    }
  }
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  if (!container) return;
  const toastMeta = {
    success: { icon: 'td-icon-check', label: '\u0110\u00E3 xong' },
    error: { icon: 'td-icon-circle-x', label: 'C\u00F3 l\u1ED7i' },
    info: { icon: 'td-icon-ellipsis', label: 'Th\u00F4ng b\u00E1o' },
    capture: { icon: 'td-icon-check', label: 'C\u1EADp nh\u1EADt' },
  }[type] || { icon: 'td-icon-ellipsis', label: 'Th\u00F4ng b\u00E1o' };
  const toast = create('div', { className: `toast toast-${type}`, attrs: { role: type === 'error' ? 'alert' : 'status' } });
  const marker = create('span', { className: 'toast-marker', attrs: { 'aria-hidden': 'true' } });
  marker.appendChild(icon(toastMeta.icon));
  const content = create('div', { className: 'toast-content' });
  content.append(create('strong', { className: 'toast-label', text: toastMeta.label }), create('span', { className: 'toast-message', text: message }));
  toast.append(marker, content);
  toast.appendChild(actionButton('Đóng', () => toast.remove(), `dismiss-toast:${Date.now()}`, 'toast-close'));
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  const duration = type === 'error' ? 8000 : 3000;
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, duration);
}

function renderMessage(container, message, retry) {
  clear(container);
  const wrapper = create('div', { className: 'ui-message' });
  wrapper.appendChild(create('p', { text: message }));
  if (retry) wrapper.appendChild(actionButton('Thử lại', retry, `retry:${container.id}`));
  container.appendChild(wrapper);
}

function renderTableMessage(tbody, message, columns, retry) {
  if (tbody.tagName !== 'TBODY') return renderMessage(tbody, message, retry);
  clear(tbody);
  const row = create('tr');
  const cell = create('td', { text: message, attrs: { colspan: columns } });
  cell.className = 'table-message';
  if (retry) cell.appendChild(actionButton('Thử lại', retry, `retry:${tbody.parentElement?.id || 'table'}`));
  row.appendChild(cell);
  tbody.appendChild(row);
}

function renderLoadingSkeleton(container, type = 'card', count = 4) {
  if (!container) return;
  clear(container);
  container.classList.add('is-loading-skeleton');
  container.setAttribute('aria-busy', 'true');
  const fragment = document.createDocumentFragment();
  if (container.tagName === 'TBODY') {
    for (let index = 0; index < count; index += 1) {
      const row = create('tr', { className: 'loading-skeleton-row' });
      for (let column = 0; column < type; column += 1) {
        const cell = create('td');
        cell.appendChild(create('span', { className: 'loading-skeleton-line' }));
        row.appendChild(cell);
      }
      fragment.appendChild(row);
    }
  } else {
    for (let index = 0; index < count; index += 1) {
      const card = create('div', { className: `loading-skeleton-card ${type}` });
      card.append(
        create('span', { className: 'loading-skeleton-avatar' }),
        create('span', { className: 'loading-skeleton-line loading-skeleton-line-title' }),
        create('span', { className: 'loading-skeleton-line loading-skeleton-line-wide' }),
        create('span', { className: 'loading-skeleton-line loading-skeleton-line-short' }),
      );
      fragment.appendChild(card);
    }
  }
  container.appendChild(fragment);
}

function clearLoadingSkeleton(container) {
  if (!container) return;
  container.classList.remove('is-loading-skeleton');
  container.removeAttribute('aria-busy');
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  state.modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  const focusable = getModalFocusable(modal)[0];
  if (focusable instanceof HTMLElement) focusable.focus();
}

function getModalFocusable(modal) {
  return [...modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
    .filter(element => !element.disabled && !element.hidden && element.getAttribute('tabindex') !== '-1' && !element.closest('[hidden]'));
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (state.modalReturnFocus?.isConnected) state.modalReturnFocus.focus();
  state.modalReturnFocus = null;
  if (!document.querySelector('.modal-overlay.open')) document.body.classList.remove('modal-open');
  if (id === 'delete-bot-modal') { state.deleteDialogRevision += 1; state.deletingBot = null; }
  if (id === 'delete-revision-modal') { state.revisionDeleteDialogRevision += 1; state.deletingRevision = null; $('#delete-revision-error').textContent = ''; $('#delete-revision-error').hidden = true; }
  if (id === 'add-tourney-modal') { state.tournamentDialogRevision += 1; $('#tournament-form-error').textContent = ''; $('#tournament-form-error').hidden = true; }
  if (id === 'register-bot-tourney-modal') { state.registrationDialogRevision += 1; $('#registration-form-error').textContent = ''; $('#registration-form-error').hidden = true; }
  if (id === 'tournament-action-modal') { state.tournamentActionRevision += 1; state.pendingTournamentAction = null; }
  if (id === 'practice-modal') {
    state.practiceAbortController?.abort();
    state.practiceAbortController = null;
    state.practiceRequestToken += 1;
    state.practiceRevision = null;
    state.practiceDraft = null;
    if (typeof stopPracticeReplay === 'function') stopPracticeReplay();
    state.practiceReplay = null;
    state.practiceReplayMoveIndex = -1;
    const scenario = $('#practice-scenario'); if (scenario) scenario.disabled = false;
    const runButton = $('#practice-run'); if (runButton) { runButton.disabled = false; runButton.textContent = 'Chạy thử'; }
  }
}

function trapModalFocus(event) {
  if (event.key !== 'Tab') return;
  const modal = document.querySelector('.modal-overlay.open');
  if (!modal) return;
  const focusable = getModalFocusable(modal);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

