import express from 'express';
import { createServer } from 'http';
import { io as ioClient } from 'socket.io-client';
import dotenv from 'dotenv';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

import { WoolworthsAutomation } from './automation/WoolworthsAutomation';
import { CredentialManager } from './utils/CredentialManager';
import { TaskQueue } from './utils/TaskQueue';
import { SecurityManager } from './utils/SecurityManager';
import { UserConfirmation } from './utils/UserConfirmation';

dotenv.config();

// Ensure logs directory exists
const logsDir = process.env.LOGS_DIR || path.join(process.cwd(), 'logs');

// Logger configuration with rotation
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Rotate error logs daily, keep for 14 days
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    // Rotate combined logs daily, keep for 7 days
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '7d'
    }),
    // Console output for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

class LocalAgent {
  private app: express.Application;
  private server: any;
  private socket: any;
  private woolworths: WoolworthsAutomation;
  private credentialManager: CredentialManager;
  private taskQueue: TaskQueue;
  private securityManager: SecurityManager;
  private userConfirmation: UserConfirmation;
  private isConnected: boolean = false;
  
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.credentialManager = new CredentialManager();
    this.taskQueue = new TaskQueue();
    this.securityManager = new SecurityManager();
    this.userConfirmation = new UserConfirmation();
    this.woolworths = new WoolworthsAutomation(this.credentialManager);
    
    this.setupExpress();
    this.setupSocketConnection();
    this.setupTaskHandlers();
  }
  
  private setupExpress() {
    this.app.use(express.json());
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        connected: this.isConnected,
        uptime: process.uptime(),
        version: process.env.npm_package_version
      });
    });
    
    // Local API endpoints (only accessible from localhost)
    this.app.use((req, res, next) => {
      if (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1') {
        next();
      } else {
        logger.warn(`Rejected connection from ${req.ip}`);
        res.status(403).json({ error: 'Forbidden' });
      }
    });
    
    // Task submission endpoint
    this.app.post('/task', async (req, res) => {
      try {
        const { type, action, data, requireConfirmation } = req.body;
        
        // Validate task
        if (!this.securityManager.validateTask(type, action)) {
          return res.status(400).json({ error: 'Invalid task type or action' });
        }
        
        // Add confirmation requirement for sensitive tasks
        if (requireConfirmation || this.securityManager.requiresConfirmation(type, action)) {
          const confirmed = await this.requestUserConfirmation(type, action, data);
          if (!confirmed) {
            return res.status(403).json({ error: 'User confirmation required' });
          }
        }
        
        // Queue the task
        const taskId = await this.taskQueue.addTask({
          type,
          action,
          data,
          timestamp: new Date()
        });
        
        res.json({ taskId, status: 'queued' });
      } catch (error) {
        logger.error('Error processing task:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    
    // Task status endpoint
    this.app.get('/task/:id', (req, res) => {
      const task = this.taskQueue.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json(task);
    });
  }
  
  private setupSocketConnection() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const agentToken = process.env.AGENT_TOKEN || '';
    
    this.socket = ioClient(backendUrl, {
      auth: {
        token: agentToken,
        type: 'local-agent'
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000
    });
    
    this.socket.on('connect', () => {
      logger.info('Connected to backend');
      this.isConnected = true;
      this.socket.emit('agent:ready', {
        capabilities: ['woolworths', 'browser', 'file-system']
      });
    });
    
    this.socket.on('disconnect', () => {
      logger.warn('Disconnected from backend');
      this.isConnected = false;
    });
    
    this.socket.on('task:execute', async (data: any) => {
      logger.info('Received task from backend:', data);
      await this.executeTask(data);
    });
    
    this.socket.on('error', (error: any) => {
      logger.error('Socket error:', error);
    });
  }
  
  private setupTaskHandlers() {
    // Process queued tasks
    setInterval(async () => {
      const task = this.taskQueue.getNextTask();
      if (task) {
        await this.executeTask(task);
      }
    }, 1000);
  }
  
  private async executeTask(task: any) {
    const { id, type, action, data } = task;
    
    try {
      logger.info(`Executing task ${id}: ${type}.${action}`);
      this.taskQueue.updateTaskStatus(id, 'processing');
      
      let result: any;
      
      switch (type) {
        case 'woolworths':
          result = await this.handleWoolworthsTask(action, data);
          break;
        case 'browser':
          result = await this.handleBrowserTask(action, data);
          break;
        case 'system':
          result = await this.handleSystemTask(action, data);
          break;
        default:
          throw new Error(`Unknown task type: ${type}`);
      }
      
      this.taskQueue.updateTaskStatus(id, 'completed', result);
      
      // Send result back to backend
      if (this.socket && this.isConnected) {
        this.socket.emit('task:completed', {
          taskId: id,
          result
        });
      }
      
      logger.info(`Task ${id} completed successfully`);
    } catch (error: any) {
      logger.error(`Task ${id} failed:`, error);
      this.taskQueue.updateTaskStatus(id, 'failed', { error: error.message });
      
      if (this.socket && this.isConnected) {
        this.socket.emit('task:failed', {
          taskId: id,
          error: error.message
        });
      }
    }
  }
  
  private async handleWoolworthsTask(action: string, data: any) {
    switch (action) {
      case 'login':
        return await this.woolworths.login();
      
      case 'prepareCart':
        return await this.woolworths.prepareStandardCart(data.items || []);
      
      case 'addToCart':
        return await this.woolworths.addToCart(data.productId, data.quantity);
      
      case 'removeFromCart':
        return await this.woolworths.removeFromCart(data.productId);
      
      case 'getCart':
        return await this.woolworths.getCart();
      
      case 'checkout':
        // Require additional confirmation for checkout
        const confirmed = await this.requestUserConfirmation('woolworths', 'checkout', data);
        if (!confirmed) {
          throw new Error('Checkout requires user confirmation');
        }
        return await this.woolworths.checkout(data);
      
      case 'searchProduct':
        return await this.woolworths.searchProduct(data.query);
      
      case 'getOrders':
        return await this.woolworths.getOrderHistory();
      
      default:
        throw new Error(`Unknown Woolworths action: ${action}`);
    }
  }
  
  private async handleBrowserTask(action: string, data: any) {
    // Generic browser automation tasks
    switch (action) {
      case 'navigate':
        return { url: data.url, status: 'navigated' };
      
      case 'screenshot':
        return { path: data.path, status: 'captured' };
      
      case 'scrape':
        return { content: 'scraped content', status: 'scraped' };
      
      default:
        throw new Error(`Unknown browser action: ${action}`);
    }
  }
  
  private async handleSystemTask(action: string, data: any) {
    // System-level tasks
    switch (action) {
      case 'status':
        return {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          connected: this.isConnected
        };
      
      case 'restart':
        logger.info('Restart requested');
        setTimeout(() => process.exit(0), 1000);
        return { status: 'restarting' };
      
      default:
        throw new Error(`Unknown system action: ${action}`);
    }
  }
  
  private async requestUserConfirmation(
    type: string,
    action: string,
    data: any
  ): Promise<boolean> {
    return await this.userConfirmation.requestConfirmation(type, action, data);
  }
  
  public start(port: number = 3001) {
    this.server.listen(port, '127.0.0.1', () => {
      logger.info(`Local agent running on http://localhost:${port}`);
      logger.info('Press Ctrl+C to stop');
    });
  }
  
  public stop() {
    logger.info('Shutting down local agent...');
    this.server.close();
    if (this.socket) {
      this.socket.disconnect();
    }
    this.woolworths.cleanup();
    process.exit(0);
  }
}

// Start the agent
const agent = new LocalAgent();
agent.start();

// Graceful shutdown
process.on('SIGINT', () => agent.stop());
process.on('SIGTERM', () => agent.stop());