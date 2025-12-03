import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response } from 'ask-sdk-model';
import { MemoryService } from '../services/MemoryService';
import { LLMService } from '../services/LLMService';

export const RememberIntentHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'RememberIntent';
  },
  
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const request = handlerInput.requestEnvelope.request;
    
    if (request.type !== 'IntentRequest') {
      return handlerInput.responseBuilder
        .speak("Sorry, I couldn't process that request.")
        .getResponse();
    }
    
    const fact = request.intent.slots?.fact?.value;
    
    if (!fact) {
      return handlerInput.responseBuilder
        .speak("What would you like me to remember?")
        .reprompt("Tell me what to remember.")
        .getResponse();
    }
    
    try {
      // Initialize services
      const memoryService = new MemoryService();
      const llmService = new LLMService();
      
      // Extract structured information from the fact
      const structuredData = await llmService.extractMemoryStructure(fact);
      
      // Generate embedding for semantic search (only if OpenAI is configured)
      let embedding: number[] | undefined;
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
        embedding = await llmService.generateEmbedding(fact);
      }
      
      // Store the memory
      const memoryId = await memoryService.storeMemory({
        userId: 'kelly',  // TODO: Get actual user ID from session
        content: fact,
        category: structuredData.category,
        entities: structuredData.entities,
        tags: structuredData.tags,
        embedding: embedding
      });
      
      // Create natural confirmation
      const confirmationPhrases = [
        `Got it. I'll remember that ${structuredData.summary}.`,
        `I've stored that information about ${structuredData.mainTopic}.`,
        `Noted. I'll remember ${structuredData.summary}.`,
        `I've saved that detail about ${structuredData.mainTopic}.`,
        `Understood. I'll keep that in mind.`,
        `I've made a note about ${structuredData.mainTopic}.`
      ];
      
      const confirmation = confirmationPhrases[Math.floor(Math.random() * confirmationPhrases.length)];
      
      // Log for debugging
      console.log(`Memory stored: ${memoryId} - ${fact}`);
      
      return handlerInput.responseBuilder
        .speak(confirmation)
        .getResponse();
        
    } catch (error) {
      console.error('Error storing memory:', error);
      
      return handlerInput.responseBuilder
        .speak("Sorry, I had trouble storing that memory. Please try again.")
        .getResponse();
    }
  }
};