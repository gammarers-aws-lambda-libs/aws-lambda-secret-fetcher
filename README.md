# AWS Lambda Secret Fetcher

[![npm version](https://img.shields.io/npm/v/aws-lambda-secret-fetcher?style=flat-square)](https://www.npmjs.com/package/aws-lambda-secret-fetcher)
[![license](https://img.shields.io/npm/l/aws-lambda-secret-fetcher?style=flat-square)](https://www.npmjs.com/package/aws-lambda-secret-fetcher)
[![Node.js](https://img.shields.io/node/v/aws-lambda-secret-fetcher?style=flat-square)](https://www.npmjs.com/package/aws-lambda-secret-fetcher)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-lambda-libs/aws-lambda-secret-fetcher/build.yml?label=build&style=flat-square)](https://github.com/gammarers-aws-lambda-libs/aws-lambda-secret-fetcher/actions/workflows/build.yml)

A TypeScript library that fetches secrets from AWS Secrets Manager through the [AWS Parameters and Secrets Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html). It calls the local extension HTTP API with retries and timeouts.

## Features

- Uses the local Lambda Extension HTTP API (no AWS SDK required)
- Fails fast when `AWS_SESSION_TOKEN` is missing or blank
- Resolves the extension port from `extensionHttpPort`, then `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT`, then `2773`
- Retries timeouts, network errors, and transient HTTP responses, including the extension not-ready response
- Parses JSON string secrets and returns other strings unchanged
- Decodes binary secrets from standard base64 into `Uint8Array`

## How it works

Run this library inside an AWS Lambda function that has the Parameters and Secrets Lambda Extension layer attached. `getSecretValue` reads `AWS_SESSION_TOKEN`, requests `http://localhost:{port}/secretsmanager/get`, and retries while the extension is not ready. A string secret is returned as parsed JSON or as the original string. A binary secret is returned as `Uint8Array`.

If `AWS_SESSION_TOKEN` is missing or blank, the call throws `SecretFetcherSessionTokenError` and does not contact the extension. Check a specific `SecretFetcher*Error` subclass before the `SecretFetcherError` base class.

## Installation

### npm

```bash
npm install aws-lambda-secret-fetcher
```

### yarn

```bash
yarn add aws-lambda-secret-fetcher
```

### pnpm

```bash
pnpm add aws-lambda-secret-fetcher
```

## Usage

```typescript
import { secretFetcher } from 'aws-lambda-secret-fetcher';

const apiKey = await secretFetcher.getSecretValue('my-api-key');
```

Pass a type argument when the secret is JSON. Narrow `Uint8Array` before reading string-secret fields, because a binary secret uses that type.

```typescript
import { secretFetcher } from 'aws-lambda-secret-fetcher';

interface DbCredentials {
  username: string;
  password: string;
  host: string;
}

const credentials = await secretFetcher.getSecretValue<DbCredentials>('my-db-credentials');
if (credentials instanceof Uint8Array) {
  throw new Error('Expected a JSON secret');
}
console.log(credentials.username);

const certificate = await secretFetcher.getSecretValue('my-binary-secret');
if (certificate instanceof Uint8Array) {
  console.log(certificate.byteLength);
}
```

When the extension layer sets `PARAMETERS_SECRETS_EXTENSION_HTTP_PORT`, omit the port. Set `extensionHttpPort` only to override that variable or the default.

```typescript
import { secretFetcher, type GetSecretValueOptions } from 'aws-lambda-secret-fetcher';

const options: GetSecretValueOptions = {
  timeoutMs: 3000,
  retries: 5,
  baseBackoffMs: 500,
};

const secret = await secretFetcher.getSecretValue('my-secret', options);

const onCustomPort = await secretFetcher.getSecretValue('my-secret', {
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

## Requirements

- Node.js >= 20.0.0

## License

This project is licensed under the (Apache-2.0) License.
