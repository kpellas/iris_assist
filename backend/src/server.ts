import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import DatabasePool from './database/pool';

dotenv.config({ path: '../.env' });

const app = express();
const server = createServer(app);

// Allow common dev origins plus optional overrides via CORS_ORIGINS env (comma-separated)
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3001',
  'http://192.168.1.6:3001',
  'http://192.168.1.6:5173',
  'http://192.168.1.6:5174'
];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : defaultOrigins;

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected',
      websocket: 'active'
    }
  });
});

// Import services
import { MemoryService } from './services/MemoryService';
import { ProtocolService } from './services/ProtocolService';
import { TaskService } from './services/TaskService';
import { LLMService } from './services/LLMService';
import { GoogleAuthService } from './services/GoogleAuthService';
import { GoogleDriveService } from './services/GoogleDriveService';
import { GoogleGmailService } from './services/GoogleGmailService';
import { AuthMiddleware } from './middleware/AuthMiddleware';
import { DiaryService } from './services/DiaryService';

// Initialize services
const memoryService = new MemoryService();
const protocolService = new ProtocolService();
const taskService = new TaskService();
const llmService = new LLMService();
const diaryService = new DiaryService();

// Start auth middleware cleanup
AuthMiddleware.startCleanup();

// Store current display states
const displayStates = new Map<string, any>();

// ===== MEMORY API =====
app.post('/api/memory', async (req, res) => {
  try {
    const { userId, content, category, tags } = req.body;
    
    if (!userId || !content) {
      return res.status(400).json({ error: 'userId and content are required' });
    }
    
    // Generate embedding if OpenAI is configured
    let embedding: number[] | undefined;
    if (process.env.OPENAI_API_KEY?.startsWith('sk-')) {
      embedding = await llmService.generateEmbedding(content);
    }
    
    const memoryId = await memoryService.storeMemory({
      userId,
      content,
      category,
      tags,
      embedding
    });
    
    res.json({ success: true, memoryId });
  } catch (error) {
    console.error('Error storing memory:', error);
    res.status(500).json({ error: 'Failed to store memory' });
  }
});

app.get('/api/memory/search', async (req, res) => {
  try {
    const { userId, query } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // If query is empty, return all memories for the user
    const searchQuery = (query as string) || '';
    
    // Generate embedding for semantic search only if query is not empty
    let embedding: number[] | undefined;
    if (searchQuery && process.env.OPENAI_API_KEY?.startsWith('sk-')) {
      embedding = await llmService.generateEmbedding(searchQuery);
    }
    
    const results = await memoryService.searchMemories(
      userId as string,
      searchQuery,
      embedding
    );
    
    res.json({ results });
  } catch (error) {
    console.error('Error searching memories:', error);
    res.status(500).json({ error: 'Failed to search memories' });
  }
});

// ===== PROTOCOL API =====
app.get('/api/protocols', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const protocols = await protocolService.listProtocols(userId as string);
    res.json({ protocols });
  } catch (error) {
    console.error('Error listing protocols:', error);
    res.status(500).json({ error: 'Failed to list protocols' });
  }
});

app.post('/api/protocol/start', async (req, res) => {
  try {
    const { userId, protocolName } = req.body;
    
    const protocol = await protocolService.getProtocol(userId, protocolName);
    if (!protocol) {
      return res.status(404).json({ error: 'Protocol not found' });
    }
    
    const runId = await protocolService.startProtocolRun(protocol.id!, userId);
    
    // Broadcast protocol start to iPad
    io.emit('protocol:started', {
      userId,
      protocol,
      runId
    });
    
    res.json({ success: true, runId, protocol });
  } catch (error) {
    console.error('Error starting protocol:', error);
    res.status(500).json({ error: 'Failed to start protocol' });
  }
});

// ===== TASK API =====
app.get('/api/tasks', async (req, res) => {
  try {
    const { userId, status, dueToday } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const tasks = await taskService.getTasks(userId as string, {
      status: status as string,
      dueToday: dueToday === 'true'
    });
    
    res.json({ tasks });
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

app.post('/api/task', async (req, res) => {
  try {
    const { userId, title, description, priority, dueDate, category } = req.body;
    
    if (!userId || !title) {
      return res.status(400).json({ error: 'userId and title are required' });
    }
    
    const taskId = await taskService.createTask({
      userId,
      title,
      description,
      priority,
      dueDate,
      category
    });
    
    res.json({ success: true, taskId });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// ===== DISPLAY API =====
app.post('/api/display/update', async (req, res) => {
  try {
    const { userId, deviceId, view, data } = req.body;
    
    if (!userId || !view) {
      return res.status(400).json({ error: 'userId and view are required' });
    }
    
    const displayKey = `${userId}-${deviceId || 'ipad'}`;
    displayStates.set(displayKey, { view, data, timestamp: new Date() });
    
    // Broadcast to connected clients
    io.emit('display:changed', {
      userId,
      deviceId: deviceId || 'ipad',
      view,
      data
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating display:', error);
    res.status(500).json({ error: 'Failed to update display' });
  }
});

app.get('/api/display/current', async (req, res) => {
  try {
    const { userId, deviceId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const displayKey = `${userId}-${deviceId || 'ipad'}`;
    const state = displayStates.get(displayKey) || { view: 'dashboard', data: {} };
    
    res.json(state);
  } catch (error) {
    console.error('Error getting display state:', error);
    res.status(500).json({ error: 'Failed to get display state' });
  }
});

// ===== GOOGLE AUTH API =====
app.get('/api/google/auth/url', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const googleAuthService = new GoogleAuthService(req.user.userId);
    const { url, state, codeChallenge } = googleAuthService.getAuthUrl(req.user.userId);
    res.json({ authUrl: url, state, codeChallenge });
  } catch (error) {
    console.error('Error getting auth URL:', error);
    res.status(500).json({ error: 'Failed to get auth URL' });
  }
});

app.post('/api/google/auth/callback', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const { code, state } = req.body;
    
    if (!code || !state) {
      return res.status(400).json({ error: 'Authorization code and state required' });
    }
    
    const googleAuthService = new GoogleAuthService(req.user.userId);
    const tokens = await googleAuthService.getTokenFromCode(code, state);
    res.json({ success: true });
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    res.status(500).json({ error: 'Failed to authenticate' });
  }
});

// ===== GOOGLE DRIVE API =====
app.get('/api/google/drive/search', 
  AuthMiddleware.authenticate,
  AuthMiddleware.requireScope('drive.read'),
  AuthMiddleware.rateLimit(30, 60000),
  async (req: any, res) => {
    try {
      const { query, limit } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: 'Query parameter required' });
      }
      
      const googleAuthService = new GoogleAuthService(req.user.userId);
      await googleAuthService.initialize();
      const googleDriveService = new GoogleDriveService(googleAuthService);
      
      const files = await googleDriveService.searchFiles(
        query as string,
        limit ? parseInt(limit as string) : 10
      );
      res.json({ files });
    } catch (error) {
      console.error('Error searching Drive files:', error);
      res.status(500).json({ error: 'Failed to search Drive' });
    }
  }
);

app.get('/api/google/drive/recent',
  AuthMiddleware.authenticate,
  AuthMiddleware.requireScope('drive.read'),
  AuthMiddleware.rateLimit(30, 60000),
  async (req: any, res) => {
    try {
      const { limit } = req.query;
      
      const googleAuthService = new GoogleAuthService(req.user.userId);
      await googleAuthService.initialize();
      const googleDriveService = new GoogleDriveService(googleAuthService);
      
      const files = await googleDriveService.getRecentFiles(
        limit ? parseInt(limit as string) : 10
      );
      res.json({ files });
    } catch (error) {
      console.error('Error getting recent files:', error);
      res.status(500).json({ error: 'Failed to get recent files' });
    }
  }
);

app.post('/api/google/drive/create',
  AuthMiddleware.authenticate,
  AuthMiddleware.requireScope('drive.write'),
  AuthMiddleware.rateLimit(10, 60000),
  AuthMiddleware.auditLog('drive.create'),
  async (req: any, res) => {
    try {
      const { name, content, mimeType, folderId } = req.body;
      
      if (!name || !content) {
        return res.status(400).json({ error: 'Name and content required' });
      }
      
      const googleAuthService = new GoogleAuthService(req.user.userId);
      await googleAuthService.initialize();
      const googleDriveService = new GoogleDriveService(googleAuthService);
      
      const file = await googleDriveService.createDocument(
        name,
        content,
        mimeType,
        folderId
      );
      res.json({ file });
    } catch (error) {
      console.error('Error creating document:', error);
      res.status(500).json({ error: 'Failed to create document' });
    }
  }
);

// ===== GOOGLE GMAIL API =====
app.get('/api/google/gmail/messages',
  AuthMiddleware.authenticate,
  AuthMiddleware.requireScope('gmail.read'),
  AuthMiddleware.rateLimit(30, 60000),
  async (req: any, res) => {
    try {
      const { query, limit } = req.query;
      
      const googleAuthService = new GoogleAuthService(req.user.userId);
      await googleAuthService.initialize();
      const googleGmailService = new GoogleGmailService(googleAuthService);
      
      const messages = await googleGmailService.listMessages(
        query as string,
        limit ? parseInt(limit as string) : 10
      );
      res.json({ messages });
    } catch (error) {
      console.error('Error listing messages:', error);
      res.status(500).json({ error: 'Failed to list messages' });
    }
  }
);

app.get('/api/google/gmail/unread',
  AuthMiddleware.authenticate,
  AuthMiddleware.requireScope('gmail.read'),
  AuthMiddleware.rateLimit(30, 60000),
  async (req: any, res) => {
    try {
      const { limit } = req.query;
      
      const googleAuthService = new GoogleAuthService(req.user.userId);
      await googleAuthService.initialize();
      const googleGmailService = new GoogleGmailService(googleAuthService);
      
      const messages = await googleGmailService.getUnreadEmails(
        limit ? parseInt(limit as string) : 10
      );
      res.json({ messages });
    } catch (error) {
      console.error('Error getting unread emails:', error);
      res.status(500).json({ error: 'Failed to get unread emails' });
    }
  }
);

app.post('/api/google/gmail/send', 
  AuthMiddleware.authenticate,
  AuthMiddleware.requireScope('gmail.send'),
  AuthMiddleware.validateEmailRecipients,
  AuthMiddleware.rateLimit(5, 60000), // 5 emails per minute
  AuthMiddleware.auditLog('gmail.send'),
  async (req: any, res) => {
    try {
      const { to, subject, body, cc, bcc } = req.body;
      
      if (!to || !subject || !body) {
        return res.status(400).json({ error: 'To, subject, and body required' });
      }
      
      const googleAuthService = new GoogleAuthService(req.user.userId);
      await googleAuthService.initialize();
      const googleGmailService = new GoogleGmailService(googleAuthService);
      
      const messageId = await googleGmailService.sendEmail(
        to,
        subject,
        body,
        cc,
        bcc
      );
      res.json({ success: true, messageId });
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  }
);

app.get('/api/google/gmail/search',
  AuthMiddleware.authenticate,
  AuthMiddleware.requireScope('gmail.read'),
  AuthMiddleware.rateLimit(30, 60000),
  async (req: any, res) => {
    try {
      const { query, limit } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: 'Query parameter required' });
      }
      
      const googleAuthService = new GoogleAuthService(req.user.userId);
      await googleAuthService.initialize();
      const googleGmailService = new GoogleGmailService(googleAuthService);
      
      const messages = await googleGmailService.searchEmails(
        query as string,
        limit ? parseInt(limit as string) : 10
      );
      res.json({ messages });
    } catch (error) {
      console.error('Error searching emails:', error);
      res.status(500).json({ error: 'Failed to search emails' });
    }
  }
);

// Google Calendar endpoint
app.get('/api/google/calendar/events',
  AuthMiddleware.authenticate,
  async (req: any, res) => {
    try {
      // For now, return empty array since Google Calendar isn't configured
      // TODO: Implement Google Calendar integration
      res.json([]);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      res.json([]);
    }
  }
);

// WebSocket handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('display:update', (data) => {
    console.log('Display update requested:', data);
    io.emit('display:changed', data);
  });
  
  socket.on('agent:ready', (data) => {
    console.log('Local agent connected:', data);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ===== AUTH ENDPOINTS =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password, fullName } = req.body;
    
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }
    
    const { UserAuthService } = await import('./services/UserAuthService');
    const authService = new UserAuthService();
    
    const result = await authService.register({
      email,
      username,
      password,
      fullName
    });
    
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    
    res.status(201).json({
      message: result.message,
      user: result.user
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' });
    }
    
    const { UserAuthService } = await import('./services/UserAuthService');
    const authService = new UserAuthService();
    
    const result = await authService.login(
      identifier,
      password,
      req.ip,
      req.headers['user-agent']
    );
    
    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }
    
    res.json({
      token: result.token,
      user: result.user
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const { UserAuthService } = await import('./services/UserAuthService');
    const authService = new UserAuthService();
    
    // Extract session token from header
    const token = req.headers.authorization?.replace('Bearer ', '');
    const tokenHash = token ? 
      require('crypto').createHash('sha256').update(token).digest('hex') : 
      undefined;
    
    await authService.logout(req.user.userId, tokenHash);
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.post('/api/auth/change-password', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old and new passwords are required' });
    }
    
    const { UserAuthService } = await import('./services/UserAuthService');
    const authService = new UserAuthService();
    
    const success = await authService.changePassword(
      req.user.userId,
      oldPassword,
      newPassword
    );
    
    if (!success) {
      return res.status(400).json({ error: 'Password change failed' });
    }
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Password change failed' });
  }
});

// ===== DIARY API =====
app.post('/api/diary/entry', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const { date, text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Entry text is required' });
    }
    
    const entryDate = date ? new Date(date) : new Date();
    const result = await diaryService.createEntry(req.user.userId, entryDate, text);
    
    res.json(result);
  } catch (error) {
    console.error('Error creating diary entry:', error);
    res.status(500).json({ error: 'Failed to create diary entry' });
  }
});

app.get('/api/diary/entry/:date', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const date = new Date(req.params.date);
    const entry = await diaryService.getEntry(req.user.userId, date);
    
    if (!entry) {
      return res.status(404).json({ error: 'No entry found for this date' });
    }
    
    res.json(entry);
  } catch (error) {
    console.error('Error fetching diary entry:', error);
    res.status(500).json({ error: 'Failed to fetch diary entry' });
  }
});

app.get('/api/diary/entries', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();
    
    const entries = await diaryService.getEntries(req.user.userId, start, end);
    res.json(entries);
  } catch (error) {
    console.error('Error fetching diary entries:', error);
    res.status(500).json({ error: 'Failed to fetch diary entries' });
  }
});

app.get('/api/diary/search', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const { query, limit } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const results = await diaryService.searchEntries(
      req.user.userId, 
      query as string, 
      limit ? parseInt(limit as string) : 10
    );
    
    res.json(results);
  } catch (error) {
    console.error('Error searching diary entries:', error);
    res.status(500).json({ error: 'Failed to search diary entries' });
  }
});

app.get('/api/diary/products', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const { name } = req.query;
    const products = await diaryService.getProductUsage(req.user.userId, name as string);
    res.json(products);
  } catch (error) {
    console.error('Error fetching product usage:', error);
    res.status(500).json({ error: 'Failed to fetch product usage' });
  }
});

app.get('/api/diary/activities', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;
    
    const stats = await diaryService.getActivityStats(req.user.userId, start, end);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ error: 'Failed to fetch activity stats' });
  }
});

app.get('/api/diary/health/:metric', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const { days } = req.query;
    const trends = await diaryService.getHealthTrends(
      req.user.userId, 
      req.params.metric,
      days ? parseInt(days as string) : 30
    );
    
    res.json(trends);
  } catch (error) {
    console.error('Error fetching health trends:', error);
    res.status(500).json({ error: 'Failed to fetch health trends' });
  }
});

app.get('/api/diary/summary/weekly', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date as string) : new Date();
    
    const summary = await diaryService.generateWeeklySummary(req.user.userId, targetDate);
    res.json(summary);
  } catch (error) {
    console.error('Error generating weekly summary:', error);
    res.status(500).json({ error: 'Failed to generate weekly summary' });
  }
});

app.get('/api/diary/trends', AuthMiddleware.authenticate, async (req: any, res) => {
  try {
    const { days } = req.query;
    const analysis = await diaryService.analyzeTrends(
      req.user.userId,
      days ? parseInt(days as string) : 30
    );
    
    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing trends:', error);
    res.status(500).json({ error: 'Failed to analyze trends' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const { UserAuthService } = await import('./services/UserAuthService');
    const authService = new UserAuthService();
    
    const token = await authService.createPasswordResetToken(email);
    
    // In production, send email with reset link
    // For now, just return success (don't reveal if email exists)
    res.json({ 
      message: 'If the email exists, a reset link has been sent',
      // Remove in production - only for development
      resetToken: process.env.NODE_ENV !== 'production' ? token : undefined
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// Start server
const PORT = process.env.BACKEND_PORT || 3000;

async function startServer() {
  try {
    // Test database connection
    const pool = await DatabasePool.getInstance();
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected:', result.rows[0].now);
    
    server.listen(PORT, () => {
      console.log(`🚀 Backend server running on http://localhost:${PORT}`);
      console.log(`📡 WebSocket server active`);
      console.log(`🔍 Health check: http://localhost:${PORT}/health`);
      console.log(`🔐 Auth required for Google APIs`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close();
  await DatabasePool.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close();
  await DatabasePool.close();
  process.exit(0);
});

startServer();
