# AWS Lambda Secret Fetcher

A lightweight TypeScript library for fetching secrets from AWS Secrets Manager using the [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html).

## Features

- 🚀 Uses the local Lambda Extension API (no SDK required)
- 🔄 Built-in retry with exponential backoff (Full Jitter)
- ⏱️ Configurable timeout
- 📦 Automatic JSON parsing for secret values
- 💪 TypeScript support with generics

## Installation

```bash
npm install aws-lambda-secret-fetcher
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
  timeoutMs: 3000,    // Timeout per request (default: 2000)
  retries: 5,         // Number of retry attempts (default: 3)
  baseBackoffMs: 500, // Base backoff time for retries (default: 300)
};

const secret = await secretFetcher.getSecretValue('my-secret', options);
```

## API

The package exports `secretFetcher`, an object that provides:

### `secretFetcher.getSecretValue<T>(name, options?)`

Fetches a secret value from AWS Secrets Manager via the Lambda Extension.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | The name or ARN of the secret |
| `options` | `GetSecretValueOptions` | Optional configuration |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeoutMs` | `number` | `2000` | Request timeout in milliseconds |
| `retries` | `number` | `3` | Number of retry attempts |
| `baseBackoffMs` | `number` | `300` | Base backoff time for exponential retry |

#### Returns

- `Promise<T>` - The secret value. If the secret is a JSON string, it will be automatically parsed.

#### Throws

- `Error` - If the secret cannot be retrieved after all retries
- `Error` - If the response format is invalid

## Retry Behavior

The library implements AWS-recommended Full Jitter exponential backoff for retries. It will retry on:

- HTTP status codes: 429, 500, 502, 503, 504
- Lambda Extension not ready (400 with "not ready to serve traffic")
- Request timeouts
- Network errors

## Requirements

- Node.js >= 20.0.0
- AWS Lambda environment with the Parameters and Secrets Extension

## License

Apache-2.0
