# AWS Lambda Secret Fetcher

[![npm version](https://img.shields.io/npm/v/aws-lambda-secret-fetcher.svg)](https://www.npmjs.com/package/aws-lambda-secret-fetcher)
[![License](https://img.shields.io/npm/l/aws-lambda-secret-fetcher.svg)](https://www.npmjs.com/package/aws-lambda-secret-fetcher)

A lightweight TypeScript library for fetching secrets from AWS Secrets Manager using the [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html).

## Features

- Uses the local Lambda Extension API (no AWS SDK required)
- Retry with timeout and full jitter backoff via [fetch-retrier](https://www.npmjs.com/package/fetch-retrier)
- Configurable timeout, retries, and base backoff
- Automatic JSON parsing for secret values
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

## Prerequisites

Your Lambda function must have the [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html) layer attached.

## Usage

### Basic Usage

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

### With Options

```typescript
import { secretFetcher, type GetSecretValueOptions } from 'aws-lambda-secret-fetcher';

const options: GetSecretValueOptions = {
  timeoutMs: 3000,
  retries: 5,
  baseBackoffMs: 500,
};

const secret = await secretFetcher.getSecretValue('my-secret', options);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
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
| `options` | `GetSecretValueOptions` | Optional timeout, retries, and backoff settings |

#### Returns

- `Promise<T>` — The secret value. If the secret is a JSON string, it is automatically parsed as `T`.

#### Throws

- `Error` — If the secret cannot be retrieved after all retries, or if the response format is invalid.

## Retry Behavior

Retries use full jitter exponential backoff. The library retries on:

- HTTP status codes: 429, 500, 502, 503, 504
- Lambda Extension not ready (400 with "not ready to serve traffic")
- Request timeouts
- Network errors

## Requirements

- Node.js >= 20.0.0
- AWS Lambda environment with the Parameters and Secrets Extension

## License

This project is licensed under the Apache-2.0 License.
