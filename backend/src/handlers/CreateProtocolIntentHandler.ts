import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response } from 'ask-sdk-model';
import { ProtocolService, ProtocolStep } from '../services/ProtocolService';
import { LLMService } from '../services/LLMService';

export const CreateProtocolIntentHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'CreateProtocolIntent';
  },
  
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const request = handlerInput.requestEnvelope.request;
    
    if (request.type !== 'IntentRequest') {
      return handlerInput.responseBuilder
        .speak("Sorry, I couldn't process that request.")
        .getResponse();
    }
    
    const protocolDefinition = request.intent.slots?.protocolDefinition?.value;
    
    if (!protocolDefinition) {
      return handlerInput.responseBuilder
        .speak("What protocol would you like to create? Tell me the name and steps.")
        .reprompt("For example, say: Create red light protocol with 3 minutes neck, 3 minutes each cheek, 5 minutes chest.")
        .getResponse();
    }
    
    try {
      const protocolService = new ProtocolService();
      const llmService = new LLMService();
      
      // Parse the protocol definition using LLM or regex
      const parsedProtocol = await parseProtocolDefinition(protocolDefinition, llmService);
      
      if (!parsedProtocol) {
        return handlerInput.responseBuilder
          .speak("I couldn't understand the protocol steps. Please describe them clearly with durations.")
          .reprompt("Tell me each step and how many minutes it takes.")
          .getResponse();
      }
      
      // Check if protocol already exists
      const existing = await protocolService.getProtocol('kelly', parsedProtocol.name);
      if (existing) {
        return handlerInput.responseBuilder
          .speak(`You already have a ${parsedProtocol.name} protocol. Would you like to update it?`)
          .reprompt("Say yes to update the protocol, or no to keep the existing one.")
          .getResponse();
      }
      
      // Create the protocol
      const protocolId = await protocolService.createProtocol({
        userId: 'kelly',
        name: parsedProtocol.name,
        description: parsedProtocol.description,
        steps: parsedProtocol.steps,
        tags: parsedProtocol.tags
      });
      
      // Build confirmation message
      const totalDuration = parsedProtocol.steps.reduce((sum, step) => sum + step.duration, 0);
      let speechText = `I've created the ${parsedProtocol.name} protocol with ${parsedProtocol.steps.length} steps, `;
      speechText += `taking ${totalDuration} minutes total. `;
      speechText += `The steps are: `;
      speechText += parsedProtocol.steps.map(s => `${s.step} for ${s.duration} minutes`).join(', ');
      speechText += `. You can start it anytime by saying: start ${parsedProtocol.name}.`;
      
      console.log(`Created protocol: ${parsedProtocol.name} (${protocolId})`);
      
      return handlerInput.responseBuilder
        .speak(speechText)
        .getResponse();
        
    } catch (error) {
      console.error('Error creating protocol:', error);
      
      return handlerInput.responseBuilder
        .speak("Sorry, I had trouble creating that protocol. Please try again.")
        .getResponse();
    }
  }
};

async function parseProtocolDefinition(
  definition: string, 
  llmService: LLMService
): Promise<{ name: string; description: string; steps: ProtocolStep[]; tags: string[] } | null> {
  // Try to parse with LLM if available
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
    try {
      const prompt = `Parse this protocol definition into structured format:
      "${definition}"
      
      Return JSON with:
      - name: protocol name
      - description: brief description
      - steps: array of {step: string, duration: number} where duration is in minutes
      - tags: relevant tags
      
      Example: "red light protocol with 3 minutes neck, 5 minutes face"
      Returns: {
        "name": "red light",
        "description": "Red light therapy protocol",
        "steps": [{"step": "neck", "duration": 3}, {"step": "face", "duration": 5}],
        "tags": ["therapy", "health", "daily"]
      }`;
      
      const result = await llmService.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });
      
      return JSON.parse(result.choices[0].message.content || '{}');
    } catch (error) {
      console.error('LLM parsing failed, falling back to regex:', error);
    }
  }
  
  // Fallback to regex parsing
  const nameMatch = definition.match(/^(?:create\s+)?(?:a\s+)?(?:new\s+)?([^:,]+?)(?:\s+protocol|\s+routine)?(?:\s+with|\s*:|\s*,)/i);
  const name = nameMatch ? nameMatch[1].trim().toLowerCase() : 'custom protocol';
  
  // Parse steps with duration patterns
  const stepPattern = /(\d+)\s*(?:minutes?|mins?)\s+(?:of\s+)?([^,]+)|([^,]+?)\s+for\s+(\d+)\s*(?:minutes?|mins?)/gi;
  const steps: ProtocolStep[] = [];
  let match;
  
  while ((match = stepPattern.exec(definition)) !== null) {
    if (match[1] && match[2]) {
      // Pattern: "3 minutes neck"
      steps.push({
        step: match[2].trim(),
        duration: parseInt(match[1])
      });
    } else if (match[3] && match[4]) {
      // Pattern: "neck for 3 minutes"
      steps.push({
        step: match[3].trim(),
        duration: parseInt(match[4])
      });
    }
  }
  
  // If no steps found, try simple comma separation
  if (steps.length === 0) {
    const parts = definition.split(/,|and/i);
    for (const part of parts) {
      const durationMatch = part.match(/(\d+)\s*(?:minutes?|mins?)/i);
      if (durationMatch) {
        const duration = parseInt(durationMatch[1]);
        const step = part.replace(durationMatch[0], '').trim();
        if (step) {
          steps.push({ step, duration });
        }
      }
    }
  }
  
  if (steps.length === 0) {
    return null;
  }
  
  // Generate tags based on name
  const tags = [];
  if (name.includes('morning')) tags.push('morning');
  if (name.includes('evening')) tags.push('evening');
  if (name.includes('red light')) tags.push('therapy', 'health');
  if (name.includes('workout') || name.includes('exercise')) tags.push('fitness');
  if (name.includes('skin')) tags.push('skincare');
  tags.push('routine');
  
  return {
    name,
    description: `${name} protocol`,
    steps,
    tags
  };
}