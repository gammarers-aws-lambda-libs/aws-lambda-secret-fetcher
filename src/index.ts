import { fetchRetrier, type RequestOptions } from 'fetch-retrier';

/**
 * Options for fetching a secret from the Secrets Manager Extension.
 */
export interface GetSecretValueOptions {
  /** Request timeout in milliseconds. Default: 2000 */
  timeoutMs?: number;
  /** Maximum number of attempts (including the first request). Default: 3 */
  retries?: number;
  /** Base delay in milliseconds for backoff between retries. Default: 300 */
  baseBackoffMs?: number;
}

/**
 * Response shape returned by the Secrets Manager Extension API.
 */
interface SecretResponse {
  /** ARN of the secret */
  ARN: string;
  /** Name of the secret */
  Name: string;
  /** Secret value as string (may be JSON) */
  SecretString: string;
  /** Optional version identifier */
  VersionId?: string;
}

/**
 * Fetches a secret value from the AWS Lambda Secrets Manager Extension (localhost:2773).
 * Uses retries with full jitter backoff for transient errors (e.g. 5xx, 429, or extension "not ready").
 *
 * @param name - Secret name (identifier) to fetch
 * @param options - Optional timeout, retry, and backoff settings
 * @returns The secret value as string, or parsed as T if the stored value is JSON
 * @throws Error if the response format is invalid or the request fails after retries
 */
const getSecretValue = async <T = string>(name: string, options: GetSecretValueOptions = {}): Promise<T> => {
  const { timeoutMs = 2000, retries = 3, baseBackoffMs = 300 } = options;

  const url = `http://localhost:2773/secretsmanager/get?secretId=${encodeURIComponent(name)}`;

  const requestOptions: RequestOptions = {
    headers: {
      'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN ?? '',
    },
    retries,
    timeoutMs,
    baseBackoffMs,
    shouldRetry: (res, body) => {
      if ([429, 500, 502, 503, 504].includes(res.status)) return true;
      // Extension may return 400 + "not ready to serve traffic" while initializing; retry in that case
      if (res.status === 400 && /not\s+ready.*traffic/i.test(body)) return true;
      return false;
    },
  };

  const response = await fetchRetrier(url, requestOptions);

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
};

/**
 * Type guard for the Secrets Manager Extension response shape.
 *
 * @param value - Value to check
 * @returns True if value has the shape of SecretResponse
 */
const isSecretResponse = (value: unknown): value is SecretResponse => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  return typeof v.SecretString === 'string' &&
         typeof v.Name === 'string' &&
         typeof v.ARN === 'string' &&
         (v.VersionId === undefined || typeof v.VersionId === 'string');
};

/**
 * Heuristic check whether a string looks like JSON (starts with `{` after trim).
 *
 * @param str - String to check
 * @returns True if the string appears to be JSON
 */
const looksLikeJson = (str: string): boolean => {
  return typeof str === 'string' && str.trim().startsWith('{');
};


/**
 * Client for fetching secrets from the AWS Lambda Secrets Manager Extension.
 */
export const secretFetcher = {
  getSecretValue,
};
