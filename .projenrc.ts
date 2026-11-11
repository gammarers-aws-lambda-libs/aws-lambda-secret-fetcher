import { ProjenTypeScriptProject } from '@gammarers/projen-projects';
const project = new ProjenTypeScriptProject({
  name: 'aws-lambda-secret-fetcher',
  repositoryUrl: 'https://github.com/gammarers-aws-lambda-libs/aws-lambda-secret-fetcher.git',
  description: 'Lightweight TypeScript library for fetching secrets from AWS Secrets Manager via the AWS Parameters and Secrets Lambda Extension (http://localhost, default port 2773), with retries and timeouts using fetch-retrier.',
  keywords: [
    'aws',
    'lambda',
    'aws-lambda',
    'secrets-manager',
    'secrets',
    'extension',
    'fetcher',
  ],
  devDeps: [
    '@gammarers/projen-projects@^0.8.0',
  ],
  deps: [
    'fetch-retrier@^0.7.1',
    'strict-env-resolver@^0.9.0',
    'quiet-json-parser@^0.4.3',
  ],
  releaseToNpm: true,
  npmTrustedPublishing: true,
});
project.synth();