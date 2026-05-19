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
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const ecr = __importStar(require("aws-cdk-lib/aws-ecr"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
class OptimizerServiceStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const optimizeRequestSchema = {
            schema: apigateway.JsonSchemaVersion.DRAFT4,
            title: 'OptimizationRequest',
            type: apigateway.JsonSchemaType.OBJECT,
            additionalProperties: false,
            required: ['buyer_country', 'currency', 'items', 'sellers', 'offers'],
            properties: {
                buyer_country: {
                    type: apigateway.JsonSchemaType.STRING,
                    minLength: 1,
                    maxLength: 64,
                },
                currency: {
                    type: apigateway.JsonSchemaType.STRING,
                    pattern: '^[A-Z]{3}$',
                },
                items: {
                    type: apigateway.JsonSchemaType.ARRAY,
                    minItems: 1,
                    maxItems: 500,
                    items: {
                        type: apigateway.JsonSchemaType.OBJECT,
                        additionalProperties: false,
                        required: ['item_id', 'name', 'quantity'],
                        properties: {
                            item_id: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 128 },
                            name: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 256 },
                            quantity: { type: apigateway.JsonSchemaType.INTEGER, minimum: 1, maximum: 1000 },
                            min_condition: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 64 },
                            preferred_languages: {
                                type: apigateway.JsonSchemaType.ARRAY,
                                maxItems: 20,
                                items: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 64 },
                            },
                            cards_per_unit: { type: apigateway.JsonSchemaType.INTEGER, minimum: 0 },
                            unit_weight_grams: { type: apigateway.JsonSchemaType.INTEGER, minimum: 0 },
                            requires_parcel: { type: apigateway.JsonSchemaType.BOOLEAN },
                        },
                    },
                },
                sellers: {
                    type: apigateway.JsonSchemaType.ARRAY,
                    minItems: 1,
                    maxItems: 5000,
                    items: {
                        type: apigateway.JsonSchemaType.OBJECT,
                        additionalProperties: false,
                        required: ['seller_id', 'name', 'country'],
                        properties: {
                            seller_id: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 128 },
                            name: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 256 },
                            country: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 64 },
                        },
                    },
                },
                offers: {
                    type: apigateway.JsonSchemaType.ARRAY,
                    minItems: 1,
                    maxItems: 50000,
                    items: {
                        type: apigateway.JsonSchemaType.OBJECT,
                        additionalProperties: false,
                        required: ['offer_id', 'item_id', 'seller_id', 'unit_price', 'available_quantity'],
                        properties: {
                            offer_id: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 128 },
                            item_id: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 128 },
                            seller_id: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 128 },
                            unit_price: { type: apigateway.JsonSchemaType.NUMBER, minimum: 0 },
                            available_quantity: { type: apigateway.JsonSchemaType.INTEGER, minimum: 1, maximum: 10000 },
                        },
                    },
                },
                preferences: {
                    type: apigateway.JsonSchemaType.OBJECT,
                    additionalProperties: false,
                    properties: {
                        max_sellers: {
                            anyOf: [
                                { type: apigateway.JsonSchemaType.INTEGER, minimum: 1 },
                                { type: apigateway.JsonSchemaType.NULL },
                            ],
                        },
                        allowed_countries: {
                            type: apigateway.JsonSchemaType.ARRAY,
                            maxItems: 100,
                            items: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 64 },
                        },
                        blocked_seller_ids: {
                            type: apigateway.JsonSchemaType.ARRAY,
                            maxItems: 5000,
                            items: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 128 },
                        },
                        return_alternatives: { type: apigateway.JsonSchemaType.INTEGER, minimum: 0, maximum: 0 },
                    },
                },
            },
        };
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
        const api = new apigateway.RestApi(this, 'OptimizerRestApi', {
            restApiName: 'cardmarket-optimizer-api',
            defaultCorsPreflightOptions: {
                allowHeaders: ['content-type'],
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowOrigins: props.allowedOrigins,
                maxAge: cdk.Duration.days(10),
            },
            deployOptions: {
                throttlingBurstLimit: props.apiThrottleBurstLimit,
                throttlingRateLimit: props.apiThrottleRateLimit,
            },
        });
        const integration = new apigateway.LambdaIntegration(optimizerFunction, { proxy: true });
        const optimizeModel = new apigateway.Model(this, 'OptimizeRequestModel', {
            restApi: api,
            contentType: 'application/json',
            modelName: 'OptimizeRequestModel',
            schema: optimizeRequestSchema,
        });
        const requestValidator = new apigateway.RequestValidator(this, 'OptimizeRequestValidator', {
            restApi: api,
            validateRequestBody: true,
            validateRequestParameters: false,
        });
        api.root.addMethod('GET', integration);
        const healthResource = api.root.addResource('health');
        healthResource.addMethod('GET', integration);
        const optimizeResource = api.root.addResource('optimize');
        optimizeResource.addMethod('POST', integration, {
            requestModels: {
                'application/json': optimizeModel,
            },
            requestValidator,
        });
        api.root.addProxy({
            anyMethod: true,
            defaultIntegration: integration,
        });
        new cdk.CfnOutput(this, 'OptimizerApiUrl', {
            value: api.url,
        });
        new cdk.CfnOutput(this, 'OptimizerHealthUrl', {
            value: `${api.url}health`,
        });
    }
}
exports.OptimizerServiceStack = OptimizerServiceStack;
