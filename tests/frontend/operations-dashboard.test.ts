import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readAssembledFrontendMarkup } from './frontend-fixtures';

const source = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('M7 organizer operations dashboard', () => {
  it('keeps the operations destination organizer-only and read-only', async () => {
    const [page, navigation] = await Promise.all([
      readAssembledFrontendMarkup(),
      source('js/navigation.js'),
    ]);
    expect(page).toContain('data-role="organizer" data-target="operations"');
    expect(page).toContain('id="ops-capacity-state"');
    expect(page).toContain('id="ops-tournaments"');
    expect(navigation).toContain("view === 'operations' && state.user?.role !== 'organizer'");
  });

  it('uses protected metrics data with bounded polling and cleanup', async () => {
    const operations = await source('js/operations.js');
    expect(operations).toContain("request('/system/metrics')");
    expect(operations).toContain("request('/system/queue')");
    expect(operations).toContain("window.setInterval(() => void refreshOperations(), 5000)");
    expect(operations).toContain('window.clearInterval(operationsPollTimer)');
    expect(operations).toContain("state.user?.role !== 'organizer'");
    expect(operations).toContain('metrics?.statuses?.[\'host.capacity.state\']');
    expect(operations).not.toContain('innerHTML');
  });
});
