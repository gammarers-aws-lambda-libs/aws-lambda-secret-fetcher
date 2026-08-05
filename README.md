# AWS Lambda Secret Fetcher

[![npm version](https://img.shields.io/npm/v/aws-lambda-secret-fetcher.svg)](https://www.npmjs.com/package/aws-lambda-secret-fetcher)
[![License](https://img.shields.io/npm/l/aws-lambda-secret-fetcher.svg)](https://www.npmjs.com/package/aws-lambda-secret-fetcher)

A lightweight TypeScript library for fetching secrets from AWS Secrets Manager using the [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html). It calls the extension at `http://localhost:{port}` with retries and timeouts via [fetch-retrier](https://www.npmjs.com/package/fetch-retrier).

Environment variables are validated with [strict-env-resolver](https://www.npmjs.com/package/strict-env-resolver). Secret JSON values are parsed with [quiet-json-parser](https://www.npmjs.com/package/quiet-json-parser). The extension HTTP port is resolved automatically: `extensionHttpPort` option → `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT` environment variable → default `2773`.

## Lambda execution environment only

This library is designed to run **only inside an AWS Lambda execution environment** with the [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html) layer attached.

It is not intended for local development, unit tests against a real extension, or other runtimes (ECS, EC2, etc.) unless those environments replicate Lambda's extension sidecar and inject `AWS_SESSION_TOKEN`. If `AWS_SESSION_TOKEN` is missing or blank, `getSecretValue` throws immediately with a clear error instead of calling the extension with an invalid token.

## Features

- Uses the local Lambda Extension HTTP API (no AWS SDK required)
- Typed environment variable resolution via [strict-env-resolver](https://www.npmjs.com/package/strict-env-resolver) (`AWS_SESSION_TOKEN`, `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT`)
- Fail-fast when `AWS_SESSION_TOKEN` is missing or blank, with a Lambda-specific guidance message
- Reads the extension HTTP port from `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT` when `extensionHttpPort` is omitted (default `2773`)
- Optional `extensionHttpPort` override for explicit port configuration
- Retry with timeout and full jitter backoff via [fetch-retrier](https://www.npmjs.com/package/fetch-retrier)
- Configurable timeout, retries, and base backoff
- Automatic JSON parsing via [quiet-json-parser](https://www.npmjs.com/package/quiet-json-parser); invalid or empty JSON falls back to the original string
- TypeScript support with generics

## Installation

**npm**

```bash
npm install aws-lambda-secret-fetcher
```

**yarn**

```bash
yarn add aws-lambda-secret-fetcher
```

## Usage

### Basic usage

```typescript
import { secretFetcher } from 'aws-lambda-secret-fetcher';

// Get a plain string secret
const apiKey = await secretFetcher.getSecretValue('my-api-key');

// Get a JSON secret with type inference
interface DbCredentials {
  username: string;
  password: string;
  host: string;
}

const credentials = await secretFetcher.getSecretValue<DbCredentials>('my-db-credentials');
console.log(credentials.username); // Type-safe access
```

When the extension layer sets `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT` on your Lambda function (the usual case), you do not need to pass a port in code.

### With options

```typescript
import { secretFetcher, type GetSecretValueOptions } from 'aws-lambda-secret-fetcher';

const options: GetSecretValueOptions = {
  timeoutMs: 3000,
  retries: 5,
  baseBackoffMs: 500,
};

const secret = await secretFetcher.getSecretValue('my-secret', options);
```

### Override extension HTTP port

Use `extensionHttpPort` only when you need to override the environment variable or default:

```typescript
import { secretFetcher } from 'aws-lambda-secret-fetcher';

const secret = await secretFetcher.getSecretValue('my-secret', {
  extensionHttpPort: 9999,
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extensionHttpPort` | `string \| number` | `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT` or `2773` | TCP port the extension listens on at `localhost`. Highest precedence when set. Must be an integer between 1 and 65535. |
| `timeoutMs` | `number` | `2000` | Request timeout in milliseconds per attempt |
| `retries` | `number` | `3` | Maximum number of attempts (including the first request) |
| `baseBackoffMs` | `number` | `300` | Base delay in milliseconds for backoff between retries |

## API

The package exports `secretFetcher`, an object that provides:

### `secretFetcher.getSecretValue<T>(name, options?)`

Fetches a secret value from AWS Secrets Manager via the Lambda Extension.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | The name or ARN of the secret |
| `options` | `GetSecretValueOptions` | Optional extension port, timeout, retries, and backoff |

#### Returns

- `Promise<T>` — The secret value. Valid JSON is parsed as `T` via quiet-json-parser; otherwise the original string is returned.

#### Throws

- `Error` — If `AWS_SESSION_TOKEN` is unset or blank (not running in Lambda), the response body is not a valid extension payload, or the extension HTTP port is invalid (not a number or outside 1–65535).
- `StrictEnvValidationError` (from `strict-env-resolver` ^0.5) — If an environment variable value is invalid (e.g. non-numeric `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT`).
- `FetchRetrierHttpError` (from `fetch-retrier` ^0.3) — On non-success HTTP responses that are not retried, or after the last failed attempt on retriable statuses.
- `FetchRetrierNetworkError` (from `fetch-retrier` ^0.3) — On network-level `fetch` failures after the last attempt.
- `FetchRetrierAbortError` (from `fetch-retrier` ^0.3) — On per-attempt timeout after the last attempt.

## Retry behavior

Retries use full jitter exponential backoff. The library retries on:

- HTTP status codes: 429, 500, 502, 503, 504
- Lambda Extension not ready (400 with a body matching "not ready" and "traffic")
- Request timeouts
- Network errors

## Requirements

- Node.js >= 20.0.0
- **AWS Lambda execution environment** (this library does not work outside Lambda)
- [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html) layer attached to the function
- `AWS_SESSION_TOKEN` provided by the Lambda runtime (required string; sent as `X-Aws-Parameters-Secrets-Token` to the extension; missing or blank values fail fast with a guidance error)
- Optional: `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT` set by the extension layer when using a non-default port (parsed as a number via strict-env-resolver; defaults to `2773` when unset)

## License

This project is licensed under the Apache-2.0 License.
