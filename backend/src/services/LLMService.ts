import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

export interface MemoryStructure {
  summary: string;
  mainTopic: string;
  category: string;
  entities: string[];
  tags: string[];
}

export interface PlanResult {
  plan: string;
  steps: string[];
  duration: number;
  requirements: string[];
}

export class LLMService {
  private openai: OpenAI;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }
  
  async extractMemoryStructure(text: string): Promise<MemoryStructure> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a memory extraction assistant. Extract structured information from user input.
        Return a JSON object with:
        - summary: Brief summary (max 10 words)
        - mainTopic: The main subject
        - category: One of: personal, preference, routine, health, shopping, task, relationship, other
        - entities: Array of mentioned people, places, things
        - tags: Array of relevant tags for searching`
      },
      {
        role: 'user',
        content: text
      }
    ];
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 200
      });
      
      const content = response.choices[0].message.content;
      return JSON.parse(content || '{}');
    } catch (error) {
      console.error('Error extracting memory structure:', error);
      return {
        summary: text.substring(0, 50),
        mainTopic: 'general',
        category: 'other',
        entities: [],
        tags: []
      };
    }
  }
  
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 1536  // Ensure we get 1536 dimensions to match our vector column
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      // Return empty array if OpenAI fails - allows system to work without embeddings
      return [];
    }
  }
  
  async parseIntent(text: string, context?: any): Promise<{
    intent: string;
    confidence: number;
    entities: Record<string, any>;
  }> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an intent parser for a personal assistant.
        Identify the user's intent and extract relevant entities.
        Common intents: remember, recall, start_protocol, create_protocol, show_on_ipad, 
        create_task, plan, daily_briefing, woolworths, general_query.
        Return JSON with: intent, confidence (0-1), entities (object with relevant data)`
      },
      {
        role: 'user',
        content: text
      }
    ];
    
    if (context) {
      messages.push({
        role: 'system',
        content: `Context: ${JSON.stringify(context)}`
      });
    }
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 150
      });
      
      const content = response.choices[0].message.content;
      return JSON.parse(content || '{}');
    } catch (error) {
      console.error('Error parsing intent:', error);
      return {
        intent: 'general_query',
        confidence: 0.5,
        entities: {}
      };
    }
  }
  
  async generateResponse(
    query: string,
    memories: any[],
    context?: any
  ): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are Kelly's personal assistant. 
        Use the provided memories and context to give helpful, personalized responses.
        Be concise and natural in speech - this will be spoken by Alexa.
        Relevant memories: ${JSON.stringify(memories)}`
      },
      {
        role: 'user',
        content: query
      }
    ];
    
    if (context) {
      messages.push({
        role: 'system',
        content: `Additional context: ${JSON.stringify(context)}`
      });
    }
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        temperature: 0.7,
        max_tokens: 150
      });
      
      return response.choices[0].message.content || "I couldn't generate a response.";
    } catch (error) {
      console.error('Error generating response:', error);
      return "Sorry, I'm having trouble processing that request.";
    }
  }
  
  async createPlan(
    request: string,
    memories: any[],
    tasks: any[],
    protocols: any[]
  ): Promise<PlanResult> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a planning assistant for Kelly.
        Create actionable plans based on the request, considering:
        - Stored memories and preferences: ${JSON.stringify(memories)}
        - Existing tasks: ${JSON.stringify(tasks)}
        - Available protocols: ${JSON.stringify(protocols)}
        
        Return JSON with:
        - plan: Natural language summary
        - steps: Array of specific actions
        - duration: Estimated minutes
        - requirements: Things needed`
      },
      {
        role: 'user',
        content: request
      }
    ];
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.5,
        max_tokens: 300
      });
      
      const content = response.choices[0].message.content;
      return JSON.parse(content || '{}');
    } catch (error) {
      console.error('Error creating plan:', error);
      return {
        plan: "I'll help you plan that.",
        steps: ["Let me work on a plan for you"],
        duration: 30,
        requirements: []
      };
    }
  }
  
  async generateDailyBriefing(data: {
    tasks: any[];
    weather?: any;
    calendar?: any[];
    protocols?: any[];
    memories?: any[];
  }): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `Generate a concise daily briefing for Kelly.
        Include: key tasks, scheduled protocols, weather, and relevant reminders.
        Keep it under 30 seconds when spoken.
        Data: ${JSON.stringify(data)}`
      },
      {
        role: 'user',
        content: 'Generate my daily briefing'
      }
    ];
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        temperature: 0.6,
        max_tokens: 200
      });
      
      return response.choices[0].message.content || "Good morning! Let me prepare your briefing.";
    } catch (error) {
      console.error('Error generating briefing:', error);
      return "Good morning! I'm having trouble accessing your information right now.";
    }
  }
}