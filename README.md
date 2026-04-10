# AWS Lambda Secret Fetcher

[![npm version](https://img.shields.io/npm/v/aws-lambda-secret-fetcher.svg)](https://www.npmjs.com/package/aws-lambda-secret-fetcher)
[![License](https://img.shields.io/npm/l/aws-lambda-secret-fetcher.svg)](https://www.npmjs.com/package/aws-lambda-secret-fetcher)

A lightweight TypeScript library for fetching secrets from AWS Secrets Manager using the [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html). It calls the extension over `http://localhost` (default port **2773**) with retries and timeouts via [fetch-retrier](https://www.npmjs.com/package/fetch-retrier).

## Features

- Uses the local Lambda Extension HTTP API (no AWS SDK required)
- Configurable extension HTTP port via `extensionHttpPort` (default `2773`; pass through from your environment when using a custom extension port)
- Retry with timeout and full jitter backoff via [fetch-retrier](https://www.npmjs.com/package/fetch-retrier)
- Configurable timeout, retries, and base backoff
- Automatic JSON parsing for secret values stored as JSON strings
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

### Custom extension HTTP port

If you configure a non-default extension port (for example via the Lambda environment variable `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT`), pass that value in from your function code:

```typescript
import { secretFetcher } from 'aws-lambda-secret-fetcher';

const extensionHttpPort = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT ?? '2773';

const secret = await secretFetcher.getSecretValue('my-secret', { extensionHttpPort });
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extensionHttpPort` | `string \| number` | `'2773'` | TCP port the extension listens on at `localhost` |
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

- `Promise<T>` — The secret value. If the secret is a JSON string, it is automatically parsed as `T`.

#### Throws

- `Error` — If the response body is not a valid extension payload, or if the request fails after all retries.
- `FetchRetrierHttpError` (from `fetch-retrier`) — On non-success HTTP responses that are not retried, or after the last failed attempt on retriable statuses.

## Retry behavior

Retries use full jitter exponential backoff. The library retries on:

- HTTP status codes: 429, 500, 502, 503, 504
- Lambda Extension not ready (400 with a body matching “not ready” and “traffic”)
- Request timeouts
- Network errors

## Requirements

- Node.js >= 20.0.0
- AWS Lambda with the [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html) layer attached
- Runtime provides `AWS_SESSION_TOKEN` (used in the `X-Aws-Parameters-Secrets-Token` header expected by the extension)

## License

This project is licensed under the Apache-2.0 License.
