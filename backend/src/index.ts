import { SkillBuilders } from 'ask-sdk-core';
import { RequestEnvelope, ResponseEnvelope } from 'ask-sdk-model';
import { RememberIntentHandler } from './handlers/RememberIntentHandler';
import { RecallIntentHandler } from './handlers/RecallIntentHandler';
import { StartProtocolIntentHandler } from './handlers/StartProtocolIntentHandler';
import { CreateProtocolIntentHandler } from './handlers/CreateProtocolIntentHandler';
import { ShowOnIPadIntentHandler } from './handlers/ShowOnIPadIntentHandler';
import { CreateTaskIntentHandler } from './handlers/CreateTaskIntentHandler';
import { PlanIntentHandler } from './handlers/PlanIntentHandler';
import { DailyBriefingIntentHandler } from './handlers/DailyBriefingIntentHandler';
import { GeneralQueryIntentHandler } from './handlers/GeneralQueryIntentHandler';
import { SearchDriveIntentHandler } from './handlers/SearchDriveIntentHandler';
import { CheckEmailIntentHandler } from './handlers/CheckEmailIntentHandler';
import { LaunchRequestHandler } from './handlers/LaunchRequestHandler';
import { HelpIntentHandler } from './handlers/HelpIntentHandler';
import { CancelAndStopIntentHandler } from './handlers/CancelAndStopIntentHandler';
import { SessionEndedRequestHandler } from './handlers/SessionEndedRequestHandler';
import { ErrorHandler } from './handlers/ErrorHandler';
import { RequestInterceptor } from './middleware/RequestInterceptor';
import { ResponseInterceptor } from './middleware/ResponseInterceptor';

const skillBuilder = SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    RememberIntentHandler,
    RecallIntentHandler,
    StartProtocolIntentHandler,
    CreateProtocolIntentHandler,
    ShowOnIPadIntentHandler,
    CreateTaskIntentHandler,
    PlanIntentHandler,
    DailyBriefingIntentHandler,
    SearchDriveIntentHandler,
    CheckEmailIntentHandler,
    GeneralQueryIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .addRequestInterceptors(RequestInterceptor)
  .addResponseInterceptors(ResponseInterceptor);

export const handler = async (event: RequestEnvelope): Promise<ResponseEnvelope> => {
  console.log(`REQUEST: ${JSON.stringify(event)}`);
  const response = await skillBuilder.create().invoke(event);
  console.log(`RESPONSE: ${JSON.stringify(response)}`);
  return response;
};

// Lambda lifecycle hook for cleanup (if running in Lambda)
if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, cleaning up...');
    const { cleanupPool } = await import('./database/pool');
    await cleanupPool();
  });
}