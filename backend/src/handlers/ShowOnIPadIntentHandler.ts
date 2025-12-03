import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response } from 'ask-sdk-model';
import axios from 'axios';

export const ShowOnIPadIntentHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'ShowOnIPadIntent';
  },
  
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const request = handlerInput.requestEnvelope.request;
    
    if (request.type !== 'IntentRequest') {
      return handlerInput.responseBuilder
        .speak("Sorry, I couldn't process that request.")
        .getResponse();
    }
    
    const content = request.intent.slots?.content?.value;
    
    if (!content) {
      return handlerInput.responseBuilder
        .speak("What would you like to show on your iPad?")
        .reprompt("You can say things like: show the lasagne recipe, or show my tasks.")
        .getResponse();
    }
    
    try {
      // Parse what type of content to display
      const displayContent = parseDisplayContent(content);
      
      // Send display update to backend via HTTP
      // (The backend will then broadcast via WebSocket to the iPad)
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
      
      await axios.post(`${backendUrl}/api/display/update`, {
        userId: 'kelly',
        deviceId: 'ipad',
        view: displayContent.view,
        data: displayContent.data
      }, {
        timeout: 5000
      });
      
      // Build response based on content type
      let speechText = '';
      switch (displayContent.view) {
        case 'recipe':
          speechText = `I've displayed the ${displayContent.data.name} recipe on your iPad.`;
          break;
        case 'protocol':
          speechText = `The ${displayContent.data.name} protocol is now on your iPad.`;
          break;
        case 'tasks':
          speechText = `Your task list is now showing on the iPad.`;
          break;
        case 'timer':
          speechText = `Timer display is ready on your iPad.`;
          break;
        case 'dashboard':
          speechText = `Your dashboard is now displayed.`;
          break;
        default:
          speechText = `I've updated your iPad display.`;
      }
      
      console.log(`Updated iPad display: ${displayContent.view}`, displayContent.data);
      
      return handlerInput.responseBuilder
        .speak(speechText)
        .getResponse();
        
    } catch (error) {
      console.error('Error updating iPad display:', error);
      
      // Check if it's a connection error
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return handlerInput.responseBuilder
          .speak("I couldn't connect to your iPad. Make sure the app is open.")
          .getResponse();
      }
      
      return handlerInput.responseBuilder
        .speak("Sorry, I had trouble updating your iPad display. Please try again.")
        .getResponse();
    }
  }
};

function parseDisplayContent(content: string): { view: string; data: any } {
  const lower = content.toLowerCase();
  
  // Recipe patterns
  if (lower.includes('recipe')) {
    const recipeMatch = content.match(/(?:the\s+)?(\w+)\s+recipe/i);
    const recipeName = recipeMatch ? recipeMatch[1] : 'recipe';
    return {
      view: 'recipe',
      data: {
        name: recipeName,
        id: recipeName.toLowerCase().replace(/\s+/g, '-')
      }
    };
  }
  
  // Protocol patterns
  if (lower.includes('protocol') || lower.includes('routine')) {
    const protocolMatch = content.match(/(?:the\s+)?(\w+)\s+(?:protocol|routine)/i);
    const protocolName = protocolMatch ? protocolMatch[1] : 'protocol';
    return {
      view: 'protocol',
      data: {
        name: protocolName
      }
    };
  }
  
  // Task patterns
  if (lower.includes('task') || lower.includes('todo') || lower.includes('list')) {
    return {
      view: 'tasks',
      data: {
        filter: lower.includes('today') ? 'today' : 'all'
      }
    };
  }
  
  // Timer patterns
  if (lower.includes('timer') || lower.includes('countdown')) {
    return {
      view: 'timer',
      data: {}
    };
  }
  
  // Dashboard/home
  if (lower.includes('dashboard') || lower.includes('home') || lower.includes('overview')) {
    return {
      view: 'dashboard',
      data: {}
    };
  }
  
  // Calendar patterns
  if (lower.includes('calendar') || lower.includes('schedule')) {
    return {
      view: 'calendar',
      data: {
        date: new Date().toISOString()
      }
    };
  }
  
  // Memories
  if (lower.includes('memor')) {
    return {
      view: 'memories',
      data: {
        category: 'all'
      }
    };
  }
  
  // Default to dashboard
  return {
    view: 'dashboard',
    data: {
      query: content
    }
  };
}