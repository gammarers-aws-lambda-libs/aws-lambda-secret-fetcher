import { typescript, javascript, github } from 'projen';
const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'aws-lambda-secret-fetcher',
  projenrcTs: true,
  repository: 'https://github.com/gammarers-aws-lambda-libs/aws-lambda-secret-fetcher.git',
  description: 'Lightweight TypeScript library for fetching secrets from AWS Secrets Manager via the AWS Parameters and Secrets Lambda Extension (http://localhost, default port 2773), with retries and timeouts using fetch-retrier.',
  deps: [
    'fetch-retrier@^0.3.1',
    'strict-env-resolver@^0.5.1',
  ],
  releaseToNpm: true,
  npmTrustedPublishing: true,
  npmAccess: javascript.NpmAccess.PUBLIC,
  typescriptVersion: '5.9.x',
  minNodeVersion: '20.0.0',
  workflowNodeVersion: '24.x',
  depsUpgradeOptions: {
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
      schedule: javascript.UpgradeDependenciesSchedule.WEEKLY,
    },
  },
  githubOptions: {
    projenCredentials: github.GithubCredentials.fromApp({
      permissions: {
        pullRequests: github.workflows.AppPermission.WRITE,
        contents: github.workflows.AppPermission.WRITE,
        workflows: github.workflows.AppPermission.WRITE,
      },
    }),
  },
  autoApproveOptions: {
    allowedUsernames: [
      'gammarers-projen-upgrade-bot[bot]',
      'yicr',
    ],
  },
});
project.synth();