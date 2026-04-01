import crypto from 'crypto';
import pool from '../config/database';

export type DigestType = 'news' | 'github' | 'paper';

export interface DigestHistoryInput {
  title?: string;
  source?: string;
  source_id?: string;
  canonical_url?: string;
  published_at?: string;
  dedupe_key?: string;
  doi?: string;
  arxiv_id?: string;
  openalex_id?: string;
  repo_full_name?: string;
  meta?: Record<string, unknown> | null;
}

export interface PreparedDigestHistoryEntry {
  digest_type: DigestType;
  dedupe_key: string;
  title: string | null;
  source: string | null;
  source_id: string | null;
  canonical_url: string | null;
  published_at: string | null;
  meta_json: string | null;
}

const DIGEST_TYPES: DigestType[] = ['news', 'github', 'paper'];

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'spm',
]);

function normalizeText(value?: string | null): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(value?: string | null): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashText(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 20);
}

function normalizeDoi(value?: string | null): string | null {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .toLowerCase();
}

function normalizeArxivId(value?: string | null): string | null {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return null;
  }

  const normalizedRaw = trimmed
    .replace(/^https?:\/\/arxiv\.org\/abs\//i, '')
    .replace(/^https?:\/\/arxiv\.org\/pdf\//i, '')
    .replace(/\.pdf$/i, '');

  const isModernArxivId = /^\d{4}\.\d{4,5}(v\d+)?$/i.test(normalizedRaw);
  const isLegacyArxivId = /^[a-z-]+(?:\.[a-z-]+)?\/\d{7}(v\d+)?$/i.test(normalizedRaw);

  if (isModernArxivId || isLegacyArxivId) {
    return normalizedRaw;
  }

  if (/^https?:\/\/arxiv\.org\//i.test(trimmed)) {
    return normalizedRaw || null;
  }

  return null;
}

function arxivIdFromCanonicalUrl(value?: string | null): string | null {
  if (!value || !/^https?:\/\/arxiv\.org\//i.test(value)) {
    return null;
  }

  return normalizeArxivId(value);
}

function openAlexIdFromCanonicalUrl(value?: string | null): string | null {
  if (!value || !/^https?:\/\/openalex\.org\//i.test(value)) {
    return null;
  }

  return normalizeOpenAlexId(value);
}

function normalizeOpenAlexId(value?: string | null): string | null {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\/openalex\.org\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }

  if (/^W\d+$/i.test(trimmed)) {
    return `https://openalex.org/${trimmed.toUpperCase()}`;
  }

  return null;
}

function canonicalizeUrl(value?: string | null): string | null {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    url.hash = '';
    const params = [...url.searchParams.keys()];
    for (const key of params) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

function githubRepoFromUrl(value?: string | null): string | null {
  const canonical = canonicalizeUrl(value);
  if (!canonical) {
    return null;
  }

  try {
    const url = new URL(canonical);
    if (!/github\.com$/i.test(url.hostname)) {
      return null;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) {
      return null;
    }

    return `${segments[0]}/${segments[1]}`.toLowerCase();
  } catch {
    return null;
  }
}

function mysqlDateTime(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function fallbackTitleKey(title?: string | null): string | null {
  const normalized = normalizeTitle(title);
  if (!normalized) {
    return null;
  }
  return `title:${hashText(normalized)}`;
}

export function isDigestType(value: unknown): value is DigestType {
  return typeof value === 'string' && DIGEST_TYPES.includes(value as DigestType);
}

export function prepareDigestHistoryEntry(digestType: DigestType, input: DigestHistoryInput): PreparedDigestHistoryEntry {
  const directKey = normalizeText(input.dedupe_key);
  const title = normalizeText(input.title) || null;
  const source = normalizeText(input.source) || null;
  const canonicalUrl = canonicalizeUrl(input.canonical_url);
  const doi = normalizeDoi(input.doi);
  const arxivId = normalizeArxivId(input.arxiv_id) || arxivIdFromCanonicalUrl(canonicalUrl);
  const openalexId = normalizeOpenAlexId(input.openalex_id) || openAlexIdFromCanonicalUrl(canonicalUrl);
  const repoFullName =
    normalizeText(input.repo_full_name).toLowerCase() ||
    githubRepoFromUrl(input.canonical_url) ||
    '';

  let dedupeKey = directKey;
  let sourceId = normalizeText(input.source_id) || null;

  if (!dedupeKey) {
    if (digestType === 'paper') {
      dedupeKey =
        (doi && `doi:${doi}`) ||
        (arxivId && `arxiv:${arxivId}`) ||
        (openalexId && `openalex:${openalexId}`) ||
        (canonicalUrl && `url:${canonicalUrl}`) ||
        fallbackTitleKey(title) ||
        '';
      sourceId = sourceId || doi || arxivId || openalexId || null;
    } else if (digestType === 'github') {
      dedupeKey =
        (repoFullName && `repo:${repoFullName}`) ||
        (canonicalUrl && `url:${canonicalUrl}`) ||
        fallbackTitleKey(title) ||
        '';
      sourceId = sourceId || repoFullName || null;
    } else {
      dedupeKey =
        (canonicalUrl && `url:${canonicalUrl}`) ||
        fallbackTitleKey(title) ||
        '';
      sourceId = sourceId || null;
    }
  }

  if (!dedupeKey) {
    throw new Error('无法生成去重键');
  }

  return {
    digest_type: digestType,
    dedupe_key: dedupeKey,
    title,
    source,
    source_id: sourceId,
    canonical_url: canonicalUrl,
    published_at: input.published_at ? mysqlDateTime(input.published_at) : null,
    meta_json: input.meta ? JSON.stringify(input.meta) : null,
  };
}

function mapDigestHistoryRow(row: any) {
  return {
    id: Number(row.id),
    digest_type: row.digest_type,
    dedupe_key: row.dedupe_key,
    title: row.title,
    source: row.source,
    source_id: row.source_id,
    canonical_url: row.canonical_url,
    published_at: row.published_at,
    first_sent_at: row.first_sent_at,
    last_sent_at: row.last_sent_at,
    sent_count: Number(row.sent_count) || 0,
    meta: typeof row.meta_json === 'string' && row.meta_json
      ? (() => {
          try {
            return JSON.parse(row.meta_json);
          } catch {
            return row.meta_json;
          }
        })()
      : row.meta_json ?? null,
  };
}

export async function checkDigestHistory(
  digestType: DigestType,
  items: DigestHistoryInput[],
  windowDays = 7
) {
  const prepared = items.map((item) => prepareDigestHistoryEntry(digestType, item));
  const keys = Array.from(new Set(prepared.map((item) => item.dedupe_key)));

  if (keys.length === 0) {
    return [];
  }

  const placeholders = keys.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT *
     FROM digest_history
     WHERE digest_type = ?
       AND dedupe_key IN (${placeholders})`,
    [digestType, ...keys]
  );

  const rowMap = new Map(
    (rows as any[]).map((row) => [String(row.dedupe_key), mapDigestHistoryRow(row)])
  );
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  return prepared.map((item, index) => {
    const matched = rowMap.get(item.dedupe_key) || null;
    const lastSentAt = matched?.last_sent_at ? new Date(matched.last_sent_at).getTime() : null;

    return {
      index,
      digest_type: digestType,
      dedupe_key: item.dedupe_key,
      seen_before: Boolean(matched),
      seen_recently: typeof lastSentAt === 'number' ? lastSentAt >= cutoff : false,
      matched,
    };
  });
}

export async function recordDigestHistory(
  digestType: DigestType,
  items: DigestHistoryInput[],
  sentAtInput?: string
) {
  const prepared = items.map((item) => prepareDigestHistoryEntry(digestType, item));
  const sentAt = mysqlDateTime(sentAtInput || new Date()) || mysqlDateTime(new Date());

  for (const item of prepared) {
    await pool.execute(
      `INSERT INTO digest_history (
         digest_type,
         dedupe_key,
         title,
         source,
         source_id,
         canonical_url,
         published_at,
         first_sent_at,
         last_sent_at,
         sent_count,
         meta_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         title = COALESCE(VALUES(title), digest_history.title),
         source = COALESCE(VALUES(source), digest_history.source),
         source_id = COALESCE(VALUES(source_id), digest_history.source_id),
         canonical_url = COALESCE(VALUES(canonical_url), digest_history.canonical_url),
         published_at = COALESCE(VALUES(published_at), digest_history.published_at),
         last_sent_at = VALUES(last_sent_at),
         sent_count = digest_history.sent_count + 1,
         meta_json = COALESCE(VALUES(meta_json), digest_history.meta_json)`,
      [
        item.digest_type,
        item.dedupe_key,
        item.title,
        item.source,
        item.source_id,
        item.canonical_url,
        item.published_at,
        sentAt,
        sentAt,
        item.meta_json,
      ]
    );
  }

  return checkDigestHistory(digestType, items, 3650);
}

export interface DigestHistoryListFilters {
  digestType?: DigestType;
  query?: string;
  days?: number;
  page?: number;
  pageSize?: number;
}

export async function listDigestHistory(filters: DigestHistoryListFilters = {}) {
  const where: string[] = [];
  const params: any[] = [];

  if (filters.digestType) {
    where.push('digest_type = ?');
    params.push(filters.digestType);
  }

  if (filters.days && Number.isInteger(filters.days) && filters.days > 0) {
    where.push('last_sent_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)');
    params.push(filters.days);
  }

  const query = normalizeText(filters.query);
  if (query) {
    const like = `%${query}%`;
    where.push('(title LIKE ? OR source LIKE ? OR source_id LIKE ? OR canonical_url LIKE ? OR dedupe_key LIKE ?)');
    params.push(like, like, like, like, like);
  }

  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? Math.min(filters.pageSize, 100) : 20;
  const offset = (page - 1) * pageSize;
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM digest_history
     ${whereClause}`,
    params
  );
  const total = Number((countRows as any[])[0]?.total || 0);

  const [rows] = await pool.execute(
    `SELECT *
     FROM digest_history
     ${whereClause}
     ORDER BY last_sent_at DESC, id DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );

  const [summaryRows] = await pool.execute(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN digest_type = 'news' THEN 1 ELSE 0 END) AS news_count,
       SUM(CASE WHEN digest_type = 'github' THEN 1 ELSE 0 END) AS github_count,
       SUM(CASE WHEN digest_type = 'paper' THEN 1 ELSE 0 END) AS paper_count,
       SUM(CASE WHEN last_sent_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS recent_7d_count
     FROM digest_history`
  );

  return {
    items: (rows as any[]).map(mapDigestHistoryRow),
    total,
    page,
    pageSize,
    hasMore: offset + pageSize < total,
    summary: {
      total: Number((summaryRows as any[])[0]?.total || 0),
      news_count: Number((summaryRows as any[])[0]?.news_count || 0),
      github_count: Number((summaryRows as any[])[0]?.github_count || 0),
      paper_count: Number((summaryRows as any[])[0]?.paper_count || 0),
      recent_7d_count: Number((summaryRows as any[])[0]?.recent_7d_count || 0),
    },
  };
}

export async function deleteDigestHistoryById(id: number) {
  const [rows] = await pool.execute('SELECT * FROM digest_history WHERE id = ?', [id]);
  const existing = (rows as any[])[0];
  if (!existing) {
    return null;
  }

  await pool.execute('DELETE FROM digest_history WHERE id = ?', [id]);
  return mapDigestHistoryRow(existing);
}

export async function clearDigestHistory(filters: { digestType?: DigestType; days?: number; query?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];

  if (filters.digestType) {
    where.push('digest_type = ?');
    params.push(filters.digestType);
  }

  if (filters.days && Number.isInteger(filters.days) && filters.days > 0) {
    where.push('last_sent_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)');
    params.push(filters.days);
  }

  const query = normalizeText(filters.query);
  if (query) {
    const like = `%${query}%`;
    where.push('(title LIKE ? OR source LIKE ? OR source_id LIKE ? OR canonical_url LIKE ? OR dedupe_key LIKE ?)');
    params.push(like, like, like, like, like);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const [result] = await pool.execute(
    `DELETE FROM digest_history ${whereClause}`,
    params
  );

  return Number((result as any)?.affectedRows || 0);
}
