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
exports.OptimizerServiceStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const apigwv2 = __importStar(require("aws-cdk-lib/aws-apigatewayv2"));
const aws_apigatewayv2_integrations_1 = require("aws-cdk-lib/aws-apigatewayv2-integrations");
const ecr = __importStar(require("aws-cdk-lib/aws-ecr"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
class OptimizerServiceStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const repository = ecr.Repository.fromRepositoryName(this, 'OptimizerRepository', props.ecrRepositoryName);
        const lambdaExecutionRole = new iam.Role(this, 'OptimizerLambdaExecutionRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
        const optimizerFunction = new lambda.Function(this, 'OptimizerFunction', {
            functionName: 'cardmarket-optimizer-api',
            description: 'Containerized FastAPI optimizer service behind API Gateway.',
            code: lambda.Code.fromEcrImage(repository, { tagOrDigest: props.imageTag }),
            handler: lambda.Handler.FROM_IMAGE,
            runtime: lambda.Runtime.FROM_IMAGE,
            architecture: lambda.Architecture.X86_64,
            memorySize: props.lambdaMemorySize,
            timeout: cdk.Duration.seconds(props.lambdaTimeoutSeconds),
            role: lambdaExecutionRole,
            logRetention: logs.RetentionDays.ONE_MONTH,
        });
        const api = new apigwv2.HttpApi(this, 'OptimizerHttpApi', {
            apiName: 'cardmarket-optimizer-api',
            corsPreflight: {
                allowHeaders: ['content-type'],
                allowMethods: [apigwv2.CorsHttpMethod.ANY],
                allowOrigins: props.allowedOrigins,
                maxAge: cdk.Duration.days(10),
            },
        });
        const integration = new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('OptimizerLambdaIntegration', optimizerFunction);
        api.addRoutes({
            path: '/',
            methods: [apigwv2.HttpMethod.ANY],
            integration,
        });
        api.addRoutes({
            path: '/{proxy+}',
            methods: [apigwv2.HttpMethod.ANY],
            integration,
        });
        new cdk.CfnOutput(this, 'OptimizerApiUrl', {
            value: api.apiEndpoint,
        });
        new cdk.CfnOutput(this, 'OptimizerHealthUrl', {
            value: `${api.apiEndpoint}/health`,
        });
    }
}
exports.OptimizerServiceStack = OptimizerServiceStack;
