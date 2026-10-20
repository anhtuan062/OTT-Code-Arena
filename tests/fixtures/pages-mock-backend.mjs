import fs from 'node:fs';
import https from 'node:https';
import express from 'express';

const port = Number(process.argv[2]);
const keyPath = process.argv[3];
const certPath = process.argv[4];
if (!Number.isInteger(port) || !keyPath || !certPath) throw new Error('usage: pages-mock-backend.mjs <port> <key> <cert>');

const app = express();
app.use(express.json());
const csrfToken = 'qa-csrf-token';
const sessionCookie = 'ott_session=qa-session';
const authenticated = request => request.headers.cookie?.includes(sessionCookie);
const rejectUnauthorized = response => response.status(401).json({ error: 'unauthorized' });

app.post('/api/auth/login', (_request, response) => {
  response.cookie('ott_session', 'qa-session', { httpOnly: true, sameSite: 'lax', path: '/' });
  response.json({ user: { id: 'qa-organizer', role: 'organizer' }, csrfToken });
});
app.get('/api/auth/me', (request, response) => {
  if (!authenticated(request)) return rejectUnauthorized(response);
  response.json({ user: { id: 'qa-organizer', role: 'organizer' }, csrfToken });
});
app.post('/api/auth/logout', (request, response) => {
  if (!authenticated(request)) return rejectUnauthorized(response);
  response.clearCookie('ott_session', { path: '/' });
  response.status(204).end();
});
app.post('/api/csrf-action', (request, response) => {
  if (!authenticated(request)) return rejectUnauthorized(response);
  if (request.get('x-csrf-token') !== csrfToken) return response.status(403).json({ error: 'csrf' });
  response.json({ ok: true, body: request.body });
});
app.get('/api/forbidden', (_request, response) => response.status(403).json({ error: 'forbidden' }));
app.get('/api/error', (_request, response) => response.status(500).json({ error: 'backend-error' }));
app.get('/api/sse', (request, response) => {
  if (!authenticated(request)) return rejectUnauthorized(response);
  response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  response.flushHeaders();
  let sequence = 0;
  const timer = setInterval(() => {
    sequence += 1;
    response.write(`event: heartbeat\ndata: {"sequence":${sequence}}\n\n`);
  }, 250);
  const cleanup = () => clearInterval(timer);
  request.once('close', cleanup);
  setTimeout(() => { cleanup(); response.end(); }, 2_500).unref();
});

const server = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app);
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ ready: true, port })));
