import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response } from 'ask-sdk-model';
import { TaskService } from '../services/TaskService';

export const CreateTaskIntentHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'CreateTaskIntent';
  },
  
  async handle(handlerInput: HandlerInput): Promise<Response> {
    const request = handlerInput.requestEnvelope.request;
    
    if (request.type !== 'IntentRequest') {
      return handlerInput.responseBuilder
        .speak("Sorry, I couldn't process that request.")
        .getResponse();
    }
    
    const task = request.intent.slots?.task?.value;
    
    if (!task) {
      return handlerInput.responseBuilder
        .speak("What task would you like me to add?")
        .reprompt("Tell me what you need to do.")
        .getResponse();
    }
    
    try {
      const taskService = new TaskService();
      
      // Parse due date from task if mentioned
      const { title, dueDate, priority } = parseTask(task);
      
      // Create the task
      const taskId = await taskService.createTask({
        userId: 'kelly',
        title,
        status: 'pending',
        priority,
        dueDate,
        category: inferCategory(title)
      });
      
      let speechText = `I've added "${title}" to your task list.`;
      if (dueDate) {
        speechText += ` It's due ${formatDueDate(dueDate)}.`;
      }
      
      console.log(`Created task: ${title} (${taskId})`);
      
      return handlerInput.responseBuilder
        .speak(speechText)
        .getResponse();
        
    } catch (error) {
      console.error('Error creating task:', error);
      
      return handlerInput.responseBuilder
        .speak("Sorry, I had trouble adding that task. Please try again.")
        .getResponse();
    }
  }
};

function parseTask(input: string): { title: string; dueDate?: Date; priority: number } {
  let title = input;
  let dueDate: Date | undefined;
  let priority = 3; // Default medium priority
  
  // Check for priority keywords
  if (input.toLowerCase().includes('urgent') || input.toLowerCase().includes('asap')) {
    priority = 1;
  } else if (input.toLowerCase().includes('important')) {
    priority = 2;
  } else if (input.toLowerCase().includes('low priority')) {
    priority = 4;
  }
  
  // Parse due date patterns
  const tomorrow = /tomorrow/i;
  const today = /today/i;
  const nextWeek = /next week/i;
  
  if (tomorrow.test(input)) {
    dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    title = title.replace(tomorrow, '').trim();
  } else if (today.test(input)) {
    dueDate = new Date();
    title = title.replace(today, '').trim();
  } else if (nextWeek.test(input)) {
    dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    title = title.replace(nextWeek, '').trim();
  }
  
  // Clean up title
  title = title.replace(/\s+/g, ' ').trim();
  title = title.replace(/^(to|need to|have to|must|should)\s+/i, '');
  
  return { title, dueDate, priority };
}

function inferCategory(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('buy') || lower.includes('shop') || lower.includes('get')) return 'shopping';
  if (lower.includes('call') || lower.includes('email') || lower.includes('message')) return 'communication';
  if (lower.includes('workout') || lower.includes('exercise') || lower.includes('gym')) return 'fitness';
  if (lower.includes('cook') || lower.includes('meal') || lower.includes('dinner')) return 'cooking';
  if (lower.includes('clean') || lower.includes('tidy') || lower.includes('organize')) return 'household';
  if (lower.includes('work') || lower.includes('meeting') || lower.includes('project')) return 'work';
  return 'personal';
}

function formatDueDate(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'today';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'tomorrow';
  } else {
    const days = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return `in ${days} days`;
  }
}