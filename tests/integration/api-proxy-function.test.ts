import { describe, expect, it } from 'vitest';
import { proxyRequest } from '../../functions/api/[[path]].js';

type CapturedRequest = { url: string; init: RequestInit & { duplex?: 'half' } };

function backendMock(captured: CapturedRequest[]) {
  return async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    captured.push({ url, init: init as CapturedRequest['init'] });
    if (url.includes('/api/forbidden')) return new Response('forbidden', { status: 403 });
    if (url.includes('/api/sse')) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: ready\\ndata: one\\n\\n'));
          controller.enqueue(new TextEncoder().encode('data: two\\n\\n'));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
    }
    if (url.includes('/api/echo')) {
      const body = init.body instanceof ReadableStream ? await new Response(init.body).text() : String(init.body ?? '');
      return new Response(JSON.stringify({ method: init.method, url, body, cookie: new Headers(init.headers).get('cookie'), csrf: new Headers(init.headers).get('x-csrf-token') }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'ott_session=abc; HttpOnly; SameSite=Lax' },
      });
    }
    if (url.includes('/api/slow')) return new Promise((resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
    throw new Error('mock backend offline');
  };
}

describe('Cloudflare API reverse proxy', () => {
  it('preserves GET query, cookies, authorization failures and response cookies', async () => {
    const captured: CapturedRequest[] = [];
    const fetchMock = backendMock(captured);
    const response = await proxyRequest(
      new Request('https://frontend.example/api/echo?scope=qa', { headers: { Cookie: 'ott_session=in', Authorization: 'Bearer test' } }),
      { OTT_API_BACKEND_ORIGIN: 'https://backend.example' },
      fetchMock,
    );
    expect(response.status).toBe(200);
    expect(captured[0]?.url).toBe('https://backend.example/api/echo?scope=qa');
    expect(response.headers.get('set-cookie')).toContain('ott_session=abc');
    expect(await response.json()).toMatchObject({ method: 'GET', cookie: 'ott_session=in' });

    const forbidden = await proxyRequest(new Request('https://frontend.example/api/forbidden'), { OTT_API_BACKEND_ORIGIN: 'https://backend.example' }, fetchMock);
    expect(forbidden.status).toBe(403);
  });

  it('preserves POST body, CSRF and streams SSE responses', async () => {
    const captured: CapturedRequest[] = [];
    const fetchMock = backendMock(captured);
    const post = await proxyRequest(
      new Request('https://frontend.example/api/echo', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-qa' }, body: '{"ok":true}' }),
      { OTT_API_BACKEND_ORIGIN: 'https://backend.example' },
      fetchMock,
    );
    expect(post.status).toBe(200);
    expect(await post.json()).toMatchObject({ method: 'POST', body: '{"ok":true}', csrf: 'csrf-qa' });
    expect(captured[0]?.init.duplex).toBe('half');

    const sse = await proxyRequest(new Request('https://frontend.example/api/sse'), { OTT_API_BACKEND_ORIGIN: 'https://backend.example' }, fetchMock);
    expect(sse.status).toBe(200);
    expect(sse.headers.get('content-type')).toContain('text/event-stream');
    expect(await sse.text()).toContain('data: two');
  });

  it('fails closed for missing or unsafe origins and reports backend outages/timeouts', async () => {
    const request = new Request('https://frontend.example/api/echo');
    expect((await proxyRequest(request, {})).status).toBe(503);
    expect((await proxyRequest(request, { OTT_API_BACKEND_ORIGIN: 'http://backend.example' })).status).toBe(503);
    expect((await proxyRequest(request, { OTT_API_BACKEND_ORIGIN: 'https://user:pass@backend.example' })).status).toBe(503);
    const fetchMock = backendMock([]);
    const offlineFetch = async () => { throw new Error('offline'); };
    expect((await proxyRequest(request, { OTT_API_BACKEND_ORIGIN: 'https://backend.example' }, offlineFetch)).status).toBe(502);
    expect((await proxyRequest(new Request('https://frontend.example/api/slow'), { OTT_API_BACKEND_ORIGIN: 'https://backend.example', OTT_API_PROXY_TIMEOUT_MS: '1000' }, fetchMock)).status).toBe(504);
  });

  it('does not apply the connection timeout after SSE headers are received', async () => {
    const delayedStreamFetch: typeof fetch = async (_input, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          setTimeout(() => controller.enqueue(new TextEncoder().encode('data: heartbeat\\n\\n')), 1_100);
          setTimeout(() => controller.close(), 1_150);
        },
        cancel() {
          init?.signal?.removeEventListener('abort', () => undefined);
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
    const response = await proxyRequest(
      new Request('https://frontend.example/api/sse'),
      { OTT_API_BACKEND_ORIGIN: 'https://backend.example', OTT_API_PROXY_TIMEOUT_MS: '1000' },
      delayedStreamFetch,
    );
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('heartbeat');
  });

  it('allows response-body cancellation to propagate to the upstream stream', async () => {
    let cancelled = false;
    const fetchMock: typeof fetch = async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: open\\n\\n'));
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
    const response = await proxyRequest(
      new Request('https://frontend.example/api/sse'),
      { OTT_API_BACKEND_ORIGIN: 'https://backend.example' },
      fetchMock,
    );
    expect(response.status).toBe(200);
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(cancelled).toBe(true);
  });
});
