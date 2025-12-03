import { RequestHandler, HandlerInput, getSlotValue } from 'ask-sdk-core';
import { GoogleAuthService } from '../services/GoogleAuthService';
import { GoogleDriveService } from '../services/GoogleDriveService';

export const SearchDriveIntentHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' 
      && request.intent.name === 'SearchDriveIntent';
  },
  
  async handle(handlerInput: HandlerInput) {
    const query = getSlotValue(handlerInput.requestEnvelope, 'query');
    
    if (!query) {
      return handlerInput.responseBuilder
        .speak('What would you like me to search for in your Drive?')
        .reprompt('Tell me what to search for in your Google Drive.')
        .getResponse();
    }
    
    try {
      const authService = new GoogleAuthService();
      const isInitialized = await authService.initialize();
      
      if (!isInitialized) {
        return handlerInput.responseBuilder
          .speak('You need to authorize Google access first. Please check the backend server for the authorization URL.')
          .getResponse();
      }
      
      const driveService = new GoogleDriveService(authService);
      const files = await driveService.searchFiles(query, 5);
      
      if (files.length === 0) {
        return handlerInput.responseBuilder
          .speak(`I couldn't find any files matching "${query}" in your Drive.`)
          .getResponse();
      }
      
      const fileNames = files.slice(0, 3).map(f => f.name).join(', ');
      const speechText = `I found ${files.length} files. The top results are: ${fileNames}`;
      
      return handlerInput.responseBuilder
        .speak(speechText)
        .getResponse();
    } catch (error) {
      console.error('Error searching Drive:', error);
      
      return handlerInput.responseBuilder
        .speak('I had trouble searching your Google Drive. Please try again later.')
        .getResponse();
    }
  }
};