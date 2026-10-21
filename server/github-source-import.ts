const GITHUB_HOST = 'github.com';
const GITHUB_API_HOST = 'api.github.com';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_GITHUB_RESPONSE_BYTES = 256 * 1024;
const MAX_GITHUB_SOURCE_BYTES = 64 * 1024;

function githubAuthHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export class GitHubSourceError extends Error {
  constructor(public readonly code: 'invalid-url' | 'not-found' | 'rate-limited' | 'network' | 'too-large' | 'invalid-archive' | 'missing-source', message: string) {
    super(message);
  }
}

export interface GitHubImportResult {
  repositoryUrl: string;
  commitSha: string;
  source: string;
}

export function parseGitHubRepositoryUrl(value: unknown): { owner: string; repository: string; repositoryUrl: string } {
  if (typeof value !== 'string' || value.length > 2048) throw new GitHubSourceError('invalid-url', 'URL repository GitHub không hợp lệ');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new GitHubSourceError('invalid-url', 'URL repository GitHub không hợp lệ'); }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== GITHUB_HOST || url.username || url.password || url.search || url.hash) {
    throw new GitHubSourceError('invalid-url', 'Chỉ chấp nhận URL HTTPS của repository GitHub công khai');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37})$/.test(parts[0]!) || !/^[A-Za-z0-9_.-]+$/.test(parts[1]!)) {
    throw new GitHubSourceError('invalid-url', 'URL repository GitHub phải có dạng https://github.com/owner/repository');
  }
  const owner = parts[0]!;
  const repository = parts[1]!.replace(/\.git$/i, '');
  if (!repository) throw new GitHubSourceError('invalid-url', 'URL repository GitHub không hợp lệ');
  return { owner, repository, repositoryUrl: `https://${GITHUB_HOST}/${owner}/${repository}` };
}

async function githubFetch(url: string, maxBytes: number): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== GITHUB_API_HOST) {
    throw new GitHubSourceError('network', 'Máy chủ tải mã nguồn không được phép');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal, headers: {
      accept: 'application/vnd.github+json', 'user-agent': 'ott-code-arena', ...githubAuthHeaders(),
    } });
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) throw new GitHubSourceError('too-large', 'Dữ liệu GitHub vượt quá giới hạn tải xuống');
    return response;
  } catch (error) {
    if (error instanceof GitHubSourceError) throw error;
    throw new GitHubSourceError('network', 'Không thể kết nối đến GitHub hoặc yêu cầu đã quá thời gian');
  } finally { clearTimeout(timer); }
}

async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new GitHubSourceError('network', 'GitHub không trả về dữ liệu');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new GitHubSourceError('too-large', 'Dữ liệu GitHub vượt quá giới hạn tải xuống'); }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof GitHubSourceError) throw error;
    throw new GitHubSourceError('network', 'Không thể tải dữ liệu từ GitHub');
  }
}

async function readJsonLimited(response: Response): Promise<Record<string, unknown>> {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readLimited(response, MAX_GITHUB_RESPONSE_BYTES));
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not-object');
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof GitHubSourceError) throw error;
    throw new GitHubSourceError('invalid-archive', 'GitHub trả về dữ liệu JSON không hợp lệ');
  }
}

function decodeSource(body: Record<string, unknown>, filename: string): string {
  if (body.type !== 'file' || body.path !== filename || body.name !== filename || body.encoding !== 'base64' || typeof body.content !== 'string') {
    throw new GitHubSourceError('invalid-archive', `GitHub không trả về file ${filename} hợp lệ ở thư mục gốc`);
  }
  const normalized = body.content.replace(/\s+/g, '');
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new GitHubSourceError('invalid-archive', 'Nội dung source GitHub không phải base64 hợp lệ');
  }
  const sourceBytes = Buffer.from(normalized, 'base64');
  if (sourceBytes.byteLength > MAX_GITHUB_SOURCE_BYTES) throw new GitHubSourceError('too-large', 'Source GitHub vượt quá giới hạn kích thước');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes); }
  catch { throw new GitHubSourceError('invalid-archive', 'Mã nguồn GitHub phải là UTF-8 hợp lệ'); }
}

function throwResponseError(response: Response, notFoundMessage: string, invalidMessage: string): never {
  if (response.status === 404) throw new GitHubSourceError('not-found', notFoundMessage);
  if (response.status === 403 || response.status === 429) {
    const resetSeconds = Number(response.headers.get('x-ratelimit-reset'));
    const resetHint = Number.isFinite(resetSeconds) && resetSeconds > Math.floor(Date.now() / 1000)
      ? ` Khoảng ${Math.ceil((resetSeconds - Math.floor(Date.now() / 1000)) / 60)} phút nữa quota sẽ được làm mới.`
      : '';
    throw new GitHubSourceError('rate-limited', `GitHub đang giới hạn yêu cầu, hãy thử lại sau.${resetHint}`);
  }
  throw new GitHubSourceError('network', invalidMessage);
}

export async function importGitHubSource(githubUrl: unknown, runtimeId: 'cpp' | 'python3'): Promise<GitHubImportResult> {
  const repository = parseGitHubRepositoryUrl(githubUrl);
  const base = `https://${GITHUB_API_HOST}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}`;
  const metadata = await githubFetch(base, MAX_GITHUB_RESPONSE_BYTES);
  if (!metadata.ok) throwResponseError(metadata, 'Repository không tồn tại hoặc không công khai', 'Không thể xác minh repository GitHub');
  const body = await readJsonLimited(metadata);
  if (body.private === true || typeof body.default_branch !== 'string') throw new GitHubSourceError('not-found', 'Repository phải là công khai và có nhánh mặc định');

  const commit = await githubFetch(`${base}/commits/${encodeURIComponent(body.default_branch)}`, MAX_GITHUB_RESPONSE_BYTES);
  if (!commit.ok) throwResponseError(commit, 'Không thể xác định commit của repository', 'Không thể xác định commit của repository');
  const commitBody = await readJsonLimited(commit);
  if (typeof commitBody.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(commitBody.sha)) throw new GitHubSourceError('network', 'GitHub trả về commit không hợp lệ');

  const filename = runtimeId === 'cpp' ? 'main.cpp' : 'main.py';
  const sourceResponse = await githubFetch(`${base}/contents/${filename}?ref=${encodeURIComponent(commitBody.sha)}`, MAX_GITHUB_RESPONSE_BYTES);
  if (sourceResponse.status === 404) throw new GitHubSourceError('missing-source', `Repository không có file ${filename} ở thư mục gốc`);
  if (!sourceResponse.ok) throwResponseError(sourceResponse, `Không thể tải file ${filename}`, 'Không thể tải source từ GitHub');
  return { repositoryUrl: repository.repositoryUrl, commitSha: commitBody.sha.toLowerCase(), source: decodeSource(await readJsonLimited(sourceResponse), filename) };
}
