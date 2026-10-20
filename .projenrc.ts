import { ProjenTypeScriptProject } from '@gammarers/projen-projects';
const project = new ProjenTypeScriptProject({
  name: 'aws-lambda-secret-fetcher',
  repositoryUrl: 'https://github.com/gammarers-aws-lambda-libs/aws-lambda-secret-fetcher.git',
  description: 'Lightweight TypeScript library for fetching secrets from AWS Secrets Manager via the AWS Parameters and Secrets Lambda Extension (http://localhost, default port 2773), with retries and timeouts using fetch-retrier.',
  devDeps: [
    '@gammarers/projen-projects@^0.5.10',
  ],
  deps: [
    'fetch-retrier@^0.7.1',
    'strict-env-resolver@^0.8.1',
    'quiet-json-parser@^0.3.1',
  ],
  releaseToNpm: true,
  npmTrustedPublishing: true,
});
project.synth();