import { fetchRetrier, type RequestOptions } from 'fetch-retrier';

/**
 * Options for fetching a secret from the Secrets Manager Extension.
 */
export interface GetSecretValueOptions {
  /**
   * Extension HTTP port for the local extension endpoint.
   *
   * If omitted, this library reads `process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT`
   * and falls back to `2773`.
   */
  extensionHttpPort?: string | number;
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
 * Fetches a secret value from the AWS Lambda Parameters and Secrets Extension (default localhost:2773).
 * If `extensionHttpPort` is not provided, uses `process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT`.
 * Uses retries with full jitter backoff for transient errors (e.g. 5xx, 429, or extension "not ready").
 *
 * @param name - Secret name (identifier) to fetch
 * @param options - Optional port, timeout, retry, and backoff settings
 * @returns The secret value as string, or parsed as T if the stored value is JSON
 * @throws Error if AWS_SESSION_TOKEN is unset, the response format is invalid, the extension HTTP port is invalid, or the request fails after retries
 * @throws {import('fetch-retrier').FetchRetrierHttpError} On non-retriable HTTP responses or after the last retriable attempt
 * @throws {import('fetch-retrier').FetchRetrierNetworkError} On network failures after the last attempt
 * @throws {import('fetch-retrier').FetchRetrierAbortError} On per-attempt timeout after the last attempt
 */
const getSecretValue = async <T = string>(name: string, options: GetSecretValueOptions = {}): Promise<T> => {
  const { extensionHttpPort, timeoutMs = 2000, retries = 3, baseBackoffMs = 300 } = options;

  const port = resolveExtensionHttpPort(extensionHttpPort);
  const sessionToken = resolveAwsSessionToken();
  const url = `http://localhost:${port}/secretsmanager/get?secretId=${encodeURIComponent(name)}`;

  const requestOptions: RequestOptions = {
    headers: {
      'X-Aws-Parameters-Secrets-Token': sessionToken,
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
 * Resolves the AWS session token required by the Parameters and Secrets Extension.
 *
 * Lambda injects `AWS_SESSION_TOKEN` into the execution environment; it is sent as
 * `X-Aws-Parameters-Secrets-Token` on extension requests.
 *
 * @returns The non-empty session token
 * @throws Error if `AWS_SESSION_TOKEN` is missing or blank (e.g. outside Lambda)
 */
const resolveAwsSessionToken = (): string => {
  const token = process.env.AWS_SESSION_TOKEN?.trim();

  if (!token) {
    throw new Error(
      'AWS_SESSION_TOKEN is not set. This library only works inside an AWS Lambda execution environment ' +
      'where the runtime provides AWS_SESSION_TOKEN for the Parameters and Secrets Extension. ' +
      'Attach the extension layer and run your code as a Lambda function handler.',
    );
  }

  return token;
};

/**
 * Resolves the HTTP port used to reach the local extension endpoint.
 *
 * Precedence:
 * - explicit `overridePort` argument
 * - `process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT`
 * - default `2773`
 *
 * @param overridePort - Optional explicit port override
 * @returns A normalized port string in the range 1..65535
 * @throws Error if the provided port is not a valid TCP port number
 */
const resolveExtensionHttpPort = (overridePort: GetSecretValueOptions['extensionHttpPort']): string => {
  const fromOverride = overridePort === undefined ? undefined : String(overridePort);
  const fromEnv = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT;
  const candidate = (fromOverride ?? fromEnv ?? '2773').trim();

  if (!/^\d+$/.test(candidate)) {
    throw new Error('Invalid extension HTTP port: must be a number');
  }

  const port = Number.parseInt(candidate, 10);
  if (port < 1 || port > 65535) {
    throw new Error('Invalid extension HTTP port: must be between 1 and 65535');
  }

  return String(port);
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
