#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { OptimizerBootstrapStack } from '../lib/optimizer-bootstrap-stack';
import { OptimizerServiceStack } from '../lib/optimizer-service-stack';

const app = new cdk.App();

const repositorySlug = process.env.GITHUB_REPOSITORY ?? 'REPLACE_ME/my-first-browser-plugin';
const [defaultGithubOwner, defaultGithubRepo] = repositorySlug.split('/');
const account = String(
  app.node.tryGetContext('account') ??
    process.env.CDK_DEFAULT_ACCOUNT ??
    process.env.AWS_ACCOUNT_ID ??
    '',
);
const region = String(
  app.node.tryGetContext('region') ??
    process.env.CDK_DEFAULT_REGION ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION ??
    '',
);

const env = {
  account: account || undefined,
  region: region || undefined,
};

const githubOwner = String(app.node.tryGetContext('githubOwner') ?? defaultGithubOwner ?? 'REPLACE_ME');
const githubRepo = String(app.node.tryGetContext('githubRepo') ?? defaultGithubRepo ?? 'my-first-browser-plugin');
const githubBranch = String(app.node.tryGetContext('githubBranch') ?? 'main');
const ecrRepositoryName = String(app.node.tryGetContext('ecrRepositoryName') ?? 'cardmarket-optimizer-api');
const imageTag = String(app.node.tryGetContext('imageTag') ?? 'latest');
const apiThrottleBurstLimit = Number(app.node.tryGetContext('apiThrottleBurstLimit') ?? 20);
const apiThrottleRateLimit = Number(app.node.tryGetContext('apiThrottleRateLimit') ?? 5);
const lambdaMemorySize = Number(app.node.tryGetContext('lambdaMemorySize') ?? 3072);
const lambdaTimeoutSeconds = Number(app.node.tryGetContext('lambdaTimeoutSeconds') ?? 45);
const allowedOrigins = String(app.node.tryGetContext('allowedOrigins') ?? '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

new OptimizerBootstrapStack(app, 'OptimizerBootstrapStack', {
  env,
  githubOwner,
  githubRepo,
  githubBranch,
  ecrRepositoryName,
});

new OptimizerServiceStack(app, 'OptimizerServiceStack', {
  env,
  ecrRepositoryName,
  imageTag,
  allowedOrigins,
  apiThrottleBurstLimit,
  apiThrottleRateLimit,
  lambdaMemorySize,
  lambdaTimeoutSeconds,
});