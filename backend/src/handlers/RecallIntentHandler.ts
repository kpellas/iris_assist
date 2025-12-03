import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response } from 'ask-sdk-model';
import { MemoryService } from '../services/MemoryService';
import { LLMService } from '../services/LLMService';

export const RecallIntentHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'RecallIntent';
  },
  
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const request = handlerInput.requestEnvelope.request;
    
    if (request.type !== 'IntentRequest') {
      return handlerInput.responseBuilder
        .speak("Sorry, I couldn't process that request.")
        .getResponse();
    }
    
    const query = request.intent.slots?.query?.value;
    
    if (!query) {
      return handlerInput.responseBuilder
        .speak("What would you like me to recall?")
        .reprompt("Ask me what you'd like to know.")
        .getResponse();
    }
    
    try {
      const memoryService = new MemoryService();
      const llmService = new LLMService();
      
      // Generate embedding for semantic search if OpenAI is available
      let embedding: number[] | undefined;
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
        embedding = await llmService.generateEmbedding(query);
      }
      
      // Search memories using both semantic and text search
      const memories = await memoryService.searchMemories(
        'kelly',  // TODO: Get actual user ID
        query,
        embedding,
        5  // Get top 5 relevant memories
      );
      
      if (memories.length === 0) {
        return handlerInput.responseBuilder
          .speak(`I don't have any information stored about ${query}. Would you like to tell me about it?`)
          .reprompt("You can tell me something to remember about this.")
          .getResponse();
      }
      
      // Use LLM to generate a natural response from the memories
      let response: string;
      
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
        // Generate intelligent response using context
        response = await llmService.generateResponse(query, memories);
      } else {
        // Fallback to simple response without LLM
        if (memories.length === 1) {
          response = `Based on what you told me: ${memories[0].content}`;
        } else {
          response = `I found ${memories.length} things you told me about that. `;
          response += memories.slice(0, 2).map(m => m.content).join('. Also, ');
        }
      }
      
      console.log(`Recalled ${memories.length} memories for query: ${query}`);
      
      return handlerInput.responseBuilder
        .speak(response)
        .getResponse();
        
    } catch (error) {
      console.error('Error recalling memory:', error);
      
      return handlerInput.responseBuilder
        .speak("Sorry, I had trouble searching my memory. Please try again.")
        .getResponse();
    }
  }
};