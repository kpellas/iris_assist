import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email?: string;
    scopes?: string[];
  };
}

export class AuthMiddleware {
  private static jwtSecret: string;
  private static rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  
  static {
    // Require JWT_SECRET to be set
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required for security');
    }
    AuthMiddleware.jwtSecret = process.env.JWT_SECRET;
  }
  
  /**
   * Verify JWT token and attach user to request
   */
  static authenticate(req: AuthRequest, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const decoded = jwt.verify(token, AuthMiddleware.jwtSecret) as any;
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        scopes: decoded.scopes || []
      };
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
  
  /**
   * Check if user has required scope
   */
  static requireScope(scope: string) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      if (!req.user.scopes?.includes(scope)) {
        return res.status(403).json({ error: `Scope '${scope}' required` });
      }
      
      next();
    };
  }
  
  /**
   * Rate limiting middleware
   */
  static rateLimit(maxRequests: number = 10, windowMs: number = 60000) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
      const key = `${req.user?.userId || req.ip}:${req.path}`;
      const now = Date.now();
      
      const limit = AuthMiddleware.rateLimitMap.get(key);
      
      if (!limit || now > limit.resetTime) {
        AuthMiddleware.rateLimitMap.set(key, {
          count: 1,
          resetTime: now + windowMs
        });
        return next();
      }
      
      if (limit.count >= maxRequests) {
        const retryAfter = Math.ceil((limit.resetTime - now) / 1000);
        res.set('Retry-After', retryAfter.toString());
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter
        });
      }
      
      limit.count++;
      next();
    };
  }
  
  /**
   * Validate email recipients for sending
   */
  static validateEmailRecipients(req: AuthRequest, res: Response, next: NextFunction) {
    const { to, cc, bcc } = req.body;
    
    // Check for suspicious patterns
    const allRecipients = [
      to,
      ...(cc ? cc.split(',') : []),
      ...(bcc ? bcc.split(',') : [])
    ].filter(Boolean);
    
    // Basic validation rules
    const maxRecipients = 10;
    const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS?.split(',') || [];
    const blockedDomains = ['tempmail.com', 'guerrillamail.com', '10minutemail.com'];
    
    if (allRecipients.length > maxRecipients) {
      return res.status(400).json({
        error: `Maximum ${maxRecipients} recipients allowed`
      });
    }
    
    for (const email of allRecipients) {
      const domain = email.trim().split('@')[1];
      
      // Check blocked domains
      if (blockedDomains.some(blocked => domain?.includes(blocked))) {
        return res.status(400).json({
          error: 'Temporary email addresses not allowed'
        });
      }
      
      // If allowed domains are configured, enforce them
      if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
        return res.status(400).json({
          error: `Email domain ${domain} not allowed`
        });
      }
    }
    
    next();
  }
  
  /**
   * Audit logging middleware
   */
  static auditLog(action: string) {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      // Import AuditService dynamically to avoid circular dependencies
      const { AuditService } = await import('../services/AuditService');
      const auditService = AuditService.getInstance();
      
      // Clean sensitive data from request body
      const cleanBody = req.body ? { ...req.body } : undefined;
      if (cleanBody) {
        delete cleanBody.password;
        delete cleanBody.token;
        delete cleanBody.secret;
        delete cleanBody.apiKey;
      }
      
      // Determine severity based on action
      let severity: 'info' | 'warning' | 'error' | 'critical' = 'info';
      if (action.includes('failed') || action.includes('denied')) {
        severity = 'warning';
      } else if (action.includes('error')) {
        severity = 'error';
      } else if (action.includes('delete') || action.includes('admin')) {
        severity = 'critical';
      }
      
      // Log the audit event
      await auditService.log({
        userId: req.user?.userId,
        action,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestPath: req.path,
        requestMethod: req.method,
        requestBody: cleanBody,
        severity,
        metadata: {
          email: req.user?.email,
          scopes: req.user?.scopes
        }
      });
      
      next();
    };
  }
  
  /**
   * Generate a JWT token for a user
   */
  static generateToken(userId: string, email?: string, scopes?: string[]): string {
    return jwt.sign(
      {
        userId,
        email,
        scopes: scopes || ['read', 'write']
      },
      AuthMiddleware.jwtSecret,
      {
        expiresIn: '24h',
        issuer: 'kelly-assistant',
        audience: 'kelly-assistant-api'
      }
    );
  }
  
  /**
   * Clean up expired rate limits periodically
   */
  static startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, limit] of AuthMiddleware.rateLimitMap.entries()) {
        if (now > limit.resetTime) {
          AuthMiddleware.rateLimitMap.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }
}