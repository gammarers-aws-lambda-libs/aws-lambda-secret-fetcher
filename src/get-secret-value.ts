import { defaultShouldRetry, fetchRetrier, type RequestOptions } from 'fetch-retrier';
import { resolveAwsSessionToken, resolveExtensionHttpPort } from './core/extension-http';
import { readSecretValue } from './core/secret-response';

/**
 * HTTP status the extension returns while it is still starting.
 */
const EXTENSION_NOT_READY_STATUS = 400;

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
 * Fetches a secret value from the AWS Lambda Parameters and Secrets Extension (default localhost:2773).
 * If `extensionHttpPort` is not provided, uses `process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT`.
 * Uses retries with full jitter backoff for transient errors (fetch-retrier defaults and extension "not ready").
 *
 * @param name - Secret name (identifier) to fetch
 * @param options - Optional port, timeout, retry, and backoff settings
 * @returns For SecretString, valid JSON parsed as T, otherwise the original string. For SecretBinary, the base64 payload decoded as Uint8Array.
 * @throws {import('./core/errors').SecretFetcherSessionTokenError} If `AWS_SESSION_TOKEN` is unset or blank
 * @throws {import('./core/errors').SecretFetcherPortError} If the extension HTTP port is invalid
 * @throws {import('./core/errors').SecretFetcherResponseError} If the response format is invalid
 * @throws {import('./core/errors').SecretFetcherBinaryError} If SecretBinary is not standard base64
 * @throws {import('strict-env-resolver').StrictEnvValidationError} If an environment variable value is invalid
 * @throws {import('fetch-retrier').FetchRetrierHttpError} On non-retriable HTTP responses or after the last retriable attempt
 * @throws {import('fetch-retrier').FetchRetrierNetworkError} On network failures after the last attempt
 * @throws {import('fetch-retrier').FetchRetrierAbortError} On per-attempt timeout after the last attempt
 * @throws {import('fetch-retrier').FetchRetrierInvalidOptionsError} If retries, timeoutMs, or baseBackoffMs are invalid
 */
const getSecretValue = async <T = string>(name: string, options: GetSecretValueOptions = {}): Promise<T | Uint8Array> => {
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
      if (defaultShouldRetry(res, body)) {
        return true;
      }
      // Extension may return 400 + "not ready to serve traffic" while initializing; retry in that case
      if (res.status === EXTENSION_NOT_READY_STATUS && /not\s+ready.*traffic/i.test(body)) {
        return true;
      }
      return false;
    },
  };

  const response = await fetchRetrier(url, requestOptions);
  const raw = await response.json();

  return readSecretValue<T>(raw);
};

/**
 * Client for fetching secrets from the AWS Lambda Secrets Manager Extension.
 */
export const secretFetcher = {
  getSecretValue,
};
