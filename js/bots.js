const BOT_WORKSPACE_DRAFT_KEY = 'ott_bot_workspace_draft_v1';
const BOT_WORKSPACE_SELECTION_KEY = 'ott_bot_workspace_selection_v1';

function botWorkspaceDraftUserKey() {
  return state.user?.id || state.user?.username || '';
}

function readBotWorkspaceDraft() {
  try {
    const raw = window.localStorage?.getItem(BOT_WORKSPACE_DRAFT_KEY);
    const draft = raw ? JSON.parse(raw) : null;
    return draft?.userKey === botWorkspaceDraftUserKey() ? draft : null;
  } catch {
    return null;
  }
}

function persistBotWorkspaceDraft() {
  const editor = $('#bot-source-editor');
  const nameInput = $('#bot-workspace-name');
  const runtime = $('#bot-source-runtime');
  const userKey = botWorkspaceDraftUserKey();
  if (!editor || !userKey || state.botWorkspaceReadOnly) return;
  try {
    window.localStorage?.setItem(BOT_WORKSPACE_DRAFT_KEY, JSON.stringify({
      userKey,
      botId: state.sourceWorkspaceBot?.id || null,
      name: nameInput?.value || '',
      runtimeId: runtime?.value || 'cpp',
      source: editor.value,
      updatedAt: new Date().toISOString(),
    }));
  } catch {}
}

function clearBotWorkspaceDraft() {
  try { window.localStorage?.removeItem(BOT_WORKSPACE_DRAFT_KEY); } catch {}
}

function botWorkspaceSelectionKey() {
  return `${BOT_WORKSPACE_SELECTION_KEY}:${state.user?.id || state.user?.username || 'anonymous'}`;
}

function readBotWorkspaceSelection() {
  try { return window.sessionStorage?.getItem(botWorkspaceSelectionKey()) || ''; } catch { return ''; }
}

function persistBotWorkspaceSelection(botId) {
  try {
    if (botId) window.sessionStorage?.setItem(botWorkspaceSelectionKey(), botId);
    else window.sessionStorage?.removeItem(botWorkspaceSelectionKey());
  } catch {}
}

function renderDashboardBotList(bots) {
  const list = $('#dash-bot-list');
  if (!list) return;
  clear(list);
  list.classList.toggle('is-empty', !bots.length);
  if (!bots.length) {
    const empty = create('div', { className: 'dashboard-bot-empty' });
    const botIcon = icon('icon-bot'); botIcon.classList.add('dashboard-bot-icon');
    const createBot = create('button', { className: 'primary-btn dashboard-bot-empty-action', type: 'button', text: '+ Tạo Bot đầu tiên' });
    createBot.addEventListener('click', () => openBotWorkspace());
    empty.append(botIcon, create('strong', { text: 'Bạn chưa có Bot nào' }), create('span', { text: 'Tạo Bot đầu tiên để bắt đầu xây dựng chiến thuật.' }), createBot);
    list.appendChild(empty);
    return;
  }
  const botColorPalettes = [
    'linear-gradient(135deg, #0d9488, #059669)',
    'linear-gradient(135deg, #2563eb, #1d4ed8)',
    'linear-gradient(135deg, #7c3aed, #6d28d9)',
    'linear-gradient(135deg, #d97706, #b45309)',
    'linear-gradient(135deg, #e11d48, #be123c)'
  ];
  bots.slice(0, 5).forEach((bot, index) => {
    const item = create('button', { className: 'dashboard-bot-item', type: 'button', attrs: { 'aria-label': `Xem Bot ${bot.name}` } });
    const initials = (bot.name || 'B').trim().slice(0, 2).toUpperCase();
    const identicon = create('span', { className: 'dashboard-bot-identicon', text: initials });
    identicon.style.background = botColorPalettes[index % botColorPalettes.length];
    const copy = create('span', { className: 'dashboard-bot-copy' });
    const nameStrong = create('strong', { text: bot.name });
    const runtime = bot.selectedRevision?.runtimeId || (bot.command === 'python3' ? 'python3' : 'cpp');
    const badge = create('span', {
      className: `dashboard-bot-badge ${runtime === 'python3' ? 'badge-python' : 'badge-cpp'}`,
      text: runtime === 'python3' ? 'Python' : 'C++17',
    });
    nameStrong.appendChild(badge);
    copy.append(nameStrong, create('small', { text: bot.currentRevisionId ? 'Đã có phiên bản mã nguồn' : 'Chưa có phiên bản mã nguồn' }));
    const arrow = icon('icon-arrow-right'); arrow.classList.add('dashboard-bot-arrow');
    item.append(identicon, copy, arrow);
    item.addEventListener('click', () => openBotWorkspace(bot));
    list.appendChild(item);
  });
  if (bots.length < 6) {
    const addItem = create('button', { className: 'dashboard-bot-item dashboard-bot-item-add', type: 'button', attrs: { 'aria-label': 'Tạo Bot mới' } });
    const plusIcon = icon('icon-plus'); plusIcon.classList.add('dashboard-bot-item-icon');
    const addCopy = create('span', { className: 'dashboard-bot-copy' });
    addCopy.append(create('strong', { text: '+ Tạo Bot mới' }), create('small', { text: 'Thêm chiến thuật thi đấu' }));
    addItem.append(plusIcon, addCopy);
    addItem.addEventListener('click', () => {
      openModal('create-bot-modal');
      const input = $('#bot-name'); if (input) { input.value = ''; input.focus(); }
    });
    list.appendChild(addItem);
  }
}

async function loadBots() {
  const list = $('#bots-list');
  const table = list;
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  state.loading.add('bots');
  state.error = null;
  list.classList.add('bot-grid-empty');
  $('#bots-toolbar').hidden = true;
  $('#open-bot-modal').hidden = true;
  renderLoadingSkeleton(table, 'bot-skeleton', 4);
  renderTableMessage(table, 'Đang tải danh sách Bot…', 5);
  try {
    const bots = await request('/bots');
    if (!isCurrentView('bots', authRevision, viewRevision)) return;
    state.bots = bots;
    renderBotList();
  } catch (error) { if (isCurrentView('bots', authRevision, viewRevision)) { state.error = localizeErrorMessage(error.message || 'Không thể tải Bot.'); $('#bots-count').textContent = 'Không thể tải Bot'; $('#bots-toolbar').hidden = true; $('#open-bot-modal').hidden = false; renderMessage(list, state.error, loadBots); } }
  finally { state.loading.delete('bots'); }
}

function renderBotList() {
  const list = $('#bots-list');
  const pagination = $('#bot-pagination');
  if (typeof clearLoadingSkeleton === 'function') clearLoadingSkeleton(list);
  if (pagination) pagination.hidden = true;
  const toolbar = $('#bots-toolbar');
  const createButton = $('#open-bot-modal');
  const query = state.botSearch.trim().toLocaleLowerCase();
  const bots = state.bots.filter(bot => bot.name.toLocaleLowerCase().includes(query));
  clear(list);
  if (state.sourceWorkspaceBot && !state.bots.some(bot => bot.id === state.sourceWorkspaceBot.id)) {
    state.sourceWorkspaceBot = null;
    state.sourceRevisions = [];
    state.sourceDirty = false;
    state.botWorkspaceMode = 'create';
  }
  const hasBots = state.bots.length > 0;
  list.classList.toggle('bot-grid-empty', !hasBots || !bots.length);
  toolbar.hidden = !hasBots;
  createButton.hidden = false;
  $('#bots-count').textContent = bots.length === state.bots.length ? `${state.bots.length} Bot` : `${bots.length} / ${state.bots.length} Bot`;
  if (!hasBots) {
    toolbar.hidden = true;
    createButton.hidden = true;
    return renderBotEmpty(list, 'Bạn chưa có Bot nào', 'Tạo Bot đầu tiên để xây dựng chiến thuật, quản lý phiên bản mã nguồn và tham gia giải đấu.');
  }
  if (!bots.length) return renderBotEmpty(list, 'Không tìm thấy Bot phù hợp', 'Hãy thử tên khác hoặc xóa nội dung tìm kiếm.', false);
  const pageSize = 12;
  const totalPages = Math.ceil(bots.length / pageSize);
  state.botPage = Math.min(Math.max(1, Number.isFinite(state.botPage) ? state.botPage : 1), totalPages);
  const pageStart = (state.botPage - 1) * pageSize;
  const pageBots = bots.slice(pageStart, pageStart + pageSize);
  pageBots.forEach(bot => {
    const card = create('article', { className: 'bot-card' });
    const header = create('div', { className: 'bot-card-header' });
    const identity = create('div', { className: 'bot-card-identity' });
    const botIcon = create('span', { className: 'bot-card-icon' }); botIcon.appendChild(icon('icon-bot'));
    const heading = create('div'); heading.append(create('h3', { className: 'bot-card-title', text: bot.name, title: bot.name }));
    const badges = create('div', { className: 'bot-card-badges' });
    identity.append(botIcon, heading);
    header.append(identity, badges); card.appendChild(header);
    const config = create('div', { className: 'bot-config' });
    const selectedRevision = bot.selectedRevision;
    const runtimeLabel = selectedRevision?.runtimeId === 'cpp' ? 'C++17' : selectedRevision?.runtimeId === 'python3' ? 'Python 3' : selectedRevision ? 'Phiên bản cũ' : null;
    const modeLabel = selectedRevision?.executionMode === 'strategy' ? 'Strategy SDK' : selectedRevision?.executionMode === 'raw' ? 'Mã nguồn trực tiếp' : null;
    if (runtimeLabel) badges.appendChild(create('span', { className: 'bot-card-badge', text: runtimeLabel }));
    if (modeLabel) badges.appendChild(create('span', { className: 'bot-card-badge bot-card-badge-muted', text: modeLabel }));
    const revisionLabel = selectedRevision?.label || (selectedRevision?.revisionId ? `Đã lưu · ${selectedRevision.revisionId.slice(0, 8)}` : null);
    const configRows = bot.currentRevisionId
      ? [['Ngôn ngữ', runtimeLabel || 'Đã lưu phiên bản'], ['Chế độ', modeLabel || 'Chưa xác định'], ['Phiên bản mới nhất', revisionLabel || 'Đã lưu phiên bản']]
      : [['Lệnh', bot.command], ['Tham số', bot.args.length ? bot.args.join(', ') : 'Không có tham số']];
    configRows.forEach(([label, value]) => {
      const row = create('div', { className: 'bot-config-row' }); row.append(create('span', { text: label }), create('code', { text: value })); config.appendChild(row);
    });
    card.appendChild(config);
    config.hidden = true;
    const revisionBody = create('div', { className: 'bot-card-body' });
    const revisionRow = create('div', { className: 'bot-revision-row' });
    const revisionIcon = icon('icon-git-commit-horizontal'); revisionIcon.classList.add('bot-revision-icon');
    const revisionText = create('div', { className: 'bot-revision-copy' });
    revisionText.append(
      create('span', { className: 'bot-revision-label', text: 'Phiên bản mã nguồn' }),
      create('code', { text: selectedRevision?.revisionId ? shortId(selectedRevision.revisionId) : 'Chưa có phiên bản' }),
    );
    revisionRow.append(revisionIcon, revisionText);
    revisionBody.appendChild(revisionRow);
    card.appendChild(revisionBody);
    const footer = create('div', { className: 'bot-card-footer' });
    const date = new Date(bot.registeredAt);
    footer.appendChild(create('small', {
      className: 'bot-card-date',
      text: Number.isNaN(date.getTime()) ? 'Không có ngày đăng ký' : `Đăng ký ngày ${date.toLocaleDateString('vi-VN')}`
    }));
    const actions = create('div', { className: 'bot-actions' });
    const actionIcons = ['icon-code-2', 'icon-activity', 'icon-trash-2'];
    const sourceBtn = actionButton('Mã nguồn', () => openSourceWorkspace(bot), `source-bot:${bot.id}`, 'primary-btn bot-action');
    sourceBtn.title = 'Mở trình soạn thảo mã nguồn';
    const testBtn = actionButton('Test thế cờ', () => typeof openPlaygroundForBot === 'function' ? openPlaygroundForBot(bot) : navigate('bot-playground'), `playground-bot:${bot.id}`, 'secondary-btn bot-action');
    testBtn.title = 'Kiểm tra thế cờ trong sa bàn thử nghiệm';
    const deleteBtn = actionButton('Xóa', () => openDeleteBotDialog(bot), `delete-bot:${bot.id}`, 'secondary-btn bot-action bot-delete');
    deleteBtn.title = 'Xóa Bot này';
    deleteBtn.setAttribute('aria-label', `Xóa Bot ${bot.name || ''}`);
    actions.append(sourceBtn, testBtn, deleteBtn);
    actionIcons.forEach((iconId, index) => {
      const action = actions.children[index];
      if (!action || action.querySelector('svg')) return;
      const actionIcon = icon(iconId); actionIcon.classList.add('ui-icon'); action.prepend(actionIcon);
    });
    footer.appendChild(actions); card.appendChild(footer); list.appendChild(card);
  });
  if (typeof renderBotPagination === 'function') renderBotPagination(totalPages);
}

function renderBotPagination(totalPages) {
  const pagination = $('#bot-pagination');
  if (!pagination) return;
  clear(pagination);
  if (totalPages <= 1) {
    pagination.hidden = true;
    return;
  }
  pagination.hidden = false;
  const previous = create('button', { className: 'secondary-btn bot-pagination-button', type: 'button', text: 'Trước' });
  previous.disabled = state.botPage === 1;
  previous.addEventListener('click', () => { state.botPage -= 1; renderBotList(); });
  const pageLabel = create('span', { className: 'bot-pagination-label', text: `Trang ${state.botPage} / ${totalPages}` });
  const next = create('button', { className: 'secondary-btn bot-pagination-button', type: 'button', text: 'Sau' });
  next.disabled = state.botPage === totalPages;
  next.addEventListener('click', () => { state.botPage += 1; renderBotList(); });
  pagination.append(previous, pageLabel, next);
}

function setSourceError(message = '') {
  const error = $('#bot-source-error');
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
}

function updateSourceRuntimeMeta(runtimeId) {
  const isPython = runtimeId === 'python3';
  const isLegacy = runtimeId === 'nodejs' || runtimeId === '';
  const runtimeLabel = isLegacy ? 'JavaScript phiên bản cũ' : isPython ? 'Python 3' : 'C++17';
  const filename = $('#bot-source-filename');
  const help = $('#bot-source-help');
  if (filename) filename.textContent = isLegacy ? 'main.js' : isPython ? 'main.py' : 'main.cpp';
  if (help) help.textContent = `${runtimeLabel} · UTF-8 · Tối đa 64 KiB`;
}

function switchSourceRuntime(runtimeId) {
  if (!['cpp', 'python3'].includes(runtimeId)) return;
  const select = $('#bot-source-runtime');
  const editor = $('#bot-source-editor');
  if (!select || !editor) return;
  if (state.botWorkspaceReadOnly) {
    select.value = state.sourceRuntime || select.value;
    return;
  }
  const currentRuntime = state.sourceRuntime || select.value || 'cpp';
  state.sourceRuntimeDrafts.set(currentRuntime, { source: editor.value, dirty: state.sourceDirty });
  state.sourceRuntime = runtimeId;
  select.value = runtimeId;
  const draft = state.sourceRuntimeDrafts.get(runtimeId);
  editor.value = draft?.source ?? STRATEGY_TEMPLATES[runtimeId] ?? '';
  updateSourceRuntimeMeta(runtimeId);
  if (typeof updateEditorMetrics === 'function') updateEditorMetrics();
  setSourceDirty(draft?.dirty ?? Boolean(editor.value));
}

function updateSourceModeMeta(executionMode = '', sdkVersion = '') {
  const mode = $('#bot-source-mode');
  if (!mode) return;
  if (executionMode === 'strategy') mode.textContent = sdkVersion ? `Strategy SDK ${sdkVersion}` : 'Strategy SDK';
  else if (executionMode === 'raw') mode.textContent = 'Mã nguồn trực tiếp';
  else mode.textContent = 'Chưa có phiên bản';
}

function updateEditorMetrics() {
  const editor = $('#bot-source-editor');
  const gutter = $('#bot-source-lines');
  if (!editor) return;
  const lineCount = Math.max(1, editor.value.split('\n').length);
  if (gutter) {
    gutter.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
    gutter.scrollTop = editor.scrollTop;
  }
  syncSourceEditorTools();
}

function renderSourceHighlight(container, source) {
  clear(container);
  if (!source) {
    container.appendChild(document.createTextNode(' '));
    return;
  }
  const tokenPattern = /(\/\/[^\n]*|#[^\n]*|\#[a-zA-Z_][\w]*|"[^"\n]*"|'[^'\n]*'|\b\d+(?:\.\d+)?\b|\b(?:class|def|return|if|else|elif|for|while|in|import|from|as|True|False|None|and|or|not|using|namespace|const|auto|int|string|bool|void|struct|vector|return|include|public|private|new)\b)/g;
  let lastIndex = 0;
  let match;
  while ((match = tokenPattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
    }
    const token = match[0];
    let className = 'code-keyword';
    if (token.startsWith('//') || token.startsWith('#')) className = 'code-comment';
    else if (token.startsWith('"') || token.startsWith("'")) className = 'code-string';
    else if (/^\d/.test(token)) className = 'code-number';
    container.appendChild(create('span', { className, text: token }));
    lastIndex = tokenPattern.lastIndex;
  }
  if (lastIndex < source.length) {
    container.appendChild(document.createTextNode(source.slice(lastIndex)));
  }
}

function sourceSyntaxCheck(source, runtimeId) {
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  let quote = null;
  let escaped = false;
  const lines = source.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    let comment = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (comment) continue;
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") quote = character;
      else if (character === '/' && line[index + 1] === '/') { comment = true; index += 1; }
      else if (character === '#') comment = true;
      else if (['(', '[', '{'].includes(character)) stack.push({ character, line: lineIndex + 1 });
      else if (pairs[character]) {
        const last = stack.pop();
        if (!last || last.character !== pairs[character]) return `Dấu ngoặc không khớp ở dòng ${lineIndex + 1}`;
      }
    }
  }
  if (quote) return 'Chuỗi ký tự chưa được đóng';
  if (stack.length) return `Dấu ngoặc chưa đóng ở dòng ${stack[stack.length - 1].line}`;
  if (runtimeId === 'python3' && lines.some(line => /:\s*[^#]/.test(line) && line.trim().endsWith(':') === false && /^\s+(if|for|while|def|class)\b/.test(line))) return '';
  return '';
}

function syncSourceEditorTools() {
  const editor = $('#bot-source-editor');
  if (!editor) return;
  const highlight = $('#bot-source-highlight');
  if (highlight) {
    renderSourceHighlight(highlight, editor.value);
    highlight.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
  }
  const before = editor.value.slice(0, editor.selectionStart);
  const line = before.split('\n').length;
  const column = before.length - before.lastIndexOf('\n');
  const position = $('#source-cursor-position'); if (position) position.textContent = `Dòng ${line}, cột ${column}`;
  const bytes = new TextEncoder().encode(editor.value).byteLength;
  const byteCount = $('#source-byte-count'); if (byteCount) { byteCount.textContent = `${Math.ceil(bytes / 1024 * 10) / 10} / 64 KiB`; byteCount.classList.toggle('is-invalid', bytes > 64 * 1024); }
  const syntax = $('#source-syntax-status');
  if (syntax) { const message = sourceSyntaxCheck(editor.value, $('#bot-source-runtime')?.value); syntax.textContent = message || 'Cú pháp cơ bản hợp lệ'; syntax.title = message || ''; syntax.classList.toggle('is-invalid', Boolean(message)); syntax.classList.toggle('is-valid', !message); }
}

function sourceIndentOnEnter(editor) {
  const start = editor.selectionStart;
  const lineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
  const currentLine = editor.value.slice(lineStart, start);
  const indent = currentLine.match(/^\s*/)?.[0] || '';
  const extra = /(?:\{|:\s*)$/.test(currentLine.trim()) ? '  ' : '';
  const next = editor.value[start] === '}' || editor.value[start] === ']' || editor.value[start] === ')' ? indent.slice(0, -2) : indent;
  editor.setRangeText(`\n${next}${extra}`, start, editor.selectionEnd, 'end');
}

function sourceInsertPair(editor, open, close) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  editor.setRangeText(open + editor.value.slice(start, end) + close, start, end, 'end');
  editor.selectionStart = start + 1;
  editor.selectionEnd = end + 1;
}

function formatSourceCode() {
  const editor = $('#bot-source-editor'); if (!editor || editor.readOnly) return;
  const runtimeId = $('#bot-source-runtime')?.value;
  const lines = editor.value.split('\n');
  let level = 0;
  const formatted = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (runtimeId === 'cpp') {
      if (trimmed.startsWith('}')) level = Math.max(0, level - 1);
      const output = `${'  '.repeat(level)}${trimmed}`;
      if (trimmed.endsWith('{')) level += 1;
      return output;
    }
    return `${line.match(/^\s*/)?.[0] || ''}${trimmed}`;
  });
  editor.value = formatted.join('\n');
  updateEditorMetrics(); setSourceDirty(true);
}

function setWorkspaceStatus(text) {
  const status = $('#bot-source-status');
  if (status) status.textContent = text;
}

function syncWorkspaceStatus() {
  if (state.botWorkspaceReadOnly) setWorkspaceStatus('Chỉ đọc · Phiên bản bất biến');
  else if (state.sourceDirty) setWorkspaceStatus('Chưa lưu thay đổi');
  else setWorkspaceStatus(state.sourceWorkspaceBot ? 'Bản nháp mới' : 'Bản nháp mới');
}

function hasUnsavedBotWorkspaceChanges() {
  if (!state.sourceDirty) return false;
  const editor = $('#bot-source-editor');
  const runtime = $('#bot-source-runtime');
  const name = $('#bot-workspace-name');
  const githubUrl = $('#bot-github-url');
  return Boolean(editor && runtime && name && (
    editor.value !== state.sourceInitialSource
    || runtime.value !== state.sourceInitialRuntime
    || name.value.trim() !== state.sourceInitialName
    || Boolean(githubUrl?.value.trim())
  ));
}

function setSourceDirty(dirty) {
  state.sourceDirty = dirty;
  const marker = $('#bot-source-dirty');
  const saveButton = $('#save-bot-source');
  if (marker) marker.hidden = !dirty;
  if (saveButton) {
    const nameChanged = ($('#bot-workspace-name')?.value.trim() || '') !== state.botWorkspaceInitialName;
    const hasSource = Boolean($('#bot-source-editor')?.value.trim() || $('#bot-github-url')?.value.trim());
    saveButton.disabled = state.botWorkspaceMode === 'create' ? !hasSource : !(dirty || nameChanged);
  }
  if (dirty) persistBotWorkspaceDraft();
  updatePracticeButton();
  syncWorkspaceStatus();
}

function currentPracticeRevision() {
  const bot = state.sourceWorkspaceBot;
  return state.sourceRevisions.find(revision => revision.selected || revision.revisionId === bot?.currentRevisionId)
    || state.sourceRevisions.find(revision => ['cpp', 'python3'].includes(revision.runtimeId));
}

function updatePracticeButton() {
  const button = $('#run-bot-practice');
  if (!button) return;
  button.disabled = false;
  button.title = state.sourceDirty ? 'Hãy lưu phiên bản hiện tại trước khi chạy thử' : 'Đấu với Bot hệ thống cố định';
}

function renderRevisionList() {
  const list = $('#bot-revision-list');
  clear(list);
  $('#bot-revision-count').textContent = state.sourceRevisions.length ? `${state.sourceRevisions.length} phiên bản` : '0';
  if (!state.sourceRevisions.length) {
    const empty = create('div', { className: 'bot-revision-empty' });
    const emptyIcon = icon('icon-git-commit-horizontal');
    emptyIcon.classList.add('bot-revision-empty-icon');
    empty.append(emptyIcon, create('strong', { text: 'Chưa có phiên bản' }), create('span', { text: 'Tạo Bot để bắt đầu lưu các phiên bản mã nguồn.' }));
    list.appendChild(empty);
    return;
  }
  state.sourceRevisions.forEach(revision => {
    const item = create('article', { className: `bot-revision-item${revision.selected ? ' selected' : ''}` });
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    const activateRevision = () => revision.selected ? loadRevisionSource(revision, 'draft') : selectRevision(revision);
    const selectFromCard = event => {
      if (event.target.closest('button, details, a, input, select, textarea')) return;
      void activateRevision();
    };
    item.addEventListener('click', selectFromCard);
    item.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button, details, a, input, select, textarea')) {
        event.preventDefault();
        void activateRevision();
      }
    });
    const date = new Date(revision.createdAt);
    const meta = create('div', { className: 'bot-revision-meta' });
    const runtimeLabel = revision.runtimeId === 'cpp' ? 'C++17' : revision.runtimeId === 'python3' ? 'Python 3' : 'Node.js phiên bản cũ';
    meta.append(create('strong', { text: `${runtimeLabel} · ${revision.label || `Phiên bản ${revision.revisionId.slice(0, 8)}`}` }), create('span', { text: Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN') }));
    item.appendChild(meta);
    const technical = create('details', { className: 'bot-revision-technical' });
    technical.appendChild(create('summary', { text: 'Chi tiết kỹ thuật' }));
    if (revision.sourceDigest) technical.appendChild(create('div', { className: 'bot-revision-digest', text: `Mã nguồn · ${String(revision.sourceDigest).slice(0, 12)}…` }));
    if (revision.githubRepositoryUrl || revision.githubCommitSha) {
      const repository = revision.githubRepositoryUrl ? ` · ${revision.githubRepositoryUrl}` : '';
      const commit = revision.githubCommitSha ? ` · commit ${String(revision.githubCommitSha).slice(0, 12)}…` : '';
      technical.appendChild(create('div', { className: 'bot-revision-digest bot-revision-github', text: `Nguồn GitHub${repository}${commit}` }));
    }
    if (revision.executionMode) technical.appendChild(create('div', { className: 'bot-revision-digest', text: `Chế độ: ${revision.executionMode === 'strategy' ? 'Strategy SDK' : 'Mã nguồn trực tiếp'}` }));
    if (revision.sdkVersion) technical.appendChild(create('div', { className: 'bot-revision-digest', text: `SDK ${revision.sdkVersion}${revision.sdkDigest ? ` · ${revision.sdkDigest}` : ''}` }));
    item.appendChild(technical);
    const actions = create('div', { className: 'bot-revision-actions' });
    if (['cpp', 'python3'].includes(revision.runtimeId)) actions.appendChild(actionButton('Tạo bản nháp', () => void loadRevisionSource(revision, 'draft'), `draft-revision:${revision.revisionId}`, 'secondary-btn bot-action'));
    actions.appendChild(actionButton('Xóa', () => openDeleteRevisionDialog(revision), `delete-revision:${revision.revisionId}`, 'secondary-btn bot-action bot-delete'));
    item.appendChild(actions);
    list.appendChild(item);
  });
  updatePracticeButton();
}

function openDeleteRevisionDialog(revision) {
  state.deletingRevision = revision;
  state.revisionDeleteDialogRevision += 1;
  $('#delete-revision-name').textContent = revision.label || revision.revisionId.slice(0, 8);
  $('#delete-revision-error').textContent = '';
  $('#delete-revision-error').hidden = true;
  openModal('delete-revision-modal');
}

async function deleteRevision() {
  const revision = state.deletingRevision;
  const bot = state.sourceWorkspaceBot;
  if (!bot || !revision) return;
  const dialogRevision = state.revisionDeleteDialogRevision;
  let failure = null;
  try {
    await runPending(`confirm-delete-revision:${revision.revisionId}`, $('#confirm-delete-revision'), async () => {
      try { await api(`/bots/${bot.id}/revisions/${revision.revisionId}`, { method: 'DELETE' }); }
      catch (error) { failure = error; throw error; }
    });
    if (failure) throw failure;
    if (state.revisionDeleteDialogRevision !== dialogRevision) return;
    closeModal('delete-revision-modal');
    await loadBotRevisions(bot);
    showToast('Đã xóa phiên bản.', 'success');
  } catch (error) {
    if (state.revisionDeleteDialogRevision === dialogRevision) {
      $('#delete-revision-error').textContent = localizeErrorMessage(error.message || 'Không thể xóa phiên bản.');
      $('#delete-revision-error').hidden = false;
    }
  }
}

async function loadRevisionSource(revision, mode = 'view', confirmBeforeReplace = true) {
  if (confirmBeforeReplace && hasUnsavedBotWorkspaceChanges() && !window.confirm('Bạn có thay đổi chưa lưu. Tiếp tục sẽ thay thế nội dung hiện tại?')) return;
  setSourceError();
  try {
    const result = await request(`/bots/${revision.botId}/revisions/${revision.revisionId}`);
    $('#bot-source-editor').value = result.source;
    updateEditorMetrics();
    $('#bot-source-runtime').value = ['cpp', 'python3'].includes(revision.runtimeId) ? revision.runtimeId : '';
    state.sourceRuntime = $('#bot-source-runtime').value || 'cpp';
    state.sourceInitialSource = result.source;
    state.sourceInitialRuntime = state.sourceRuntime;
    updateSourceRuntimeMeta($('#bot-source-runtime').value);
    updateSourceModeMeta(revision.executionMode, revision.sdkVersion);
    state.sourceExecutionMode = revision.executionMode || 'raw';
    state.botWorkspaceReadOnly = mode !== 'draft';
    state.botWorkspaceDraftBase = mode === 'draft' ? revision.revisionId : null;
    $('#bot-source-editor').readOnly = state.botWorkspaceReadOnly;
    setWorkspaceStatus(state.botWorkspaceReadOnly ? 'Chỉ đọc · Phiên bản bất biến' : 'Bản nháp từ phiên bản đã lưu');
    // Opening a revision as an editable draft does not itself change the
    // source. Mark it dirty only after the editor emits an input event.
    setSourceDirty(false);
  } catch (error) { setSourceError(error.message || 'Không thể đọc phiên bản mã nguồn.'); }
}

async function loadBotRevisions(bot) {
  state.sourceRevisions = await request(`/bots/${bot.id}/revisions`);
  renderRevisionList();
  const selected = state.sourceRevisions.find(revision => revision.selected);
  if (selected) await loadRevisionSource(selected, 'view', false);
  else {
    $('#bot-source-editor').value = STRATEGY_TEMPLATES.cpp;
    $('#bot-source-editor').readOnly = false;
    state.botWorkspaceReadOnly = false;
    state.sourceExecutionMode = 'strategy';
    updateSourceModeMeta('strategy', '1.0.0');
    setWorkspaceStatus('Bản nháp mới');
    // Loading the starter template is not a user edit. Only subsequent
    // input/runtime changes should make the workspace dirty.
    setSourceDirty(false);
  }
}

function enhanceBotWorkspaceIcons() {
  const saveButton = $('#save-bot-source');
  if (saveButton && !saveButton.querySelector('svg')) {
    const saveIcon = icon('icon-save'); saveIcon.classList.add('ui-icon'); saveButton.prepend(saveIcon);
  }
  const editorHead = $('.bot-editor-panel .editor-panel-head');
  if (editorHead && !editorHead.querySelector('.workspace-file-icon')) {
    const fileIcon = icon('icon-file-code-2'); fileIcon.classList.add('workspace-file-icon'); editorHead.prepend(fileIcon);
  }
  const revisionHead = $('.bot-revision-heading');
  if (revisionHead && !revisionHead.querySelector('.workspace-revision-icon')) {
    const revisionIcon = icon('icon-git-commit-horizontal'); revisionIcon.classList.add('workspace-revision-icon'); revisionHead.prepend(revisionIcon);
  }
}

function renderBotWorkspacePicker(selectedBotId = '') {
  const picker = $('#bot-workspace-picker');
  if (!picker) return;
  picker.replaceChildren(new Option('Tạo Bot mới', ''));
  state.bots.forEach(bot => picker.appendChild(new Option(bot.name, bot.id)));
  picker.value = selectedBotId || '';
  picker.disabled = state.bots.length === 0;
}

async function ensureBotWorkspaceBots(force = false) {
  if (!force && (state.bots.length || state.user?.role !== 'competitor')) return;
  try {
    state.bots = await request('/bots');
  } catch {
    // The workspace can still create a new Bot when the list request fails.
    state.bots = [];
  }
}

async function restoreBotWorkspace() {
  await ensureBotWorkspaceBots(true);
  const selectedBot = state.bots.find(bot => bot.id === readBotWorkspaceSelection()) || null;
  await openBotWorkspace(selectedBot);
}

async function openBotWorkspace(bot = null) {
  if (state.activeView !== 'bot-workspace') state.botWorkspaceSource = state.activeView;
  if (hasUnsavedBotWorkspaceChanges() && state.sourceWorkspaceBot?.id !== bot?.id && !window.confirm('Bạn có thay đổi chưa lưu. Tiếp tục sẽ đóng nội dung hiện tại?')) return;
  state.botWorkspaceMode = bot ? 'edit' : 'create';
  state.sourceWorkspaceBot = bot;
  state.botWorkspaceReadOnly = false;
  state.sourceExecutionMode = bot ? 'raw' : 'strategy';
  persistBotWorkspaceSelection(bot?.id || '');
  const savedDraft = readBotWorkspaceDraft();
  const useDraft = Boolean(savedDraft && (!bot ? !savedDraft.botId : savedDraft.botId === bot.id));
  state.botWorkspaceDraftBase = null;
  const pendingInitial = !bot && state.pendingInitialRevision;
  if (!bot && !pendingInitial) state.pendingInitialRevision = null;
  if (!navigate('bot-workspace')) return;
  await ensureBotWorkspaceBots();
  renderBotWorkspacePicker(bot?.id || '');
  enhanceBotWorkspaceIcons();
  const pageTitle = $('#page-title');
  if (pageTitle) pageTitle.textContent = bot ? 'Chỉnh sửa Bot' : 'Tạo Bot';
  $('#bot-workspace-name').value = useDraft ? savedDraft.name : (bot?.name || '');
  state.botWorkspaceInitialName = bot?.name || '';
  $('#save-bot-source').textContent = bot ? 'Lưu phiên bản' : 'Tạo Bot';
  $('#bot-source-runtime').value = useDraft ? savedDraft.runtimeId : 'cpp';
  $('#bot-github-url').value = '';
  state.sourceRuntime = useDraft ? savedDraft.runtimeId : 'cpp';
  state.sourceInitialRuntime = $('#bot-source-runtime').value;
  state.sourceInitialName = bot?.name || '';
  updateSourceRuntimeMeta(state.sourceRuntime);
  updateSourceModeMeta(bot ? '' : 'strategy', bot ? '' : '1.0.0');
  $('#bot-source-editor').value = useDraft ? savedDraft.source : (bot ? '' : STRATEGY_TEMPLATES.cpp);
  state.sourceInitialSource = $('#bot-source-editor').value;
  updateEditorMetrics();
  $('#bot-source-editor').readOnly = false;
  setWorkspaceStatus(bot ? 'Đang chuẩn bị bản nháp' : 'Bản nháp mới');
  // A new workspace starts with a built-in template. Loading that template is
  // not a user change, so leaving immediately must not show an unsaved warning.
  setSourceDirty(useDraft);
  if (pendingInitial) {
    $('#bot-workspace-name').value = pendingInitial.bot.name;
    $('#bot-source-runtime').value = pendingInitial.runtimeId;
    $('#bot-source-editor').value = pendingInitial.source;
    updateEditorMetrics();
    $('#save-bot-source').textContent = 'Thử lưu mã nguồn';
    setSourceDirty(true);
  }
  setSourceError();
  if (bot) {
    try { await loadBotRevisions(bot); }
    catch (error) { state.sourceRevisions = []; renderRevisionList(); setSourceError(error.message || 'Không thể tải lịch sử phiên bản.'); }
  } else {
    state.sourceRevisions = [];
    renderRevisionList();
  }
  if (useDraft) {
    $('#bot-source-editor').value = savedDraft.source;
    $('#bot-source-runtime').value = savedDraft.runtimeId;
    state.sourceRuntime = savedDraft.runtimeId;
    updateSourceRuntimeMeta(savedDraft.runtimeId);
    updateEditorMetrics();
    setSourceDirty(true);
  }
  (bot ? $('#bot-source-editor') : $('#bot-workspace-name')).focus();
}

function openSourceWorkspace(bot) { return openBotWorkspace(bot); }

async function saveBotSource() {
  const bot = state.sourceWorkspaceBot;
  if (!bot || state.botWorkspaceReadOnly) return;
  const source = $('#bot-source-editor').value;
  const runtimeId = $('#bot-source-runtime').value;
  setSourceError();
  if (!source.trim()) return setSourceError('Mã nguồn không được để trống.');
  if (!['cpp', 'python3'].includes(runtimeId)) return setSourceError('Hãy chọn C++17 hoặc Python 3 cho phiên bản mới.');
  if (new TextEncoder().encode(source).byteLength > 64 * 1024) return setSourceError('Mã nguồn không được vượt quá 64 KiB.');
  setWorkspaceStatus('Đang lưu phiên bản…');
  const result = await runPending(`save-source:${bot.id}`, $('#save-bot-source'), async () => {
    let revision = state.pendingSourceRevision?.revision || null;
    try {
      revision = revision || await api(`/bots/${bot.id}/revisions`, { method: 'POST', body: JSON.stringify({ source, runtimeId, executionMode: state.sourceExecutionMode }) });
      state.pendingSourceRevision = { revision, source };
      await api(`/bots/${bot.id}/revisions/${revision.revisionId}/select`, { method: 'POST', body: JSON.stringify({}) });
      state.pendingSourceRevision = null;
      setSourceDirty(false);
      if (typeof clearBotWorkspaceDraft === 'function') clearBotWorkspaceDraft();
      await loadBotRevisions(bot);
      showToast('Đã lưu phiên bản mã nguồn.', 'success');
    } catch (error) { setSourceError(error.message || 'Không thể lưu phiên bản mã nguồn.'); setSourceDirty(true); setWorkspaceStatus('Lưu thất bại · Kiểm tra lỗi bên dưới'); throw error; }
    return true;
  });
  return result === true;
}

async function selectRevision(revision) {
  const bot = state.sourceWorkspaceBot;
  if (!bot) return;
  if (hasUnsavedBotWorkspaceChanges() && !window.confirm('Bạn có thay đổi chưa lưu. Chọn phiên bản này sẽ thay thế nội dung hiện tại. Tiếp tục?')) return;
  try {
    await api(`/bots/${bot.id}/revisions/${revision.revisionId}/select`, { method: 'POST', body: JSON.stringify({}) });
    bot.currentRevisionId = revision.revisionId;
    await loadBotRevisions(bot);
    await loadRevisionSource(revision, 'draft', false);
    showToast('Đã chọn phiên bản mã nguồn.', 'success');
  } catch (error) { setSourceError(error.message || 'Không thể chọn phiên bản mã nguồn.'); }
}


function showBotFormError(message, field = null) {
  const error = field === 'bot-workspace-name' ? $('#bot-name-error') : $('#bot-source-error');
  const nameError = $('#bot-name-error');
  const sourceError = $('#bot-source-error');
  ['bot-workspace-name', 'bot-source-runtime', 'bot-source-editor', 'bot-github-url'].forEach(id => document.getElementById(id)?.removeAttribute('aria-invalid'));
  if (field) document.getElementById(field)?.setAttribute('aria-invalid', 'true');
  if (nameError && nameError !== error) { nameError.textContent = ''; nameError.hidden = true; }
  if (sourceError && sourceError !== error) { sourceError.textContent = ''; sourceError.hidden = true; }
  error.textContent = message;
  error.hidden = false;
}
function clearBotFormError() {
  const error = $('#bot-source-error');
  const nameError = $('#bot-name-error');
  ['bot-workspace-name', 'bot-source-runtime', 'bot-source-editor', 'bot-github-url'].forEach(id => document.getElementById(id)?.removeAttribute('aria-invalid'));
  error.textContent = '';
  error.hidden = true;
  if (nameError) { nameError.textContent = ''; nameError.hidden = true; }
}

function botNameInput() {
  const name = $('#bot-workspace-name').value.trim();
  if (!name || name.length > 50) return { error: 'Tên Bot phải có từ 1 đến 50 ký tự.', field: 'bot-workspace-name' };
  return { name };
}

function botSourceInput() {
  const runtimeId = $('#bot-source-runtime').value;
  const source = $('#bot-source-editor').value;
  const githubUrl = $('#bot-github-url')?.value.trim();
  if (!['cpp', 'python3'].includes(runtimeId)) return { error: 'Hãy chọn C++17 hoặc Python 3.', field: 'bot-source-runtime' };
  if (githubUrl) {
    try { parseClientGithubUrl(githubUrl); }
    catch { return { error: 'URL GitHub không hợp lệ hoặc không trỏ tới main.cpp/main.py công khai.', field: 'bot-github-url' }; }
    return { runtimeId, githubUrl };
  }
  if (!source.trim()) return { error: 'Mã nguồn không được để trống.', field: 'bot-source-editor' };
  if (new TextEncoder().encode(source).byteLength > 64 * 1024) return { error: 'Mã nguồn không được vượt quá 64 KiB.', field: 'bot-source-editor' };
  const syntaxError = sourceSyntaxCheck(source, runtimeId);
  if (syntaxError) return { error: syntaxError, field: 'bot-source-editor' };
  return { runtimeId, source };
}

async function saveGitHubRevision(bot, sourceInput) {
  const parsed = parseClientGithubUrl(sourceInput.githubUrl);
  const candidates = await clientGithubCandidates(parsed, sourceInput.runtimeId);
  const compatible = candidates.filter(item => item.filename === (sourceInput.runtimeId === 'cpp' ? 'main.cpp' : 'main.py'));
  if (!compatible.length) throw new Error(`Repository không có file ${sourceInput.runtimeId === 'cpp' ? 'main.cpp' : 'main.py'} ở thư mục gốc.`);
  if (parsed.kind === 'file' && compatible[0].filename !== parsed.filename) throw new Error('File GitHub không khớp với ngôn ngữ đã chọn.');
  const selected = compatible[0];
  const source = await readClientGithubText(await fetch(selected.rawUrl, { credentials: 'omit', mode: 'cors', redirect: 'error' }));
  if (!source.trim()) throw new Error('File mã nguồn GitHub đang trống.');
  const syntaxError = sourceSyntaxCheck(source, sourceInput.runtimeId);
  if (syntaxError) throw new Error(syntaxError);
  const body = { source, runtimeId: sourceInput.runtimeId, executionMode: state.sourceExecutionMode };
  const commitSha = /^[0-9a-f]{40}$/i.test(selected.ref) ? selected.ref.toLowerCase() : null;
  if (selected.repositoryUrl && commitSha) Object.assign(body, { githubRepositoryUrl: selected.repositoryUrl, githubCommitSha: commitSha });
  const revision = await api(`/bots/${bot.id}/revisions`, { method: 'POST', body: JSON.stringify(body) });
  await api(`/bots/${bot.id}/revisions/${revision.revisionId}/select`, { method: 'POST', body: JSON.stringify({}) });
  return { ...revision, githubCommitSha: commitSha };
}

function openBotDialog(bot = null) {
  return openBotWorkspace(bot);
}

async function saveInitialRevision(bot, source, runtimeId, existingRevision = null) {
  const revision = existingRevision || await api(`/bots/${bot.id}/revisions`, {
    method: 'POST',
    body: JSON.stringify({ source, runtimeId, executionMode: 'strategy' }),
  });
  await api(`/bots/${bot.id}/revisions/${revision.revisionId}/select`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return revision;
}

async function submitBot() {
  const button = $('#save-bot-source');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const editingBot = state.sourceWorkspaceBot;
  const isBotView = () => isCurrentView('bot-workspace', authRevision, viewRevision);
  const nameInput = botNameInput();
  clearBotFormError();
  if (nameInput.error) return showBotFormError(nameInput.error, nameInput.field);
  const sourceInput = editingBot && !state.sourceDirty ? null : botSourceInput();
  if (sourceInput?.error) return showBotFormError(sourceInput.error, sourceInput.field);
  let operationSucceeded = false;
  let createdBot = null;
  await runPending(editingBot ? `save-bot:${editingBot.id}` : 'create-bot', button, async () => {
    if (editingBot) {
      try {
        if (nameInput.name !== editingBot.name) await api(`/bots/${editingBot.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: nameInput.name, command: editingBot.command, args: editingBot.args }),
        });
        if (sourceInput?.githubUrl) {
          setWorkspaceStatus('Đang tải mã nguồn từ GitHub…');
          const revision = await saveGitHubRevision(editingBot, sourceInput);
          $('#bot-github-url').value = '';
          setSourceDirty(false);
          await loadBotRevisions(editingBot);
          const revisionLabel = revision.githubCommitSha ? ` ${revision.githubCommitSha.slice(0, 8)}` : '';
          showToast(`Đã nhập revision${revisionLabel} từ GitHub.`, 'success');
        } else if (state.sourceDirty && !(await saveBotSource())) throw new Error('Không thể hoàn tất việc chọn phiên bản mã nguồn.');
      } catch (error) {
        if (isBotView()) showBotFormError(error.message || 'Không thể lưu Bot hoặc phiên bản mã nguồn.');
        throw error;
      }
    } else {
      let bot = state.pendingInitialRevision?.bot;
      const source = sourceInput?.source || state.pendingInitialRevision?.source;
      const runtimeId = sourceInput?.runtimeId || state.pendingInitialRevision?.runtimeId;
      let revision = state.pendingInitialRevision?.revision || null;
      try {
        if (!bot) {
          bot = await api('/bots', {
            method: 'POST',
            body: JSON.stringify({ name: nameInput.name, command: 'node', args: [] }),
          });
        }
        createdBot = bot;
        if (!runtimeId) throw new Error('Mã nguồn ban đầu chưa sẵn sàng.');
        revision = sourceInput?.githubUrl
          ? await saveGitHubRevision(bot, sourceInput)
          : await saveInitialRevision(bot, source || '', runtimeId, revision);
        state.pendingInitialRevision = null;
      } catch (error) {
        if (bot) {
          state.pendingInitialRevision = { bot, source, runtimeId, revision };
          if (isBotView()) {
            showBotFormError('Bot đã được tạo nhưng phiên bản mã nguồn chưa lưu. Kiểm tra lỗi và bấm lại để thử lưu, không cần tạo Bot mới.');
            $('#save-bot-source').textContent = 'Thử lưu mã nguồn';
          }
        } else if (isBotView()) {
          showBotFormError(error.message || 'Không thể tạo Bot.');
        }
        throw error;
      }
    }
    if (!isBotView()) return;
    operationSucceeded = true;
    showToast(editingBot ? 'Đã cập nhật tên Bot.' : 'Đã tạo Bot và lưu phiên bản mã nguồn.', 'success');
    state.sourceDirty = false;
    state.pendingInitialRevision = null;
    if (typeof clearBotWorkspaceDraft === 'function') clearBotWorkspaceDraft();
    navigate('bots');
    await loadBots();
    if (!editingBot && createdBot) {
      const created = state.bots.find(item => item.id === createdBot.id) || createdBot;
      await openBotWorkspace(created);
    }
  });
  if (!operationSucceeded) return;
}

function openDeleteBotDialog(bot) {
  state.deleteDialogRevision += 1;
  state.deletingBot = bot;
  $('#delete-bot-name').textContent = bot.name;
  const error = $('#delete-bot-error'); error.textContent = ''; error.hidden = true;
  openModal('delete-bot-modal');
}

async function deleteBot() {
  const bot = state.deletingBot;
  if (!bot) return;
  const button = $('#confirm-delete-bot');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  const dialogRevision = state.deleteDialogRevision;
  await runPending(`confirm-delete:${bot.id}`, button, async () => {
    try { await api(`/bots/${bot.id}`, { method: 'DELETE' }); }
    catch (error) { if (isCurrentView('bots', authRevision, viewRevision) && state.deleteDialogRevision === dialogRevision) { const message = $('#delete-bot-error'); message.textContent = error.message || 'Unable to delete bot.'; message.hidden = false; } throw error; }
    if (!isCurrentView('bots', authRevision, viewRevision)) return;
    if (state.deleteDialogRevision !== dialogRevision) { void loadBots(); return; }
    closeModal('delete-bot-modal');
    showToast('Đã xóa Bot.', 'success');
    await loadBots();
  });
}

async function loadTournaments() {
  const list = $('#tournaments-list');
  const authRevision = state.authRevision;
  const viewRevision = state.viewRevision;
  state.loading.add('tournaments');
  state.error = null;
  state.tournamentListError = null;
  const pageTitle = $('.tournaments-workspace-header h2');
  const pageDescription = $('.tournaments-workspace-header p');
  const isCompetitor = state.user?.role === 'competitor';
  if (isCompetitor) state.tournamentScope = 'all';
  if (pageTitle) pageTitle.textContent = isCompetitor ? 'Giải đấu' : 'Quản lý giải đấu';
  if (pageDescription) pageDescription.textContent = isCompetitor
    ? 'Khám phá giải đấu đang mở và theo dõi các giải bạn đã đăng ký hoặc tham gia.'
    : 'Tạo và quản lý các giải đấu giữa những Bot đã đăng ký.';
  $('#tournaments-toolbar').hidden = true;
  $('#open-tournament-modal').hidden = true;
  renderLoadingSkeleton(list, 'tournament-skeleton', 4);
  renderMessage(list, 'Đang tải danh sách giải đấu…');
  try {
    let response;
    // Only competitors use the public discovery projection. Organizers must
    // load their owner-scoped list; the discovery projection intentionally
    // omits ownership fields and must never render management actions.
    if (isCompetitor) {
      const [discoverablePayload, minePayload] = await Promise.all([
        request('/tournaments/discoverable'),
        request('/my/tournaments'),
      ]);
      const discoverable = Array.isArray(discoverablePayload) ? discoverablePayload : [];
      const mine = Array.isArray(minePayload) ? minePayload : [];
      const merged = new Map();
      discoverable
        .filter(tournament => tournament.status === 'registration_open' || tournament.status === 'running')
        .forEach(tournament => merged.set(tournament.tournamentId, tournament));
      mine.map(item => ({
        tournamentId: item.tournamentId,
        name: item.name,
        status: item.status,
        participantCount: item.participantCount ?? 0,
        participantId: item.participantId || null,
        myRequestStatus: item.request?.status || null,
        resultsPublishedAt: item.resultsPublishedAt || null,
        registrationOpen: Boolean(item.registrationOpen),
      })).forEach(tournament => {
        merged.set(tournament.tournamentId, { ...merged.get(tournament.tournamentId), ...tournament });
      });
      response = [...merged.values()];
    } else {
      response = await request('/tournaments');
    }
    if (!isCurrentView('tournaments', authRevision, viewRevision)) return;
    state.tournaments = Array.isArray(response) ? response : [];
    renderTournamentList();
  } catch (error) { if (isCurrentView('tournaments', authRevision, viewRevision)) { state.error = localizeErrorMessage(error.message || 'Không thể tải giải đấu.'); state.tournamentListError = state.error; $('#tournaments-count').textContent = 'Không thể tải giải đấu'; $('#tournaments-toolbar').hidden = true; $('#open-tournament-modal').hidden = false; renderMessage(list, state.error, loadTournaments); } }
  finally { state.loading.delete('tournaments'); }
}
