import { config } from '../config';
import io, { Socket } from 'socket.io-client';

class ApiService {
  private token: string | null = null;
  private socket: Socket | null = null;
  
  constructor() {
    // Load token from storage
    this.token = localStorage.getItem(config.TOKEN_KEY);
  }
  
  // Authentication
  async login(identifier: string, password: string): Promise<any> {
    const response = await fetch(`${config.BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifier, password }),
    });
    
    if (!response.ok) {
      throw new Error('Login failed');
    }
    
    const data = await response.json();
    this.setToken(data.token);
    return data;
  }
  
  async register(email: string, username: string, password: string, fullName?: string): Promise<any> {
    const response = await fetch(`${config.BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, username, password, fullName }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }
    
    return response.json();
  }
  
  logout(): void {
    this.token = null;
    localStorage.removeItem(config.TOKEN_KEY);
    if (this.socket) {
      this.socket.disconnect();
    }
  }
  
  setToken(token: string): void {
    this.token = token;
    localStorage.setItem(config.TOKEN_KEY, token);
  }
  
  getToken(): string | null {
    return this.token;
  }
  
  // API request helper
  private async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    if (!this.token) {
      throw new Error('Not authenticated');
    }
    
    const response = await fetch(`${config.BACKEND_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers,
      },
    });
    
    if (response.status === 401) {
      this.logout();
      throw new Error('Authentication expired');
    }
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || error.error || 'Request failed');
    }
    
    return response.json();
  }
  
  // Memory API
  async storeMemory(content: string, category?: string, tags?: string[]): Promise<any> {
    return this.request('/api/memory', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'current', // Will be extracted from JWT
        content,
        category,
        tags,
      }),
    });
  }
  
  async searchMemories(query: string): Promise<any> {
    return this.request(`/api/memory/search?userId=current&query=${encodeURIComponent(query)}`);
  }
  
  // Task API
  async getTasks(status?: string, dueToday?: boolean): Promise<any> {
    const params = new URLSearchParams({ userId: 'current' });
    if (status) params.append('status', status);
    if (dueToday) params.append('dueToday', 'true');
    
    return this.request(`/api/tasks?${params}`);
  }
  
  async createTask(title: string, description?: string, priority?: number, dueDate?: string, category?: string): Promise<any> {
    const result = await this.request('/api/task', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'current',
        title,
        description,
        priority,
        dueDate,
        category,
      }),
    });
    return result;
  }
  
  // Protocol API
  async getProtocols(): Promise<any> {
    return this.request('/api/protocols?userId=current');
  }
  
  async startProtocol(protocolName: string): Promise<any> {
    return this.request('/api/protocol/start', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'current',
        protocolName,
      }),
    });
  }
  
  // Google Drive API
  async searchDrive(query: string, limit: number = 10): Promise<any> {
    return this.request(`/api/google/drive/search?query=${encodeURIComponent(query)}&limit=${limit}`);
  }
  
  async getRecentFiles(limit: number = 10): Promise<any> {
    return this.request(`/api/google/drive/recent?limit=${limit}`);
  }
  
  async createDocument(name: string, content: string, mimeType?: string, folderId?: string): Promise<any> {
    return this.request('/api/google/drive/create', {
      method: 'POST',
      body: JSON.stringify({ name, content, mimeType, folderId }),
    });
  }
  
  // Google Gmail API
  async getUnreadEmails(limit: number = 10): Promise<any> {
    return this.request(`/api/google/gmail/unread?limit=${limit}`);
  }
  
  async searchEmails(query: string, limit: number = 10): Promise<any> {
    return this.request(`/api/google/gmail/search?query=${encodeURIComponent(query)}&limit=${limit}`);
  }
  
  async sendEmail(to: string, subject: string, body: string, cc?: string, bcc?: string): Promise<any> {
    return this.request('/api/google/gmail/send', {
      method: 'POST',
      body: JSON.stringify({ to, subject, body, cc, bcc }),
    });
  }
  
  // Google OAuth
  async getGoogleAuthUrl(): Promise<{ authUrl: string; state: string; codeChallenge: string }> {
    return this.request('/api/google/auth/url');
  }
  
  async completeGoogleAuth(code: string, state: string): Promise<any> {
    return this.request('/api/google/auth/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state }),
    });
  }
  
  // WebSocket connection
  connectWebSocket(onMessage?: (data: any) => void): void {
    if (this.socket) {
      this.socket.disconnect();
    }
    
    this.socket = io(config.WS_URL, {
      auth: {
        token: this.token,
      },
    });
    
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.socket?.emit('agent:ready', { type: 'ipad' });
    });
    
    this.socket.on('display:changed', (data) => {
      if (onMessage) {
        onMessage(data);
      }
    });
    
    this.socket.on('protocol:started', (data) => {
      if (onMessage) {
        onMessage({ type: 'protocol', ...data });
      }
    });
    
    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  }
  
  disconnectWebSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
  
  // Dashboard helper methods
  async getMemories(): Promise<any> {
    // Get all memories by searching with empty query
    return this.request('/api/memory/search?userId=current&query=');
  }

  async addMemory(content: string): Promise<any> {
    return this.storeMemory(content);
  }

  async addTask(title: string): Promise<any> {
    return this.createTask(title);
  }

  async updateTask(taskId: string, completed: boolean): Promise<any> {
    return this.request(`/api/task/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    });
  }

  async getCalendarEvents(): Promise<any> {
    return this.request('/api/google/calendar/events?maxResults=10');
  }

  async askAssistant(question: string): Promise<any> {
    return this.request('/api/assistant/query', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  }

  async syncGoogle(): Promise<any> {
    return this.request('/api/google/sync', {
      method: 'POST',
    });
  }

  // Diary API methods
  async saveDiaryEntry(date: string, text: string): Promise<any> {
    return this.request('/api/diary/entry', {
      method: 'POST',
      body: JSON.stringify({ date, text }),
    });
  }

  async getDiaryEntry(date: string): Promise<any> {
    return this.request(`/api/diary/entry/${date}`);
  }

  async getDiaryEntries(startDate?: string, endDate?: string): Promise<any> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    return this.request(`/api/diary/entries?${params}`);
  }

  async searchDiary(query: string, limit: number = 10): Promise<any> {
    return this.request(`/api/diary/search?query=${encodeURIComponent(query)}&limit=${limit}`);
  }

  async getDiaryProducts(productName?: string): Promise<any> {
    const params = productName ? `?name=${encodeURIComponent(productName)}` : '';
    return this.request(`/api/diary/products${params}`);
  }

  async getDiaryActivities(startDate?: string, endDate?: string): Promise<any> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    return this.request(`/api/diary/activities?${params}`);
  }

  async getDiaryHealthTrends(metric: string, days: number = 30): Promise<any> {
    return this.request(`/api/diary/health/${metric}?days=${days}`);
  }

  async getDiaryWeeklySummary(date?: string): Promise<any> {
    const params = date ? `?date=${date}` : '';
    return this.request(`/api/diary/summary/weekly${params}`);
  }

  async getDiaryTrends(days: number = 30): Promise<any> {
    return this.request(`/api/diary/trends?days=${days}`);
  }

  // Voice/Text command processing
  async processCommand(command: string): Promise<any> {
    // This would normally go through NLP, but for now we'll do simple pattern matching
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand.includes('remember')) {
      const content = command.replace(/remember( that)?/i, '').trim();
      return this.storeMemory(content);
    }
    
    if (lowerCommand.includes('search') && lowerCommand.includes('drive')) {
      const query = command.replace(/search( my)? drive( for)?/i, '').trim();
      return this.searchDrive(query);
    }
    
    if (lowerCommand.includes('email')) {
      if (lowerCommand.includes('unread') || lowerCommand.includes('new')) {
        return this.getUnreadEmails();
      }
      if (lowerCommand.includes('search')) {
        const query = command.replace(/search( my)? email( for)?/i, '').trim();
        return this.searchEmails(query);
      }
    }
    
    if (lowerCommand.includes('task') || lowerCommand.includes('todo')) {
      if (lowerCommand.includes('add') || lowerCommand.includes('create')) {
        const title = command.replace(/(add|create)( a)? task/i, '').trim();
        return this.createTask(title);
      }
      return this.getTasks();
    }
    
    // Default: search memories
    return this.searchMemories(command);
  }
}

export default new ApiService();
