import { inflateRawSync } from 'node:zlib';

const GITHUB_HOST = 'github.com';
const GITHUB_API_HOST = 'api.github.com';
const GITHUB_ARCHIVE_HOST = 'codeload.github.com';
const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_GITHUB_ARCHIVE_BYTES = 2 * 1024 * 1024;
export const MAX_GITHUB_ARCHIVE_FILES = 64;
export const MAX_GITHUB_EXPANDED_BYTES = 512 * 1024;

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
  if (![GITHUB_API_HOST, GITHUB_ARCHIVE_HOST].includes(parsed.hostname) || parsed.protocol !== 'https:') {
    throw new GitHubSourceError('network', 'Máy chủ tải mã nguồn không được phép');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal, headers: { accept: 'application/vnd.github+json', 'user-agent': 'ott-code-arena' } });
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) throw new GitHubSourceError('too-large', 'Source archive vượt quá giới hạn tải xuống');
    return response;
  } catch (error) {
    if (error instanceof GitHubSourceError) throw error;
    throw new GitHubSourceError('network', 'Không thể kết nối đến GitHub hoặc yêu cầu đã quá thời gian');
  } finally { clearTimeout(timer); }
}

async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new GitHubSourceError('network', 'GitHub không trả về dữ liệu mã nguồn');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new GitHubSourceError('too-large', 'Source archive vượt quá giới hạn tải xuống'); }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof GitHubSourceError) throw error;
    throw new GitHubSourceError('network', 'Không thể tải source archive từ GitHub');
  }
}

function zipError(message: string): never { throw new GitHubSourceError('invalid-archive', message); }

function readZipSource(archive: Buffer, filename: string): string {
  // Parse the central directory: entries are inspected before extraction, so no
  // archive path is ever written to disk and ZIP Slip/symlink entries are rejected.
  const minOffset = Math.max(0, archive.length - 65_557);
  let eocd = -1;
  for (let offset = archive.length - 22; offset >= minOffset; offset--) if (archive.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  if (eocd < 0) zipError('Source archive không phải ZIP hợp lệ');
  const entries = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  let offset = archive.readUInt32LE(eocd + 16);
  if (entries > MAX_GITHUB_ARCHIVE_FILES || offset + centralSize > archive.length) zipError('Source archive vượt quá giới hạn hoặc không hợp lệ');
  let totalExpanded = 0;
  let matched: { localOffset: number; compressedSize: number; uncompressedSize: number; method: number } | undefined;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) zipError('Source archive không hợp lệ');
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameSize = archive.readUInt16LE(offset + 28);
    const extraSize = archive.readUInt16LE(offset + 30);
    const commentSize = archive.readUInt16LE(offset + 32);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localOffset = archive.readUInt32LE(offset + 42);
    const end = offset + 46 + nameSize + extraSize + commentSize;
    if (end > archive.length) zipError('Source archive không hợp lệ');
    const name = archive.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    const pathParts = name.replace(/\/$/, '').split('/');
    const mode = externalAttributes >>> 16;
    if (!name || name.includes('\\') || name.startsWith('/') || pathParts.some(part => !part || part === '.' || part === '..') || (mode & 0o170000) === 0o120000) {
      zipError('Source archive chứa đường dẫn hoặc liên kết không an toàn');
    }
    totalExpanded += uncompressedSize;
    if (totalExpanded > MAX_GITHUB_EXPANDED_BYTES) zipError('Source archive vượt quá giới hạn sau khi giải nén');
    const relativeName = name.split('/').slice(1).join('/'); // GitHub's archive root is intentionally discarded.
    if (relativeName === filename) matched = { localOffset, compressedSize, uncompressedSize, method };
    offset = end;
  }
  if (!matched) throw new GitHubSourceError('missing-source', `Repository không có file ${filename} ở thư mục gốc`);
  if (matched.localOffset + 30 > archive.length || archive.readUInt32LE(matched.localOffset) !== 0x04034b50) zipError('Source archive không hợp lệ');
  const nameSize = archive.readUInt16LE(matched.localOffset + 26);
  const extraSize = archive.readUInt16LE(matched.localOffset + 28);
  const start = matched.localOffset + 30 + nameSize + extraSize;
  const compressed = archive.subarray(start, start + matched.compressedSize);
  if (compressed.byteLength !== matched.compressedSize) zipError('Source archive không hợp lệ');
  let source: Buffer;
  try { source = matched.method === 0 ? compressed : matched.method === 8 ? inflateRawSync(compressed, { maxOutputLength: matched.uncompressedSize }) : zipError('Source archive dùng định dạng nén không được hỗ trợ'); }
  catch (error) { if (error instanceof GitHubSourceError) throw error; zipError('Không thể giải nén source archive'); }
  if (source.byteLength !== matched.uncompressedSize) zipError('Kích thước source archive không hợp lệ');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(source); }
  catch { zipError('Mã nguồn GitHub phải là UTF-8 hợp lệ'); }
}

export async function importGitHubSource(githubUrl: unknown, runtimeId: 'cpp' | 'python3'): Promise<GitHubImportResult> {
  const repository = parseGitHubRepositoryUrl(githubUrl);
  const metadata = await githubFetch(`https://${GITHUB_API_HOST}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}`, 256 * 1024);
  if (metadata.status === 404) throw new GitHubSourceError('not-found', 'Repository không tồn tại hoặc không công khai');
  if (metadata.status === 403 || metadata.status === 429) throw new GitHubSourceError('rate-limited', 'GitHub đang giới hạn yêu cầu, hãy thử lại sau');
  if (!metadata.ok) throw new GitHubSourceError('network', 'Không thể xác minh repository GitHub');
  const body = await metadata.json() as { private?: unknown; default_branch?: unknown };
  if (body.private === true || typeof body.default_branch !== 'string') throw new GitHubSourceError('not-found', 'Repository phải là công khai và có nhánh mặc định');
  const commit = await githubFetch(`https://${GITHUB_API_HOST}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}/commits/${encodeURIComponent(body.default_branch)}`, 256 * 1024);
  if (commit.status === 404) throw new GitHubSourceError('not-found', 'Không thể xác định commit của repository');
  if (commit.status === 403 || commit.status === 429) throw new GitHubSourceError('rate-limited', 'GitHub đang giới hạn yêu cầu, hãy thử lại sau');
  if (!commit.ok) throw new GitHubSourceError('network', 'Không thể xác định commit của repository');
  const commitBody = await commit.json() as { sha?: unknown };
  if (typeof commitBody.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(commitBody.sha)) throw new GitHubSourceError('network', 'GitHub trả về commit không hợp lệ');
  const archive = await githubFetch(`https://${GITHUB_ARCHIVE_HOST}/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}/zip/${commitBody.sha}`, MAX_GITHUB_ARCHIVE_BYTES);
  if (archive.status === 404) throw new GitHubSourceError('not-found', 'Không thể tải source archive của commit đã chọn');
  if (archive.status === 403 || archive.status === 429) throw new GitHubSourceError('rate-limited', 'GitHub đang giới hạn yêu cầu, hãy thử lại sau');
  if (!archive.ok) throw new GitHubSourceError('network', 'Không thể tải source archive từ GitHub');
  return { repositoryUrl: repository.repositoryUrl, commitSha: commitBody.sha.toLowerCase(), source: readZipSource(await readLimited(archive, MAX_GITHUB_ARCHIVE_BYTES), runtimeId === 'cpp' ? 'main.cpp' : 'main.py') };
}
