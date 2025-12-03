// Lightweight client-side usage tracker for learning routines.
// Stores non-sensitive events (type, label, timestamp) in localStorage.

export type UsageEventType = 'task' | 'protocol' | 'assistant' | 'memory' | 'event';

export interface UsageEvent {
  type: UsageEventType;
  label: string;
  timestamp: number;
}

export interface RoutineSuggestion {
  title: string;
  when: string;
  confidence: number;
  samples: number;
}

const STORAGE_KEY = 'kelly_usage_events_v1';
const LEARNING_FLAG = 'kelly_learning_enabled';

const timeWindow = (date: Date): string => {
  const hour = date.getHours();
  if (hour < 6) return 'overnight';
  if (hour < 9) return 'early';
  if (hour < 12) return 'morning';
  if (hour < 15) return 'midday';
  if (hour < 18) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'late';
};

const dayName = (date: Date): string =>
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];

export class UsageTracker {
  static isLearningEnabled(): boolean {
    return localStorage.getItem(LEARNING_FLAG) === 'true';
  }

  static setLearning(enabled: boolean) {
    localStorage.setItem(LEARNING_FLAG, enabled ? 'true' : 'false');
    if (enabled) {
      // Start fresh week of signals
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  static log(type: UsageEventType, label: string) {
    if (!this.isLearningEnabled()) return;
    const events = this.getEvents();
    events.push({ type, label, timestamp: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }

  static getEvents(): UsageEvent[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as UsageEvent[];
    } catch {
      return [];
    }
  }

  static clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // Simple heuristic: group by (dayOfWeek, timeWindow, label), count occurrences.
  // Require at least 3 samples to propose.
  static getRoutineSuggestions(): RoutineSuggestion[] {
    const events = this.getEvents();
    const counts = new Map<string, { count: number; label: string; when: string }>();

    events.forEach((evt) => {
      const d = new Date(evt.timestamp);
      const when = `${dayName(d)} ${timeWindow(d)}`;
      const key = `${when}|${evt.label}`;
      const entry = counts.get(key) || { count: 0, label: evt.label, when };
      entry.count += 1;
      counts.set(key, entry);
    });

    const suggestions: RoutineSuggestion[] = [];
    counts.forEach((v) => {
      if (v.count >= 3) {
        suggestions.push({
          title: v.label,
          when: v.when,
          confidence: Math.min(1, v.count / 7), // cap at ~1 week of signals
          samples: v.count
        });
      }
    });

    // Sort by samples/weight
    suggestions.sort((a, b) => b.samples - a.samples);
    return suggestions.slice(0, 5);
  }
}

export default UsageTracker;
