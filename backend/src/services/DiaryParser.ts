import { format } from 'date-fns';

interface ExtractedData {
  wakeTime?: string;
  sleepTime?: string;
  activities: ActivityData[];
  products: ProductData[];
  metrics: MetricData[];
  health: HealthData[];
  nutrition: NutritionData[];
  habits: HabitData[];
  keyEvents: string[];
  mood?: number;
  energy?: number;
}

interface ActivityData {
  type: string;
  name: string;
  duration?: number;
  calories?: number;
  intensity?: string;
  sets?: number;
  reps?: number;
  timestamp?: string;
  notes?: string;
}

interface ProductData {
  name: string;
  category?: string;
  duration?: number;
  rating?: number;
  notes?: string;
}

interface MetricData {
  category: string;
  type: string;
  value?: number;
  unit?: string;
  text?: string;
  timestamp?: string;
  notes?: string;
}

interface HealthData {
  type: string;
  value: number;
  secondaryValue?: number;
  unit?: string;
  source?: string;
  timestamp?: string;
}

interface NutritionData {
  mealType?: string;
  items: string[];
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  timestamp?: string;
}

interface HabitData {
  name: string;
  completed: boolean;
  notes?: string;
}

export class DiaryParser {
  private timePatterns = {
    wake: /woke\s+(up\s+)?(?:at\s+)?(\d{1,2}[:.]\d{2}(?:\s*[ap]m?)?|\d{1,2}(?:\s*[ap]m?))/i,
    sleep: /(?:went to |fell a)?sleep\s+(?:at\s+)?(\d{1,2}[:.]\d{2}(?:\s*[ap]m?)?|\d{1,2}(?:\s*[ap]m?))/i,
    general: /(?:at|around)\s+(\d{1,2}[:.]\d{2}(?:\s*[ap]m?)?|\d{1,2}(?:\s*[ap]m?))/i
  };

  private exercisePatterns = {
    workout: /(?:did|completed|finished)\s+(.+?)\s+for\s+(\d+)\s+(minutes?|mins?|hours?|hrs?)/i,
    calories: /(?:burned|burnt)\s+(\d+)\s+(?:calories|cals)/i,
    intervals: /(\d+)\s*[-x]\s*(\d+)s?\s+(?:intervals?|sets?)/i,
    reps: /(\d+)\s+(?:reps?|repetitions?)\s+(?:of\s+)?(.+?)(?:\.|,|$)/i,
    duration: /(\d+)\s+(minutes?|mins?|hours?|hrs?)/i,
  };

  private productPatterns = {
    usage: /(?:used?|applied|tried)\s+(.+?)\s+(?:for\s+)?(\d+)?\s*(?:minutes?|mins?)?\s*(?:and|,|\.|$)/i,
    rating: /(?:was\s+)?(\d+)\s*(?:out\s*of\s*10|\/10)/i,
    product: /(?:signed up for|started|switched to|trying)\s+(.+?)(?:\.|,|$)/i
  };

  private healthPatterns = {
    weight: /(?:weigh(?:ed)?|weight)\s+(\d+(?:\.\d+)?)\s*(kg|lbs?|pounds?)?/i,
    heartRate: /(?:heart rate|hr|bpm)\s*(?:was|is)?\s*(\d+)/i,
    bloodPressure: /(?:blood pressure|bp)\s*(?:was|is)?\s*(\d+)\/(\d+)/i,
    whoop: /whoop\s+(?:says?|showed?|data)?\s*(.+?)(?:\.|,|$)/i
  };

  private nutritionPatterns = {
    meal: /(breakfast|lunch|dinner|snack)(?:\s*[:]\s*)?(.+?)(?:\.|,|$)/i,
    calories: /(?:ate|consumed|had)\s+(\d+)\s+(?:calories|cals)/i,
    food: /(?:had|ate|consumed)\s+(.+?)(?:\.|,|and|for\s+(?:breakfast|lunch|dinner)|$)/i
  };

  private moodPatterns = {
    mood: /mood\s*(?:was|is)?\s*(\d+)\s*(?:out\s*of\s*10|\/10)?/i,
    energy: /energy\s*(?:level)?\s*(?:was|is)?\s*(\d+)\s*(?:out\s*of\s*10|\/10)?/i,
    feeling: /(?:felt?|feeling)\s+(\w+)/i
  };

  parse(text: string): ExtractedData {
    const sentences = this.splitIntoSentences(text);
    const extracted: ExtractedData = {
      activities: [],
      products: [],
      metrics: [],
      health: [],
      nutrition: [],
      habits: [],
      keyEvents: []
    };

    for (const sentence of sentences) {
      this.extractTimes(sentence, extracted);
      this.extractActivities(sentence, extracted);
      this.extractProducts(sentence, extracted);
      this.extractHealth(sentence, extracted);
      this.extractNutrition(sentence, extracted);
      this.extractMoodEnergy(sentence, extracted);
      this.extractKeyEvents(sentence, extracted);
    }

    return extracted;
  }

  private splitIntoSentences(text: string): string[] {
    // Split on periods, but preserve decimal numbers
    return text.split(/(?<!\d)\.(?!\d)/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private extractTimes(sentence: string, data: ExtractedData): void {
    const wakeMatch = sentence.match(this.timePatterns.wake);
    if (wakeMatch) {
      data.wakeTime = this.normalizeTime(wakeMatch[2] || wakeMatch[1]);
    }

    const sleepMatch = sentence.match(this.timePatterns.sleep);
    if (sleepMatch) {
      data.sleepTime = this.normalizeTime(sleepMatch[1]);
    }
  }

  private extractActivities(sentence: string, data: ExtractedData): void {
    // Check for interval training
    const intervalMatch = sentence.match(this.exercisePatterns.intervals);
    if (intervalMatch) {
      const activity: ActivityData = {
        type: 'exercise',
        name: 'Interval Training',
        sets: parseInt(intervalMatch[1]),
        notes: `${intervalMatch[1]} intervals of ${intervalMatch[2]} seconds`
      };

      // Look for duration in the same sentence
      const durationMatch = sentence.match(this.exercisePatterns.duration);
      if (durationMatch) {
        activity.duration = this.parseDuration(durationMatch[1], durationMatch[2]);
      }

      // Look for calories
      const caloriesMatch = sentence.match(this.exercisePatterns.calories);
      if (caloriesMatch) {
        activity.calories = parseInt(caloriesMatch[1]);
      }

      data.activities.push(activity);
      return;
    }

    // Check for general workout
    const workoutMatch = sentence.match(this.exercisePatterns.workout);
    if (workoutMatch) {
      const activity: ActivityData = {
        type: 'exercise',
        name: workoutMatch[1],
        duration: this.parseDuration(workoutMatch[2], workoutMatch[3])
      };

      const caloriesMatch = sentence.match(this.exercisePatterns.calories);
      if (caloriesMatch) {
        activity.calories = parseInt(caloriesMatch[1]);
      }

      data.activities.push(activity);
    }

    // Check for standalone calories burned
    const caloriesMatch = sentence.match(this.exercisePatterns.calories);
    if (caloriesMatch && !data.activities.some(a => a.calories)) {
      data.activities.push({
        type: 'exercise',
        name: 'Workout',
        calories: parseInt(caloriesMatch[1])
      });
    }
  }

  private extractProducts(sentence: string, data: ExtractedData): void {
    const usageMatch = sentence.match(this.productPatterns.usage);
    if (usageMatch) {
      const product: ProductData = {
        name: this.cleanProductName(usageMatch[1]),
        duration: usageMatch[2] ? parseInt(usageMatch[2]) : undefined
      };

      // Look for rating in the same or next part
      const ratingMatch = sentence.match(this.productPatterns.rating);
      if (ratingMatch) {
        product.rating = parseInt(ratingMatch[1]);
      }

      // Categorize product
      product.category = this.categorizeProduct(product.name);
      
      data.products.push(product);
    }

    // Check for new services/apps
    const serviceMatch = sentence.match(this.productPatterns.product);
    if (serviceMatch && !usageMatch) {
      data.products.push({
        name: this.cleanProductName(serviceMatch[1]),
        category: 'service'
      });
    }
  }

  private extractHealth(sentence: string, data: ExtractedData): void {
    // Weight
    const weightMatch = sentence.match(this.healthPatterns.weight);
    if (weightMatch) {
      data.health.push({
        type: 'weight',
        value: parseFloat(weightMatch[1]),
        unit: weightMatch[2] || 'lbs'
      });
    }

    // Heart rate
    const hrMatch = sentence.match(this.healthPatterns.heartRate);
    if (hrMatch) {
      data.health.push({
        type: 'heart_rate',
        value: parseInt(hrMatch[1]),
        unit: 'bpm'
      });
    }

    // Blood pressure
    const bpMatch = sentence.match(this.healthPatterns.bloodPressure);
    if (bpMatch) {
      data.health.push({
        type: 'blood_pressure',
        value: parseInt(bpMatch[1]),
        secondaryValue: parseInt(bpMatch[2]),
        unit: 'mmHg'
      });
    }

    // Whoop data
    const whoopMatch = sentence.match(this.healthPatterns.whoop);
    if (whoopMatch) {
      data.health.push({
        type: 'whoop_data',
        value: 0,
        source: 'whoop',
        timestamp: new Date().toISOString()
      });
      data.metrics.push({
        category: 'health',
        type: 'whoop',
        text: whoopMatch[1]
      });
    }
  }

  private extractNutrition(sentence: string, data: ExtractedData): void {
    const mealMatch = sentence.match(this.nutritionPatterns.meal);
    if (mealMatch) {
      const foods = this.extractFoodItems(mealMatch[2]);
      data.nutrition.push({
        mealType: mealMatch[1].toLowerCase(),
        items: foods
      });
      return;
    }

    const foodMatch = sentence.match(this.nutritionPatterns.food);
    if (foodMatch) {
      const foods = this.extractFoodItems(foodMatch[1]);
      if (foods.length > 0) {
        data.nutrition.push({
          items: foods
        });
      }
    }

    const calorieMatch = sentence.match(this.nutritionPatterns.calories);
    if (calorieMatch) {
      // Add to most recent nutrition entry or create new one
      if (data.nutrition.length > 0) {
        data.nutrition[data.nutrition.length - 1].calories = parseInt(calorieMatch[1]);
      } else {
        data.nutrition.push({
          items: [],
          calories: parseInt(calorieMatch[1])
        });
      }
    }
  }

  private extractMoodEnergy(sentence: string, data: ExtractedData): void {
    const moodMatch = sentence.match(this.moodPatterns.mood);
    if (moodMatch) {
      data.mood = parseInt(moodMatch[1]);
    }

    const energyMatch = sentence.match(this.moodPatterns.energy);
    if (energyMatch) {
      data.energy = parseInt(energyMatch[1]);
    }
  }

  private extractKeyEvents(sentence: string, data: ExtractedData): void {
    // Identify sentences that are likely key events
    const keyPhrases = [
      'signed up', 'started', 'finished', 'completed', 'achieved',
      'reached', 'bought', 'sold', 'met', 'went to', 'visited'
    ];

    if (keyPhrases.some(phrase => sentence.toLowerCase().includes(phrase))) {
      data.keyEvents.push(sentence);
    }
  }

  private normalizeTime(timeStr: string): string {
    // Convert various time formats to HH:MM
    timeStr = timeStr.trim();
    
    // Handle formats like "7.00" -> "7:00"
    timeStr = timeStr.replace('.', ':');
    
    // Add :00 if only hour is provided
    if (!timeStr.includes(':')) {
      if (timeStr.match(/^\d{1,2}$/)) {
        timeStr += ':00';
      }
    }
    
    // Handle AM/PM
    const pmMatch = timeStr.match(/(\d{1,2}:\d{2})\s*pm/i);
    if (pmMatch) {
      const [hours, minutes] = pmMatch[1].split(':');
      const hour = parseInt(hours);
      if (hour < 12) {
        return `${hour + 12}:${minutes}`;
      }
      return pmMatch[1];
    }
    
    const amMatch = timeStr.match(/(\d{1,2}:\d{2})\s*am/i);
    if (amMatch) {
      return amMatch[1];
    }
    
    // If no AM/PM, try to guess based on context
    const [hours] = timeStr.split(':');
    const hour = parseInt(hours);
    
    // Assume times before 6 are PM (evening) unless it's wake time
    // This is a simple heuristic that could be improved
    return timeStr.includes(':') ? timeStr : `${timeStr}:00`;
  }

  private parseDuration(value: string, unit: string): number {
    const num = parseInt(value);
    unit = unit.toLowerCase();
    
    if (unit.startsWith('hour') || unit.startsWith('hr')) {
      return num * 60;
    }
    
    return num; // Already in minutes
  }

  private cleanProductName(name: string): string {
    // Remove common words and clean up product names
    return name
      .replace(/^(the|a|an)\s+/i, '')
      .replace(/\s+for\s+.*$/, '')
      .replace(/\s+app$/i, '')
      .trim();
  }

  private categorizeProduct(name: string): string {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('mask') || lowerName.includes('shampoo') || 
        lowerName.includes('conditioner') || lowerName.includes('cream')) {
      return 'beauty';
    }
    
    if (lowerName.includes('app') || lowerName.includes('cast') || 
        lowerName.includes('8sleep') || lowerName.includes('autopilot')) {
      return 'tech';
    }
    
    if (lowerName.includes('vitamin') || lowerName.includes('supplement')) {
      return 'health';
    }
    
    return 'other';
  }

  private extractFoodItems(text: string): string[] {
    // Split on common separators
    const items = text.split(/,|and/)
      .map(item => item.trim())
      .filter(item => item.length > 0 && !item.match(/^\d+\s*(calories|cals)/i));
    
    return items;
  }

  generateSummary(extracted: ExtractedData): string {
    const parts: string[] = [];
    
    if (extracted.wakeTime) {
      parts.push(`Woke at ${extracted.wakeTime}`);
    }
    
    if (extracted.activities.length > 0) {
      const totalMinutes = extracted.activities.reduce((sum, a) => sum + (a.duration || 0), 0);
      const totalCalories = extracted.activities.reduce((sum, a) => sum + (a.calories || 0), 0);
      
      if (totalMinutes > 0) {
        parts.push(`${totalMinutes} minutes of activity`);
      }
      if (totalCalories > 0) {
        parts.push(`${totalCalories} calories burned`);
      }
    }
    
    if (extracted.products.length > 0) {
      parts.push(`Used ${extracted.products.length} products`);
    }
    
    if (extracted.mood) {
      parts.push(`Mood: ${extracted.mood}/10`);
    }
    
    if (extracted.energy) {
      parts.push(`Energy: ${extracted.energy}/10`);
    }
    
    return parts.join(', ');
  }
}