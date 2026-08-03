# Optimizer AWS Infrastructure

CDK app creates AWS resources for optimizer API.

Shape:
- ECR repository for optimizer container image
- GitHub Actions OIDC deploy role
- Lambda function from ECR image
- API Gateway HTTP API in front of Lambda

Split into two stacks on purpose:
- `OptimizerBootstrapStack` creates shared foundation: ECR + GitHub Actions role
- `OptimizerServiceStack` creates runtime service from already-pushed image tag

This split avoids chicken-egg problem where Lambda needs image in ECR before service stack can deploy.

## Prerequisites

- AWS account
- local AWS credentials with enough rights for one-time bootstrap
- Node.js 22+
- npm
- CDK bootstrap permissions in target account

## Install

```bash
cd infra
npm install
```

## One-time AWS bootstrap

CDK itself needs bootstrap resources in target account and region.

```bash
cd infra
npx cdk bootstrap aws://ACCOUNT_ID/AWS_REGION
```

Replace `ACCOUNT_ID` and `AWS_REGION` with real values.

If CDK cannot auto-detect account or region from your AWS session, pass them explicitly:

```bash
cd infra
npx cdk deploy OptimizerBootstrapStack \
  -c account=ACCOUNT_ID \
  -c region=AWS_REGION \
  -c githubOwner=YOUR_GITHUB_OWNER \
  -c githubRepo=my-first-browser-plugin \
  -c githubBranch=main \
  -c ecrRepositoryName=cardmarket-optimizer-api
```

Equivalent env-var path also works:

```bash
export AWS_ACCOUNT_ID=ACCOUNT_ID
export AWS_REGION=AWS_REGION
```

## Deploy foundation stack once

Run this once from local machine with real AWS credentials. Replace GitHub owner if repo is under different account.

```bash
cd infra
npx cdk deploy OptimizerBootstrapStack \
  -c githubOwner=YOUR_GITHUB_OWNER \
  -c githubRepo=my-first-browser-plugin \
  -c githubBranch=main \
  -c ecrRepositoryName=cardmarket-optimizer-api
```

Stack outputs:
- `OptimizerRepositoryName`
- `OptimizerRepositoryUri`
- `GitHubActionsRoleArn`

## Configure GitHub repo variables

In GitHub repository settings, add Actions variables:

- `AWS_REGION`: target AWS region, for example `eu-central-1`
- `AWS_GITHUB_ACTIONS_ROLE_ARN`: value from `GitHubActionsRoleArn` stack output

No long-lived AWS access keys needed in GitHub. Workflow uses OIDC.

## CI deploy flow

Workflow file: `.github/workflows/deploy-optimizer-api.yml`

On push to `main` affecting `optimizer-api/`, `infra/`, or workflow file:
1. assume GitHub OIDC role
2. build optimizer image from `optimizer-api/Dockerfile`
3. push image to ECR tagged with commit SHA
4. deploy `OptimizerServiceStack` with that image tag

## Manual service deploy

Useful for first smoke test after image already exists in ECR.

```bash
cd infra
npx cdk deploy OptimizerServiceStack \
  -c imageTag=YOUR_IMAGE_TAG \
  -c ecrRepositoryName=cardmarket-optimizer-api \
  -c allowedOrigins=* \
  -c lambdaMemorySize=10240 \
  -c lambdaTimeoutSeconds=45
```

## Tighten CORS later

Current default is `*` for fast bring-up.

After Chrome extension ID is stable, redeploy with stricter origin:

```bash
cd infra
npx cdk deploy OptimizerServiceStack \
  -c imageTag=YOUR_IMAGE_TAG \
  -c allowedOrigins=chrome-extension://YOUR_EXTENSION_ID
```

## Notes

- Lambda architecture currently fixed to `x86_64` because GitHub-hosted runners build amd64 images by default.
- If you later switch build pipeline to multi-arch and confirm OR-Tools on arm64, change Lambda architecture too.
- GitHub Actions role currently broad enough to keep first deploy simple. Tighten after flow is stable.