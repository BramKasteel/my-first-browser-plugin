import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface OptimizerServiceStackProps extends cdk.StackProps {
  ecrRepositoryName: string;
  imageTag: string;
  allowedOrigins: string[];
  lambdaMemorySize: number;
  lambdaTimeoutSeconds: number;
}

export class OptimizerServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OptimizerServiceStackProps) {
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

    const integration = new HttpLambdaIntegration('OptimizerLambdaIntegration', optimizerFunction);

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