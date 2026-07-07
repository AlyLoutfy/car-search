export interface FetchOptions {
  readonly jinaApiKey?: string;
  readonly timeoutMs?: number;
  readonly retries?: number;
  /** Override Jina's output: 'html' for embedded SSR data, 'text' to pass a JSON API through raw. */
  readonly returnFormat?: 'markdown' | 'html' | 'text';
  /** Bypass Jina's cache — a monitor must always read the current page. */
  readonly noCache?: boolean;
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request to ${url} failed with HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Retry a fetch on transient failure (network blip, timeout abort, 429, 5xx) with backoff. */
async function withRetry(
  attempt: () => Promise<string>,
  retries: number,
): Promise<string> {
  let lastError: unknown;
  for (let tryIndex = 0; tryIndex <= retries; tryIndex += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (tryIndex < retries) {
        await sleep(2000 * (tryIndex + 1)); // 2s, 4s, ...
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Fetch a URL directly. Suitable for sites without bot protection (e.g. Sylndr). */
export function fetchDirect(url: string, options: FetchOptions = {}): Promise<string> {
  return withRetry(
    () =>
      fetchText(
        url,
        { 'User-Agent': BROWSER_USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
        options.timeoutMs ?? 30_000,
      ),
    options.retries ?? 2,
  );
}

/**
 * Fetch a URL through the Jina reader proxy (https://r.jina.ai), which renders the page
 * server-side and returns clean markdown. This is how we get past Cloudflare on sites that
 * block datacenter IPs (ContactCars, Dubizzle) from a CI runner.
 */
export function fetchViaJina(url: string, options: FetchOptions = {}): Promise<string> {
  const headers: Record<string, string> = { 'User-Agent': BROWSER_USER_AGENT };
  if (options.jinaApiKey) {
    headers.Authorization = `Bearer ${options.jinaApiKey}`;
  }
  if (options.returnFormat === 'html' || options.returnFormat === 'text') {
    headers['X-Return-Format'] = options.returnFormat;
  }
  if (options.noCache) {
    headers['X-No-Cache'] = 'true';
  }
  return withRetry(
    () => fetchText(`https://r.jina.ai/${url}`, headers, options.timeoutMs ?? 45_000),
    options.retries ?? 2,
  );
}
