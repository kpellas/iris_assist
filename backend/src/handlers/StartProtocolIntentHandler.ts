import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response, services } from 'ask-sdk-model';
import { ProtocolService } from '../services/ProtocolService';
import TimerManagementServiceClient = services.timerManagement.TimerManagementServiceClient;

export const StartProtocolIntentHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'StartProtocolIntent';
  },
  
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const request = handlerInput.requestEnvelope.request;
    
    if (request.type !== 'IntentRequest') {
      return handlerInput.responseBuilder
        .speak("Sorry, I couldn't process that request.")
        .getResponse();
    }
    
    const protocolName = request.intent.slots?.protocolName?.value;
    
    if (!protocolName) {
      return handlerInput.responseBuilder
        .speak("Which protocol would you like to start?")
        .reprompt("You can say things like: start red light protocol, or start morning routine.")
        .getResponse();
    }
    
    try {
      const protocolService = new ProtocolService();
      
      // Get the protocol
      const protocol = await protocolService.getProtocol('kelly', protocolName);
      
      if (!protocol) {
        return handlerInput.responseBuilder
          .speak(`I don't have a protocol called ${protocolName}. Would you like me to create one?`)
          .reprompt("You can tell me the steps for this protocol.")
          .getResponse();
      }
      
      // Check if there's already an active run
      const activeRun = await protocolService.getActiveRun('kelly');
      if (activeRun) {
        return handlerInput.responseBuilder
          .speak(`You're already running a protocol. Would you like to cancel it and start ${protocolName} instead?`)
          .reprompt("Say yes to switch protocols, or no to continue the current one.")
          .getResponse();
      }
      
      // Start the protocol run
      const runId = await protocolService.startProtocolRun(protocol.id!, 'kelly');
      
      // Build the response with first step
      const firstStep = protocol.steps[0];
      let speechText = `Starting ${protocol.name} protocol. `;
      speechText += `This will take ${protocol.totalDuration} minutes total. `;
      speechText += `First step: ${firstStep.step} for ${firstStep.duration} minutes. `;
      
      // If the device supports timers, offer to set one
      const { requestEnvelope, serviceClientFactory } = handlerInput;
      const consentToken = requestEnvelope.context.System.user.permissions?.consentToken;
      
      if (consentToken && serviceClientFactory) {
        speechText += `I'll set a timer for ${firstStep.duration} minutes.`;
        
        // Create timer for first step
        try {
          const timerClient = serviceClientFactory.getTimerManagementServiceClient();
          const timerRequest = {
            duration: `PT${firstStep.duration}M`,
            timerLabel: firstStep.step,
            creationBehavior: {
              displayExperience: {
                visibility: 'VISIBLE'
              }
            },
            alertInfo: {
              spokenInfo: {
                content: [{
                  locale: 'en-US',
                  text: `${firstStep.step} complete. Time for the next step.`
                }]
              }
            }
          };
          
          await timerClient.createTimer(timerRequest);
        } catch (error) {
          console.error('Error creating timer:', error);
          speechText += ` Actually, please set your own timer for ${firstStep.duration} minutes.`;
        }
      } else {
        speechText += ` Please set a timer for ${firstStep.duration} minutes.`;
      }
      
      // Log protocol start
      console.log(`Started protocol: ${protocol.name} (${runId})`);
      
      // Store session attributes for multi-turn conversation
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      sessionAttributes.activeProtocolRun = runId;
      sessionAttributes.currentStep = 0;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      
      return handlerInput.responseBuilder
        .speak(speechText)
        .reprompt(`Let me know when you're ready for the next step.`)
        .getResponse();
        
    } catch (error) {
      console.error('Error starting protocol:', error);
      
      return handlerInput.responseBuilder
        .speak("Sorry, I had trouble starting that protocol. Please try again.")
        .getResponse();
    }
  }
};