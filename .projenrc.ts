import { typescript, javascript, github } from 'projen';
const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'aws-lambda-secret-fetcher',
  projenrcTs: true,
  repository: 'https://github.com/gammarers-aws-lambda-libs/aws-lambda-secret-fetcher.git',
  deps: [
    'fetch-retrier@^0.2',
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