import { defaultShouldRetry, fetchRetrier, type RequestOptions } from 'fetch-retrier';
import { quietParse } from 'quiet-json-parser';
import { StrictEnvResolver, StrictEnvType, StrictEnvValidationError } from 'strict-env-resolver';

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
 * Uses retries with full jitter backoff for transient errors (fetch-retrier defaults and extension "not ready").
 *
 * @param name - Secret name (identifier) to fetch
 * @param options - Optional port, timeout, retry, and backoff settings
 * @returns The secret value as string, or parsed as T when SecretString is valid JSON
 * @throws Error if AWS_SESSION_TOKEN is unset, the extension HTTP port is invalid, or the response format is invalid
 * @throws {import('strict-env-resolver').StrictEnvValidationError} If an environment variable value is invalid
 * @throws {import('fetch-retrier').FetchRetrierHttpError} On non-retriable HTTP responses or after the last retriable attempt
 * @throws {import('fetch-retrier').FetchRetrierNetworkError} On network failures after the last attempt
 * @throws {import('fetch-retrier').FetchRetrierAbortError} On per-attempt timeout after the last attempt
 * @throws {import('fetch-retrier').FetchRetrierInvalidOptionsError} If retries, timeoutMs, or baseBackoffMs are invalid
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
      if (defaultShouldRetry(res, body)) {
        return true;
      }
      // Extension may return 400 + "not ready to serve traffic" while initializing; retry in that case
      if (res.status === 400 && /not\s+ready.*traffic/i.test(body)) {
        return true;
      }
      return false;
    },
  };

  const response = await fetchRetrier(url, requestOptions);

  const raw = await response.json();

  if (!isSecretResponse(raw)) {
    throw new Error('Invalid secret response format');
  }

  const data: SecretResponse = raw;

  return quietParse<T>(data.SecretString, data.SecretString as T);
};

const AWS_SESSION_TOKEN_GUIDANCE =
  'AWS_SESSION_TOKEN is not set. This library only works inside an AWS Lambda execution environment ' +
  'where the runtime provides AWS_SESSION_TOKEN for the Parameters and Secrets Extension. ' +
  'Attach the extension layer and run your code as a Lambda function handler.';

const MIN_TCP_PORT = 1;
const MAX_TCP_PORT = 65535;

/**
 * Resolves the AWS session token required by the Parameters and Secrets Extension.
 *
 * Lambda injects `AWS_SESSION_TOKEN` into the execution environment; it is sent as
 * `X-Aws-Parameters-Secrets-Token` on extension requests.
 *
 * @returns The non-empty session token
 * @throws Error if `AWS_SESSION_TOKEN` is missing or blank (e.g. outside Lambda)
 * @throws {import('strict-env-resolver').StrictEnvValidationError} If `AWS_SESSION_TOKEN` is invalid
 */
const resolveAwsSessionToken = (): string => {
  try {
    return StrictEnvResolver.resolve('AWS_SESSION_TOKEN', StrictEnvType.String, { trim: true });
  } catch (e) {
    if (
      e instanceof StrictEnvValidationError &&
      e.errors.length === 1 &&
      e.errors[0]?.key === 'AWS_SESSION_TOKEN' &&
      e.errors[0]?.kind === 'missing'
    ) {
      throw new Error(AWS_SESSION_TOKEN_GUIDANCE);
    }
    throw e;
  }
};

/**
 * Resolves the HTTP port used to reach the local extension endpoint.
 *
 * Precedence:
 * - explicit `overridePort` argument
 * - `process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT` (default `2773` when unset)
 *
 * @param overridePort - Optional explicit port override
 * @returns A normalized port string in the range 1..65535
 * @throws Error if the provided port is not a valid TCP port number
 * @throws {import('strict-env-resolver').StrictEnvValidationError} If the env port value is invalid
 */
const resolveExtensionHttpPort = (overridePort: GetSecretValueOptions['extensionHttpPort']): string => {
  const port = overridePort === undefined
    ? StrictEnvResolver.resolve(
      'PARAMETERS_SECRETS_EXTENSION_HTTP_PORT',
      StrictEnvType.Number,
      { default: 2773 },
    )
    : parseExtensionHttpPortOverride(overridePort);

  return assertValidTcpPort(port);
};

/**
 * Parses an explicit extension HTTP port override from options.
 *
 * @param overridePort - Port value from `GetSecretValueOptions.extensionHttpPort`
 * @returns Parsed port number
 * @throws Error if the value is not a base-10 integer port string
 */
const parseExtensionHttpPortOverride = (overridePort: string | number): number => {
  const candidate = String(overridePort).trim();

  if (!/^\d+$/.test(candidate)) {
    throw new Error('Invalid extension HTTP port: must be a number');
  }

  return Number.parseInt(candidate, 10);
};

/**
 * Ensures a TCP port number is within the valid range.
 *
 * @param port - Parsed port number
 * @returns The port as a string
 * @throws Error if the port is outside 1..65535
 */
const assertValidTcpPort = (port: number): string => {
  if (port < MIN_TCP_PORT || port > MAX_TCP_PORT) {
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
 * Client for fetching secrets from the AWS Lambda Secrets Manager Extension.
 */
export const secretFetcher = {
  getSecretValue,
};
