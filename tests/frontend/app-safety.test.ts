import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const readProjectFile = (name: string) => readFile(resolve(process.cwd(), name), 'utf8');

describe('SPA rendering and request foundations', () => {
  it('does not use HTML insertion sinks for browser-rendered API data', async () => {
    const app = await readProjectFile('app.js');

    expect(app).not.toMatch(/\.(?:innerHTML|outerHTML|insertAdjacentHTML)\s*[=(]/);
    expect(app).toContain('textContent');
    expect(app).toContain("use.setAttribute('href', `#${id}`)");
    expect(app).toContain('function safeStatusClass');
    expect(app).toContain("credentials: 'same-origin'");
    expect(app).toContain("headers['x-csrf-token']");
  });

  it('uses bound controls instead of inline event handlers', async () => {
    const page = await readProjectFile('index.html');

    expect(page).not.toMatch(/\son[a-z]+\s*=/i);
    expect(page).toContain('aria-live="polite"');
  });

  it('guards asynchronous view updates against session and navigation changes', async () => {
    const app = await readProjectFile('app.js');

    expect(app).toContain('authRevision');
    expect(app).toContain('viewRevision');
    expect(app).toContain('isCurrentView');
    expect(app).toContain("isCurrentView('tournament-detail'");
    expect(app).toContain('function trapModalFocus');
  });

  it('keeps the responsive shell controls bound through JavaScript', async () => {
    const [app, page] = await Promise.all([readProjectFile('app.js'), readProjectFile('index.html')]);

    expect(app).toContain('function toggleMobileNavigation');
    expect(app).toContain("$('#mobile-menu-toggle').addEventListener('click', toggleMobileNavigation)");
    expect(app).toContain('closeMobileNavigation();');
    expect(page).toContain('id="app-topbar"');
    expect(page).toContain('id="sidebar-backdrop"');
    expect(page).toContain('id="dash-queue-value"');
  });
});
