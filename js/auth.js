function setAuthenticated(user, csrfToken) {
  state.authRevision += 1;
  state.user = user;
  state.csrfToken = csrfToken;
  $('#auth-screen').hidden = true;
  $('#app-nav').hidden = false;
  $('#app-topbar').hidden = false;
  $('#current-user').textContent = user.username;
  const roleLabel = $('#current-user-role');
  if (roleLabel) roleLabel.textContent = user.role === 'organizer' ? 'Ng\u01b0\u1eddi t\u1ed5 ch\u1ee9c' : 'Ng\u01b0\u1eddi ch\u01a1i';
  $('#dashboard-username').textContent = user.username;
  $('#user-avatar').textContent = user.username.slice(0, 1).toUpperCase();
  document.body.dataset.role = user.role;
  const bottomNavigation = $('.bottom-nav');
  if (bottomNavigation) bottomNavigation.hidden = false;
  document.querySelectorAll('.role-nav').forEach(link => { link.hidden = link.dataset.role !== user.role; });
  const competitor = user.role === 'competitor';
  const botCreateButton = $('#open-bot-modal');
  if (botCreateButton) botCreateButton.hidden = !competitor;
  const savedScope = typeof window !== 'undefined' && window.sessionStorage
    ? window.sessionStorage.getItem('ott_tournament_scope')
    : null;
  // The same hash is shared by both roles, so the role must determine the
  // default dataset before navigation. Organizers manage their tournaments;
  // competitors discover open tournaments unless they explicitly use “của tôi”.
  state.tournamentScope = competitor
    ? (savedScope === 'mine' ? 'mine' : 'discoverable')
    : 'managed';
  const hashView = typeof window !== 'undefined' && window.location.hash ? window.location.hash.slice(1) : '';
  const savedView = typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage.getItem('ott_active_view') : null;
  let targetView = (AUTHENTICATED_VIEWS.has(hashView) && document.getElementById(hashView))
    ? hashView
    : (AUTHENTICATED_VIEWS.has(savedView) && document.getElementById(savedView) ? savedView : 'dashboard');
  if (!competitor && (targetView === 'bots' || targetView === 'bot-workspace')) targetView = 'dashboard';
  navigate(targetView);
  if (targetView === 'bot-workspace' && typeof restoreBotWorkspace === 'function') void restoreBotWorkspace();
}

function showAuthScreen(message = '') {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem('ott_active_view');
    }
  } catch {}
  // End account-scoped UI work before exposing the auth screen. Without this
  // cleanup, a registration modal and its preflight result can remain visible
  // when another account signs in in the same browser tab.
  state.authRevision += 1;
  if (typeof stopRegistrationSubmissionPolling === 'function') stopRegistrationSubmissionPolling();
  state.registrationSubmission = null;
  state.tournamentRegistrationContext = null;
  const bottomNavigation = $('.bottom-nav');
  if (bottomNavigation) bottomNavigation.hidden = true;
  document.body.removeAttribute('data-role');
  const registrationStatus = $('#registration-submission-status');
  if (registrationStatus) registrationStatus.hidden = true;
  document.querySelectorAll('.modal-overlay.open').forEach(modal => closeModal(modal.id));
  const authScreen = $('#auth-screen');
  const registerForm = $('#register-form');
  const shouldResetAuthForm = authScreen.hidden || (registerForm && !registerForm.hidden);
  state.user = null;
  state.csrfToken = null;
  authScreen.hidden = false;
  $('#app-nav').hidden = true;
  $('#app-topbar').hidden = true;
  state.activeView = 'auth-screen';
  state.viewRevision += 1;
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page === authScreen));
  if (typeof window !== 'undefined' && window.location.hash !== '#auth-screen') {
    window.history.replaceState({ view: 'auth-screen' }, '', '#auth-screen');
  }
  if (shouldResetAuthForm) setAuthMode('login', false);
  if (message) setAuthMessage('login', message);
}

function setAuthMode(mode, shouldFocus = true) {
  if (state.pending.has('login') || state.pending.has('register')) return;
  const loginMode = mode === 'login';
  const loginForm = $('#login-form');
  const registerForm = $('#register-form');
  const loginSwitch = $('#show-login');
  const registerSwitch = $('#show-register');
  const title = $('#auth-title');
  if (!loginForm || !registerForm || !loginSwitch || !registerSwitch || !title) return;

  state.error = null;
  clearAuthMessage('login');
  clearAuthMessage('register');
  loginForm.classList.toggle('active-form', loginMode);
  registerForm.classList.toggle('active-form', !loginMode);
  loginForm.hidden = !loginMode;
  registerForm.hidden = loginMode;
  loginSwitch.hidden = loginMode;
  registerSwitch.hidden = !loginMode;
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  if (tabLogin) tabLogin.classList.toggle('active', loginMode);
  if (tabRegister) tabRegister.classList.toggle('active', !loginMode);
  
  // Update title based on mode
  if (loginMode) {
    title.textContent = 'Đăng nhập';
  } else {
    title.textContent = 'Tạo tài khoản';
  }

  // Clear form data and validation when switching modes
  if (loginMode) {
    $('#login-username').value = '';
    $('#login-password').value = '';
    $('#login-username').type = 'text';
    $('#login-password').type = 'password';
    $('#login-password-toggle').setAttribute('aria-expanded', 'false');
    $('#login-password-toggle').classList.remove('is-visible');
    $('#login-password-toggle').querySelector('.eye-icon').classList.remove('hidden');
    $('#login-password-toggle').querySelector('.eye-slash-icon').classList.add('hidden');
    clearErrors('login');
  } else {
    $('#register-username').value = '';
    $('#register-password').value = '';
    $('#register-username').type = 'text';
    $('#register-password').type = 'password';
    $('#register-password-toggle').setAttribute('aria-expanded', 'false');
    $('#register-password-toggle').classList.remove('is-visible');
    $('#register-password-toggle').querySelector('.eye-icon').classList.remove('hidden');
    $('#register-password-toggle').querySelector('.eye-slash-icon').classList.add('hidden');
    clearErrors('register');
  }

  if (shouldFocus) {
    setTimeout(() => {
      (loginMode ? $('#login-username') : $('#register-username')).focus();
    }, 100);
  }
}

function togglePassword(inputId, buttonId) {
  const input = $(`#${inputId}`);
  const button = $(`#${buttonId}`);
  if (!input || !button) return;
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  const eyeIcon = button.querySelector('.eye-icon');
  const eyeSlashIcon = button.querySelector('.eye-slash-icon');
  
  if (visible) {
    button.setAttribute('aria-label', 'Ẩn mật khẩu');
    button.classList.add('is-visible');
    eyeIcon.classList.add('hidden');
    eyeSlashIcon.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
  } else {
    button.setAttribute('aria-label', 'Hiện mật khẩu');
    button.classList.remove('is-visible');
    eyeIcon.classList.remove('hidden');
    eyeSlashIcon.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
  }
}

function validateField(field, fieldType) {
  const input = $(`#${field.id}`);
  const errorElement = $(`#${field.id}-error`);
  let isValid = true;
  let errorMessage = '';

  // Reset state
  input.setAttribute('aria-invalid', 'false');
  if (errorElement) {
    errorElement.textContent = '';
    errorElement.classList.remove('visible');
  }

  // Validation logic
  if (field.required && !input.value.trim()) {
    isValid = false;
    errorMessage = 'Trường này là bắt buộc.';
  } else if (fieldType === 'username' && input.value.trim()) {
    const username = input.value.trim();
    if (field.id === 'register-username' && username.length < 3) {
      isValid = false;
      errorMessage = 'Tên người dùng phải có ít nhất 3 ký tự.';
    } else if (username.length > 32) {
      isValid = false;
      errorMessage = 'Tên người dùng không được vượt quá 32 ký tự.';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      isValid = false;
      errorMessage = 'Tên người dùng chỉ được chứa chữ cái, số và dấu gạch dưới.';
    }
  } else if (fieldType === 'password' && input.value.trim()) {
    const password = input.value;
    if (password.length < 12) {
      isValid = false;
      errorMessage = 'Mật khẩu phải có ít nhất 12 ký tự.';
    } else if (password.length > 128) {
      isValid = false;
      errorMessage = 'Mật khẩu không được vượt quá 128 ký tự.';
    } else if (!/[A-Z]/.test(password)) {
      isValid = false;
      errorMessage = 'Mật khẩu phải chứa ít nhất một chữ hoa.';
    } else if (!/[a-z]/.test(password)) {
      isValid = false;
      errorMessage = 'Mật khẩu phải chứa ít nhất một chữ thường.';
    } else if (!/[0-9]/.test(password)) {
      isValid = false;
      errorMessage = 'Mật khẩu phải chứa ít nhất một chữ số.';
    }
  }

  if (!isValid) {
    input.setAttribute('aria-invalid', 'true');
    if (errorElement) {
      errorElement.textContent = errorMessage;
      errorElement.classList.add('visible');
    }
    return false;
  }

  return true;
}

function clearErrors(formType) {
  const form = formType === 'login' ? $('#login-form') : $('#register-form');
  const inputs = form.querySelectorAll('input[required]');
  inputs.forEach(input => {
    input.setAttribute('aria-invalid', 'false');
    const errorElement = document.getElementById(`${input.id}-error`);
    if (errorElement) {
      errorElement.textContent = '';
      errorElement.classList.remove('visible');
    }
  });
}

function setAuthMessage(formType, message, type = 'error') {
  const messageElement = document.getElementById(`${formType}-form-message`);
  if (!messageElement) return;
  messageElement.textContent = message || '';
  messageElement.dataset.type = type;
  messageElement.hidden = !message;
}

function clearAuthMessage(formType) {
  setAuthMessage(formType, '');
}

function initAuthMotion() {
  const screen = document.getElementById('auth-screen');
  if (!screen || screen.dataset.motionReady === 'true') return;
  screen.dataset.motionReady = 'true';
  screen.classList.add('motion-ready');

  ['.landing-hero', '.landing-strategy-showcase', '.landing-stats-section', '.landing-cta-section', '.landing-footer']
    .forEach(selector => screen.querySelectorAll(selector).forEach(element => element.remove()));

  screen.querySelectorAll('input[required]').forEach(input => {
    input.setAttribute('aria-required', 'true');
    const errorId = `${input.id}-error`;
    let error = document.getElementById(errorId);
    if (!error) {
      error = document.createElement('p');
      error.id = errorId;
      error.className = 'field-error';
      error.setAttribute('role', 'alert');
      input.closest('.form-group')?.append(error);
    }
    input.setAttribute('aria-describedby', errorId);
  });

  const features = screen.querySelector('.landing-features-section');
  const rules = screen.querySelector('.landing-rules-section');
  const workflow = screen.querySelector('.landing-workflow-section');
  if (features && rules && workflow && features.parentElement === screen) {
    screen.insertBefore(features, rules);
    screen.insertBefore(workflow, rules.nextElementSibling);
  }

  const revealItems = screen.querySelectorAll(
    '.auth-system-panel, .auth-card, .landing-rules-section, .landing-features-section, .landing-workflow-section, .landing-feature-card, .rule-card, .win-card, .workflow-step-card'
  );
  const reveal = element => element.classList.add('is-visible');

  if (!window.IntersectionObserver) {
    revealItems.forEach(reveal);
  } else {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    revealItems.forEach(element => observer.observe(element));
  }

  const board = screen.querySelector('.auth-system-board');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!board || reduceMotion) return;
  board.addEventListener('pointermove', event => {
    const rect = board.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    board.style.setProperty('--board-tilt-x', `${(x * 4).toFixed(2)}deg`);
    board.style.setProperty('--board-tilt-y', `${(-y * 4).toFixed(2)}deg`);
  }, { passive: true });
  board.addEventListener('pointerleave', () => {
    board.style.removeProperty('--board-tilt-x');
    board.style.removeProperty('--board-tilt-y');
  }, { passive: true });
}

function validateForm(formType) {
  const form = formType === 'login' ? $('#login-form') : $('#register-form');
  const inputs = form.querySelectorAll('input[required]');
  let isValid = true;

  inputs.forEach(input => {
    const fieldType = input.id === 'login-password'
      ? 'login-password'
      : (input.id.includes('username') ? 'username' : 'password');
    
    if (!validateField(input, fieldType)) {
      isValid = false;
    }
  });

  return isValid;
}

function updateButtonState(formType) {
  const form = formType === 'login' ? $('#login-form') : $('#register-form');
  if (!form) return;
  const submitButton = form.querySelector('.primary-btn');
  if (!submitButton) return;

  // Auth actions should always be actionable so submit-time errors can be shown in the form.
  // Only disable the active button while its request is already being submitted.
  if (formType === 'login' || formType === 'register') {
    submitButton.disabled = state.pending.has(formType);
    submitButton.classList.toggle('ready', !submitButton.disabled);
    return;
  }

  const isValid = validateForm(formType);
  
  if (isValid) {
    submitButton.disabled = false;
    submitButton.classList.add('ready');
  } else {
    submitButton.disabled = true;
    submitButton.classList.remove('ready');
  }
}

