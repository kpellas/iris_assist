import { RequestHandler, HandlerInput } from 'ask-sdk-core';
import { GoogleAuthService } from '../services/GoogleAuthService';
import { GoogleGmailService } from '../services/GoogleGmailService';

export const CheckEmailIntentHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' 
      && request.intent.name === 'CheckEmailIntent';
  },
  
  async handle(handlerInput: HandlerInput) {
    try {
      const authService = new GoogleAuthService();
      const isInitialized = await authService.initialize();
      
      if (!isInitialized) {
        return handlerInput.responseBuilder
          .speak('You need to authorize Google access first. Please check the backend server for the authorization URL.')
          .getResponse();
      }
      
      const gmailService = new GoogleGmailService(authService);
      const unreadEmails = await gmailService.getUnreadEmails(5);
      
      if (unreadEmails.length === 0) {
        return handlerInput.responseBuilder
          .speak('You have no new emails.')
          .getResponse();
      }
      
      const emailSummary = unreadEmails.slice(0, 3).map(email => {
        const from = email.from?.replace(/<.*>/, '').trim() || 'Unknown sender';
        const subject = email.subject || 'No subject';
        return `from ${from} about ${subject}`;
      }).join(', ');
      
      const speechText = `You have ${unreadEmails.length} unread emails. ${emailSummary}`;
      
      return handlerInput.responseBuilder
        .speak(speechText)
        .getResponse();
    } catch (error) {
      console.error('Error checking email:', error);
      
      return handlerInput.responseBuilder
        .speak('I had trouble checking your email. Please try again later.')
        .getResponse();
    }
  }
};