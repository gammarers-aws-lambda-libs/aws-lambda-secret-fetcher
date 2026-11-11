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
 * JSON value the extension may place in SecretString after parsing the secret.
 * Null is not a secret value. A null field means that side is unused.
 */
type ParsedSecretString = number | boolean | unknown[] | Record<string, unknown>;

/**
 * Response when the secret value is text or JSON the extension already parsed.
 * SecretBinary is omitted or null.
 */
interface SecretStringResponse extends SecretMetadata {
  /** Secret text, or an array, object, number, or boolean the extension already parsed */
  SecretString: string | ParsedSecretString;
  /** Unused binary field. Null is treated as absent. */
  SecretBinary?: null;
}

/**
 * Response when the secret value is binary, base64-encoded in the extension JSON.
 * SecretString is omitted or null.
 */
interface SecretBinaryResponse extends SecretMetadata {
  /** Base64-encoded secret bytes */
  SecretBinary: string;
  /** Unused string field. Null is treated as absent. */
  SecretString?: null;
}

/**
 * Response shape returned by the Secrets Manager Extension API.
 * Exactly one of SecretString or SecretBinary carries a value.
 */
type SecretResponse = SecretStringResponse | SecretBinaryResponse;

/** Canonical standard base64, including padding. */
const STANDARD_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Message thrown when the extension payload is not a secret. */
const INVALID_SECRET_RESPONSE = 'Invalid secret response format';

type SecretStringKind = 'absent' | 'text' | 'parsed' | 'invalid';

type SecretBinaryKind = 'absent' | 'text' | 'invalid';

/**
 * Reads a secret value from an extension JSON body.
 *
 * A string SecretString is parsed as JSON when possible. An array, object, number, or boolean
 * already parsed by the extension is returned as-is. Binary secrets are decoded from standard base64.
 * A null unused field is treated as absent.
 *
 * @param raw - JSON body from the extension
 * @returns Parsed JSON, the original string, an already parsed JSON value, or decoded binary bytes
 * @throws {SecretFetcherResponseError} If the body is not a string, parsed JSON, or binary secret
 * @throws {SecretFetcherBinaryError} If SecretBinary is not standard base64
 */
export const readSecretValue = <T>(raw: unknown): T | Uint8Array => {
  if (!isSecretResponse(raw)) {
    throw new SecretFetcherResponseError(INVALID_SECRET_RESPONSE);
  }

  if (isStringSecret(raw)) {
    if (typeof raw.SecretString === 'string') {
      return quietParse<T>(raw.SecretString, raw.SecretString as T);
    }

    return raw.SecretString as T;
  }

  return decodeSecretBinary(raw.SecretBinary);
};

/**
 * Returns whether a secret field is missing or explicitly null.
 *
 * The extension leaves the unused side null. That null is not a secret value.
 *
 * @param record - Extension response object
 * @param key - Field name to inspect
 * @returns True when the key is missing or the value is null
 */
const isAbsentField = (record: Record<string, unknown>, key: 'SecretString' | 'SecretBinary'): boolean => {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return true;
  }

  return record[key] === null;
};

/**
 * Classifies SecretString.
 *
 * A missing key and null are absent. An empty string is invalid.
 * A non-empty string is text. An array, object, number, or boolean is parsed JSON.
 *
 * @param record - Extension response object
 * @returns How SecretString should be read
 */
const secretStringKind = (record: Record<string, unknown>): SecretStringKind => {
  if (isAbsentField(record, 'SecretString')) {
    return 'absent';
  }

  const field = record.SecretString;
  if (typeof field === 'string') {
    if (field.length === 0) {
      return 'invalid';
    }

    return 'text';
  }

  if (typeof field === 'number' || typeof field === 'boolean' || typeof field === 'object') {
    return 'parsed';
  }

  return 'invalid';
};

/**
 * Classifies SecretBinary.
 *
 * A missing key and null are absent. Only a non-empty string can be base64.
 *
 * @param record - Extension response object
 * @returns How SecretBinary should be read
 */
const secretBinaryKind = (record: Record<string, unknown>): SecretBinaryKind => {
  if (isAbsentField(record, 'SecretBinary')) {
    return 'absent';
  }

  const field = record.SecretBinary;
  if (typeof field !== 'string' || field.length === 0) {
    return 'invalid';
  }

  return 'text';
};

/**
 * Type guard for the Secrets Manager Extension response shape.
 *
 * Accepts one non-empty string or parsed JSON SecretString, or one non-empty SecretBinary.
 * The other field must be omitted or null.
 *
 * @param value - Value to check
 * @returns True if value has the shape of SecretResponse
 */
const isSecretResponse = (value: unknown): value is SecretResponse => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.Name !== 'string' || typeof record.ARN !== 'string') {
    return false;
  }

  if (record.VersionId !== undefined && typeof record.VersionId !== 'string') {
    return false;
  }

  const secretString = secretStringKind(record);
  const secretBinary = secretBinaryKind(record);
  const hasString = (secretString === 'text' || secretString === 'parsed') && secretBinary === 'absent';
  const hasBinary = secretBinary === 'text' && secretString === 'absent';

  return hasString || hasBinary;
};

/**
 * Returns whether an accepted response carries SecretString.
 *
 * @param value - Response that already passed the extension shape check
 * @returns True when SecretString holds text or parsed JSON
 */
const isStringSecret = (value: SecretResponse): value is SecretStringResponse => {
  return value.SecretString !== null && value.SecretString !== undefined;
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
