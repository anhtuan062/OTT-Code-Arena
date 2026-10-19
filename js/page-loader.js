async function loadPageFragments() {
  const placeholders = [...document.querySelectorAll('[data-page-fragment]')];
  await Promise.all(placeholders.map(async placeholder => {
    const source = placeholder.dataset.pageFragment;
    const expectedRoot = placeholder.dataset.pageRoot;
    const response = await fetch(source, { headers: { Accept: 'text/html' } });
    if (!response.ok) throw new Error(`Không thể tải ${source}: ${response.status}`);
    const markup = await response.text();
    const documentFragment = new DOMParser().parseFromString(markup, 'text/html');
    const root = documentFragment.body.firstElementChild;
    if (!root || root.id !== expectedRoot) throw new Error(`Fragment ${source} không đúng root ${expectedRoot}`);
    placeholder.replaceWith(root);
  }));
}

function showPageLoadError(error) {
  const shell = document.getElementById('app-shell') || document.body;
  const message = document.createElement('main');
  message.className = 'page-load-error';
  message.setAttribute('role', 'alert');
  message.innerHTML = '<h1>Không thể tải giao diện</h1><p>Hãy tải lại trang để thử lại.</p>';
  shell.append(message);
  console.error('[OTT Code Arena] Page loading failed', error);
}

function startApplication() {
  const script = document.createElement('script');
  script.src = `/app.js?v=registration-workspace-7`;
  script.async = false;
  document.body.append(script);
}

loadPageFragments().then(startApplication).catch(showPageLoadError);
