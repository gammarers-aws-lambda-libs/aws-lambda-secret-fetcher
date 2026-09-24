import { quietParse } from 'quiet-json-parser';
import { SecretFetcherBinaryError, SecretFetcherResponseError } from './errors';

/**
 * Fields shared by string and binary secret responses.
 */
interface SecretMetadata {
  /** ARN of the secret */
  ARN: string;
  /** Name of the secret */
  Name: string;
  /** Optional version identifier */
  VersionId?: string;
}

/**
 * Response when the secret value is a string (may be JSON).
 */
interface SecretStringResponse extends SecretMetadata {
  /** Secret value as string (may be JSON) */
  SecretString: string;
}

/**
 * Response when the secret value is binary, base64-encoded in the extension JSON.
 */
interface SecretBinaryResponse extends SecretMetadata {
  /** Base64-encoded secret bytes */
  SecretBinary: string;
}

/**
 * Response shape returned by the Secrets Manager Extension API.
 * Exactly one of SecretString or SecretBinary is present.
 */
type SecretResponse = SecretStringResponse | SecretBinaryResponse;

/** Canonical standard base64, including padding. */
const STANDARD_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Message thrown when the extension payload is not a secret. */
const INVALID_SECRET_RESPONSE = 'Invalid secret response format';

type SecretFieldKind = 'absent' | 'string' | 'invalid';

/**
 * Reads a secret value from an extension JSON body.
 *
 * String secrets are parsed as JSON when possible. Binary secrets are decoded from standard base64.
 *
 * @param raw - JSON body from the extension
 * @returns Parsed JSON, the original string, or decoded binary bytes
 * @throws {SecretFetcherResponseError} If the body is not a string or binary secret
 * @throws {SecretFetcherBinaryError} If SecretBinary is not standard base64
 */
export const readSecretValue = <T>(raw: unknown): T | Uint8Array => {
  if (!isSecretResponse(raw)) {
    throw new SecretFetcherResponseError(INVALID_SECRET_RESPONSE);
  }

  if ('SecretString' in raw) {
    return quietParse<T>(raw.SecretString, raw.SecretString as T);
  }

  return decodeSecretBinary(raw.SecretBinary);
};

/**
 * Classifies a SecretString or SecretBinary field.
 *
 * Absent means the key is missing. Empty strings and non-strings are invalid.
 *
 * @param record - Extension response object
 * @param key - Field name to classify
 * @returns Whether the field is absent, a non-empty string, or invalid
 */
const secretFieldKind = (record: Record<string, unknown>, key: 'SecretString' | 'SecretBinary'): SecretFieldKind => {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return 'absent';
  }

  const field = record[key];
  if (typeof field !== 'string' || field.length === 0) {
    return 'invalid';
  }

  return 'string';
};

/**
 * Type guard for the Secrets Manager Extension response shape.
 *
 * Accepts exactly one of a non-empty SecretString or a non-empty SecretBinary.
 *
 * @param value - Value to check
 * @returns True if value has the shape of SecretResponse
 */
const isSecretResponse = (value: unknown): value is SecretResponse => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;

  if (typeof record.Name !== 'string' || typeof record.ARN !== 'string') {
    return false;
  }
  if (record.VersionId !== undefined && typeof record.VersionId !== 'string') {
    return false;
  }

  const secretString = secretFieldKind(record, 'SecretString');
  const secretBinary = secretFieldKind(record, 'SecretBinary');
  const hasString = secretString === 'string' && secretBinary === 'absent';
  const hasBinary = secretBinary === 'string' && secretString === 'absent';

  return hasString || hasBinary;
};

/**
 * Returns whether a string is canonical standard base64 with padding.
 *
 * @param encoded - Candidate base64 text
 * @returns True when the text matches standard base64
 */
const isStandardBase64 = (encoded: string): boolean => STANDARD_BASE64.test(encoded);

/**
 * Decodes a SecretBinary base64 payload into bytes.
 *
 * @param encoded - Base64 text from the extension response
 * @returns Decoded secret bytes
 * @throws {SecretFetcherBinaryError} If the payload is not standard base64
 */
const decodeSecretBinary = (encoded: string): Uint8Array => {
  if (!isStandardBase64(encoded)) {
    throw new SecretFetcherBinaryError('Invalid secret binary encoding');
  }

  return Uint8Array.from(Buffer.from(encoded, 'base64'));
};
