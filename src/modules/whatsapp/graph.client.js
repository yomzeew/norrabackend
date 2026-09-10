const env = require('../../config/env');
const logger = require('../../lib/logger');
const { UpstreamError } = require('../../utils/errors');

const BASE = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Single place for every Graph call, so retry/backoff and error shape are
// consistent. Retries only on transient failures - a 400 from Meta means the
// request is wrong and retrying just burns quota.
async function graphRequest(path, { method = 'GET', accessToken, query, body, retries = 3 } = {}) {
  const url = new URL(`${BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let resp;
    try {
      resp = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // Network-level failure - always worth retrying.
      lastError = err;
      if (attempt === retries) break;
      await sleep(2 ** attempt * 300);
      continue;
    }

    const data = await resp.json().catch(() => ({}));

    if (resp.ok && !data.error) return data;

    const shouldRetry = RETRYABLE_STATUS.has(resp.status) && attempt < retries;
    logger.warn(
      { path, status: resp.status, code: data.error?.code, attempt, shouldRetry },
      'Graph API request failed'
    );

    if (!shouldRetry) {
      throw new UpstreamError(
        data.error?.message || `Graph API returned ${resp.status}`,
        `graph_${resp.status}`
      );
    }

    lastError = new UpstreamError(data.error?.message || `Graph API ${resp.status}`);
    await sleep(2 ** attempt * 500);
  }

  throw lastError instanceof UpstreamError
    ? lastError
    : new UpstreamError(lastError?.message || 'Graph API unreachable');
}

module.exports = { graphRequest };
