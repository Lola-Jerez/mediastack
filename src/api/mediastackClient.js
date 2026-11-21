// My mediastack API client.
// This is the ONLY file that talks to the mediastack API over HTTP.
//
// What it does for me:
//   1. Timeouts   – if the API doesn't answer in time, I abort the request.
//   2. Retries    – if the failure is temporary (network blip, 5xx, 429),
//                   I wait a bit and try again, waiting longer each time.
//   3. Rate limit – I leave a minimum gap between requests, and I respect
//                   the "Retry-After" header if the API sends one.

// This is my own error type, so the rest of my code can check
// `error.retryable` to know if trying again makes sense.
export class MediastackError extends Error {
  constructor(message, { status, code, retryable }) {
    super(message);
    this.name = 'MediastackError';
    this.status = status; // HTTP status code (or undefined for network errors)
    this.code = code; // mediastack's own error code, e.g. "invalid_access_key"
    this.retryable = retryable; // true = worth trying again
  }
}

// mediastack error codes that mean "stop, retrying won't help".
// For example: my key is wrong, or I used up my monthly quota.
const PERMANENT_ERROR_CODES = new Set([
  'invalid_access_key',
  'missing_access_key',
  'inactive_user',
  'https_access_restricted', // free plan + https:// = not allowed
  'function_access_restricted', // feature not in my plan
  'usage_limit_reached', // monthly quota used up -> retrying just wastes time
  'validation_error',
  'invalid_api_function',
  '404_not_found',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMediastackClient(options) {
  const {
    apiKey,
    baseUrl,
    timeoutMs,
    maxRetries,
    minDelayBetweenRequestsMs,
    retryBaseDelayMs = 1000, // my first retry waits ~this long, then it doubles
    fetchFn = fetch, // I can pass a fake fetch in tests
    log = console.log,
  } = options;

  // I remember when my last request happened so I can space them out.
  let lastRequestAt = 0;

  // --- Rate limiting ---------------------------------------------------------
  // Before each request I check how long ago my last one was.
  // If it was too recent, I wait the difference.
  async function waitForRateLimit() {
    const elapsed = Date.now() - lastRequestAt;
    const waitMs = minDelayBetweenRequestsMs - elapsed;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastRequestAt = Date.now();
  }

  // --- One single HTTP request (no retries here) -----------------------------
  async function requestOnce(url) {
    await waitForRateLimit();

    let response;
    try {
      // AbortSignal.timeout() cancels the request automatically after timeoutMs.
      response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      // I land here when there was no response at all:
      // a timeout, DNS failure, connection reset, no internet...
      // All of these are usually temporary, so I mark them as retryable.
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      throw new MediastackError(
        isTimeout ? `Request timed out after ${timeoutMs}ms` : `Network error: ${err.message}`,
        { status: undefined, code: isTimeout ? 'timeout' : 'network_error', retryable: true },
      );
    }

    // I try to read the body as JSON. If the API sent HTML or garbage
    // (it happens when a proxy/server is broken), I treat it as a temporary error.
    let body;
    try {
      body = await response.json();
    } catch {
      throw new MediastackError(`API returned invalid JSON (HTTP ${response.status})`, {
        status: response.status,
        code: 'invalid_json',
        retryable: response.status >= 500,
      });
    }

    // mediastack puts errors inside { "error": { "code": ..., "message": ... } }.
    // I check both the HTTP status AND that error object.
    if (!response.ok || body.error) {
      const code = body.error?.code ?? `http_${response.status}`;
      const message = body.error?.message ?? `HTTP ${response.status}`;

      // A temporary error is: server error (5xx), "too many requests" (429)
      // UNLESS the code tells me it's something permanent (like monthly quota).
      const isTemporaryStatus = response.status >= 500 || response.status === 429;
      const retryable = isTemporaryStatus && !PERMANENT_ERROR_CODES.has(code);

      const error = new MediastackError(`mediastack error [${code}]: ${message}`, {
        status: response.status,
        code,
        retryable,
      });

      // If the API tells me how long to wait, I remember it for the retry.
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter && !Number.isNaN(Number(retryAfter))) {
        error.retryAfterMs = Number(retryAfter) * 1000;
      }
      throw error;
    }

    return body;
  }

  // --- A request WITH retries ------------------------------------------------
  // I use "exponential backoff with jitter":
  //   attempt 1 fails -> wait ~1s, attempt 2 fails -> wait ~2s, then ~4s ...
  // The small random "jitter" stops many clients from retrying at the same moment.
  async function requestWithRetry(url) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await requestOnce(url);
      } catch (err) {
        const canRetry = err.retryable && attempt < maxRetries;
        if (!canRetry) {
          throw err;
        }

        const backoffMs = retryBaseDelayMs * 2 ** attempt + Math.random() * 250;
        const waitMs = err.retryAfterMs ?? backoffMs;
        log(`  ⚠️  ${err.message} — retrying in ${Math.round(waitMs)}ms (attempt ${attempt + 2}/${maxRetries + 1})`);
        await sleep(waitMs);
      }
    }
  }

  // --- The public function I use from the rest of my code --------------------
  // I fetch ONE page of news. `filters` are things like languages, countries...
  async function fetchNews({ limit, offset = 0, ...filters }) {
    const params = new URLSearchParams({
      access_key: apiKey,
      limit: String(limit),
      offset: String(offset),
      sort: 'published_desc',
    });

    // I only add filters that actually have a value.
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }

    return requestWithRetry(`${baseUrl}/news?${params}`);
  }

  return { fetchNews };
}
