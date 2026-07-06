#!/usr/bin/env node
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
const cdk = __importStar(require("aws-cdk-lib"));
const optimizer_bootstrap_stack_1 = require("../lib/optimizer-bootstrap-stack");
const optimizer_service_stack_1 = require("../lib/optimizer-service-stack");
const app = new cdk.App();
const repositorySlug = process.env.GITHUB_REPOSITORY ?? 'REPLACE_ME/my-first-browser-plugin';
const [defaultGithubOwner, defaultGithubRepo] = repositorySlug.split('/');
const account = String(app.node.tryGetContext('account') ??
    process.env.CDK_DEFAULT_ACCOUNT ??
    process.env.AWS_ACCOUNT_ID ??
    '');
const region = String(app.node.tryGetContext('region') ??
    process.env.CDK_DEFAULT_REGION ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION ??
    '');
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
const lambdaMemorySize = Number(app.node.tryGetContext('lambdaMemorySize') ?? 8192);
const lambdaTimeoutSeconds = Number(app.node.tryGetContext('lambdaTimeoutSeconds') ?? 45);
const allowedOrigins = String(app.node.tryGetContext('allowedOrigins') ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
new optimizer_bootstrap_stack_1.OptimizerBootstrapStack(app, 'OptimizerBootstrapStack', {
    env,
    githubOwner,
    githubRepo,
    githubBranch,
    ecrRepositoryName,
});
new optimizer_service_stack_1.OptimizerServiceStack(app, 'OptimizerServiceStack', {
    env,
    ecrRepositoryName,
    imageTag,
    allowedOrigins,
    apiThrottleBurstLimit,
    apiThrottleRateLimit,
    lambdaMemorySize,
    lambdaTimeoutSeconds,
});
