import { StrictEnvResolver, StrictEnvType, StrictEnvValidationError } from 'strict-env-resolver';
import { SecretFetcherPortError, SecretFetcherSessionTokenError } from './errors';

/** Message thrown when Lambda did not inject `AWS_SESSION_TOKEN`. */
const AWS_SESSION_TOKEN_GUIDANCE =
  'AWS_SESSION_TOKEN is not set. This library only works inside an AWS Lambda execution environment ' +
  'where the runtime provides AWS_SESSION_TOKEN for the Parameters and Secrets Extension. ' +
  'Attach the extension layer and run your code as a Lambda function handler.';

/** Default local port of the Parameters and Secrets Lambda Extension. */
const DEFAULT_EXTENSION_HTTP_PORT = 2773;
/** Lowest valid TCP port number. */
const MIN_TCP_PORT = 1;
/** Highest valid TCP port number. */
const MAX_TCP_PORT = 65535;

/** Local extension path for Secrets Manager GetSecretValue. */
const SECRETS_MANAGER_GET_PATH = '/secretsmanager/get';
/** Query parameter for the secret name or ARN. */
const SECRET_ID_QUERY = 'secretId';
/** Query parameter for a specific secret version UUID. */
const VERSION_ID_QUERY = 'versionId';
/** Query parameter for a secret version staging label. */
const VERSION_STAGE_QUERY = 'versionStage';

/**
 * Builds the local extension URL for `GET /secretsmanager/get`.
 *
 * @param port - Resolved extension HTTP port
 * @param name - Secret id (`secretId` query parameter)
 * @param versionId - Optional version UUID
 * @param versionStage - Optional staging label (for example AWSCURRENT)
 */
export const buildGetSecretUrl = (
  port: string,
  name: string,
  versionId?: string,
  versionStage?: string,
): string => {
  const params = new URLSearchParams({ [SECRET_ID_QUERY]: name });
  if (versionId !== undefined) {
    params.set(VERSION_ID_QUERY, versionId);
  }
  if (versionStage !== undefined) {
    params.set(VERSION_STAGE_QUERY, versionStage);
  }

  return `http://localhost:${port}${SECRETS_MANAGER_GET_PATH}?${params.toString()}`;
};

/**
 * Resolves the AWS session token required by the Parameters and Secrets Extension.
 *
 * Lambda injects `AWS_SESSION_TOKEN` into the execution environment; it is sent as
 * `X-Aws-Parameters-Secrets-Token` on extension requests.
 *
 * @returns The non-empty session token
 * @throws {SecretFetcherSessionTokenError} If `AWS_SESSION_TOKEN` is missing or blank
 * @throws {import('strict-env-resolver').StrictEnvValidationError} If `AWS_SESSION_TOKEN` is invalid
 */
export const resolveAwsSessionToken = (): string => {
  try {
    return StrictEnvResolver.resolve('AWS_SESSION_TOKEN', StrictEnvType.String, { trim: true });
  } catch (e) {
    if (
      e instanceof StrictEnvValidationError &&
      e.errors.length === 1 &&
      e.errors[0]?.key === 'AWS_SESSION_TOKEN' &&
      e.errors[0]?.kind === 'missing'
    ) {
      throw new SecretFetcherSessionTokenError(AWS_SESSION_TOKEN_GUIDANCE);
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
 * @throws {SecretFetcherPortError} If the provided port is not a valid TCP port number
 * @throws {import('strict-env-resolver').StrictEnvValidationError} If the env port value is invalid
 */
export const resolveExtensionHttpPort = (overridePort: string | number | undefined): string => {
  const port = overridePort === undefined
    ? StrictEnvResolver.resolve(
      'PARAMETERS_SECRETS_EXTENSION_HTTP_PORT',
      StrictEnvType.Number,
      { default: DEFAULT_EXTENSION_HTTP_PORT },
    )
    : parseExtensionHttpPortOverride(overridePort);

  return assertValidTcpPort(port);
};

/**
 * Parses an explicit extension HTTP port override from options.
 *
 * @param overridePort - Port value from the caller
 * @returns Parsed port number
 * @throws {SecretFetcherPortError} If the value is not a base-10 integer port string
 */
const parseExtensionHttpPortOverride = (overridePort: string | number): number => {
  const candidate = String(overridePort).trim();

  if (!/^\d+$/.test(candidate)) {
    throw new SecretFetcherPortError('Invalid extension HTTP port: must be a number');
  }

  return Number.parseInt(candidate, 10);
};

/**
 * Ensures a TCP port number is within the valid range.
 *
 * @param port - Parsed port number
 * @returns The port as a string
 * @throws {SecretFetcherPortError} If the port is outside 1..65535
 */
const assertValidTcpPort = (port: number): string => {
  if (port < MIN_TCP_PORT || port > MAX_TCP_PORT) {
    throw new SecretFetcherPortError('Invalid extension HTTP port: must be between 1 and 65535');
  }

  return String(port);
};
