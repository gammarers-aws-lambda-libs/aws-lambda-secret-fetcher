/**
 * getSecretValue Options
 */
export interface GetSecretValueOptions {
  timeoutMs?: number; // default: 2000
  retries?: number; // default: 3
  baseBackoffMs?: number; // default: 300
}

/**
 * fetchWithRetry Options
 */
interface RequestOptions {
  headers?: Record<string, string>;
  retries: number;
  timeoutMs: number;
  baseBackoffMs: number;
}

/**
 * Secrets Manager Extension Response
 */
interface SecretResponse {
  ARN: string;
  Name: string;
  SecretString: string;
  VersionId?: string;
}

/**
 * Get Secret Value from Secrets Manager Extension
 * @param name Secret Name
 * @param options GetSecretValue Options
 * @returns SecretString as T
 */
export async function getSecretValue<T = string>(name: string, options: GetSecretValueOptions = {}): Promise<T> {
  // default options
  const { timeoutMs = 2000, retries = 3, baseBackoffMs = 300 } = options;

  const url = `http://localhost:2773/secretsmanager/get?secretId=${encodeURIComponent(name)}`;

  const response = await request(url, {
    headers: {
      'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN ?? '',
    },
    retries,
    timeoutMs,
    baseBackoffMs,
  });

  const raw = await response.json();

  if (!isSecretResponse(raw)) {
    throw new Error('Invalid secret response format');
  }

  const data: SecretResponse = raw;

  const secretString = data.SecretString;

  if (looksLikeJson(secretString)) {
    return JSON.parse(secretString) as T;
  }

  return secretString as T;
}

/**
 * retry + timeout + Full Jitter
 * @param url - The URL to fetch
 * @param options - The options for the fetch
 * @returns The response
 */
async function request(url: string, options: RequestOptions): Promise<Response> {
  const { headers, retries, timeoutMs, baseBackoffMs } = options;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        return res;
      }

      const text = await res.text();

      const isContinue = ((): boolean => {
        // 特定のステータスコードの場合はリトライ
        if ([429, 500, 502, 503, 504].includes(res.status)) {
          console.log('Specific status code, retrying...');
          return true;
        }
        // AWS Lambda Extension API の特殊ケース：
        // 拡張機能の初期化中に 400 + 'not ready to serve traffic' を返す
        // これは一時的な状態なので、リトライが適切
        // 参考: https://docs.aws.amazon.com/lambda/latest/dg/runtimes-extensions-api.html
        if (res.status === 400 && /not\s+ready.*traffic/i.test(text)) {
          console.log('Extension not ready, retrying...');
          return true;
        }
        return false;
      })();

      if (isContinue) {
        if (attempt === retries) {
          throw new Error(`HTTP ${res.status}`);
        }
        await wait(fullJitter(baseBackoffMs, attempt));
      } else {
        throw new Error(`Non-retriable HTTP error: ${res.status}`);
      }
    } catch (err: unknown) {
      clearTimeout(timer);

      if (err instanceof Error && err.name === 'AbortError') {
        if (attempt === retries) throw err;
        await wait(fullJitter(baseBackoffMs, attempt));
        continue;
      }

      if (err instanceof TypeError) {
        if (attempt === retries) throw err;
        await wait(fullJitter(baseBackoffMs, attempt));
        continue;
      }

      throw err;
    }
  }

  throw new Error('Unreachable'); // TS 用（実際には到達しない）
}

function isSecretResponse(value: unknown): value is SecretResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  return typeof v.SecretString === 'string' &&
         typeof v.Name === 'string' &&
         typeof v.ARN === 'string' &&
         (v.VersionId === undefined || typeof v.VersionId === 'string');
}

/**
 * Wait for a given time
 * @param ms - The time to wait in milliseconds
 * @returns A promise that resolves when the time has elapsed
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * AWS recommended Full Jitter
 * @param base - The base time in milliseconds
 * @param attempt - The attempt number
 * @returns The time to wait in milliseconds
 */
function fullJitter(base: number, attempt: number): number {
  const cap = base * Math.pow(2, attempt);
  return Math.floor(Math.random() * cap);
}

/**
 * Roughly JSON check
 * @param str - The string to check
 * @returns True if the string looks like JSON
 */
function looksLikeJson(str: string): boolean {
  return typeof str === 'string' && str.trim().startsWith('{');
}
