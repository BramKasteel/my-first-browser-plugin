"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizerBootstrapStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ecr = __importStar(require("aws-cdk-lib/aws-ecr"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
class OptimizerBootstrapStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        githubActionsRole.addToPolicy(new iam.PolicyStatement({
            actions: ['sts:AssumeRole'],
            resources: ['*'],
        }));
        githubActionsRole.addToPolicy(new iam.PolicyStatement({
            actions: ['ecr:GetAuthorizationToken'],
            resources: ['*'],
        }));
        githubActionsRole.addToPolicy(new iam.PolicyStatement({
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
        }));
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
exports.OptimizerBootstrapStack = OptimizerBootstrapStack;
