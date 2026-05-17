import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface OptimizerBootstrapStackProps extends cdk.StackProps {
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  ecrRepositoryName: string;
}

export class OptimizerBootstrapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OptimizerBootstrapStackProps) {
    super(scope, id, props);

    const repository = new ecr.Repository(this, 'OptimizerRepository', {
      repositoryName: props.ecrRepositoryName,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 50 }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      emptyOnDelete: false,
    });

    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const githubActionsRole = new iam.Role(this, 'GitHubActionsDeployRole', {
      roleName: 'cardmarket-optimizer-github-actions-role',
      description: 'GitHub Actions deploy role for optimizer API infrastructure and image pushes.',
      assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${props.githubOwner}/${props.githubRepo}:ref:refs/heads/${props.githubBranch}`,
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('PowerUserAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('IAMFullAccess'),
      ],
    });

    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: ['*'],
      }),
    );

    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    );

    githubActionsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:BatchGetImage',
          'ecr:CompleteLayerUpload',
          'ecr:DescribeImages',
          'ecr:DescribeRepositories',
          'ecr:InitiateLayerUpload',
          'ecr:ListImages',
          'ecr:PutImage',
          'ecr:UploadLayerPart',
        ],
        resources: [repository.repositoryArn],
      }),
    );

    new cdk.CfnOutput(this, 'OptimizerRepositoryName', {
      value: repository.repositoryName,
    });

    new cdk.CfnOutput(this, 'OptimizerRepositoryUri', {
      value: repository.repositoryUri,
    });

    new cdk.CfnOutput(this, 'GitHubActionsRoleArn', {
      value: githubActionsRole.roleArn,
    });
  }
}