/**
 * Base error for failures raised by this package.
 */
export abstract class SecretFetcherError extends Error {
  override readonly name: string = 'SecretFetcherError';

  /**
   * @param message - Error message shown to the caller
   */
  protected constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SecretFetcherError.prototype);
  }
}

/**
 * Thrown when `AWS_SESSION_TOKEN` is missing or blank outside Lambda.
 */
export class SecretFetcherSessionTokenError extends SecretFetcherError {
  override readonly name: string = 'SecretFetcherSessionTokenError';

  /**
   * @param message - Error message shown to the caller
   */
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SecretFetcherSessionTokenError.prototype);
  }
}

/**
 * Thrown when the extension HTTP port is not a valid TCP port.
 */
export class SecretFetcherPortError extends SecretFetcherError {
  override readonly name: string = 'SecretFetcherPortError';

  /**
   * @param message - Error message shown to the caller
   */
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SecretFetcherPortError.prototype);
  }
}

/**
 * Thrown when the extension payload is not a string or binary secret.
 */
export class SecretFetcherResponseError extends SecretFetcherError {
  override readonly name: string = 'SecretFetcherResponseError';

  /**
   * @param message - Error message shown to the caller
   */
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SecretFetcherResponseError.prototype);
  }
}

/**
 * Thrown when `SecretBinary` is not canonical standard base64.
 */
export class SecretFetcherBinaryError extends SecretFetcherError {
  override readonly name: string = 'SecretFetcherBinaryError';

  /**
   * @param message - Error message shown to the caller
   */
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SecretFetcherBinaryError.prototype);
  }
}
