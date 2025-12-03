import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Pool } from 'pg';
import DatabasePool from '../database/pool';
import { AuthMiddleware } from '../middleware/AuthMiddleware';

export interface User {
  id: string;
  email: string;
  username: string;
  fullName?: string;
  isActive: boolean;
  isVerified: boolean;
  roles?: string[];
  permissions?: string[];
}

export interface LoginResult {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

export interface RegisterData {
  email: string;
  username: string;
  password: string;
  fullName?: string;
}

export class UserAuthService {
  private pool: Pool | null = null;
  private readonly SALT_ROUNDS = 12;
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
  private readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  
  /**
   * Initialize database connection
   */
  private async getPool(): Promise<Pool> {
    if (!this.pool) {
      this.pool = await DatabasePool.getInstance();
    }
    return this.pool;
  }
  
  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<LoginResult> {
    const pool = await this.getPool();
    
    try {
      // Validate input
      if (!this.isValidEmail(data.email)) {
        return { success: false, message: 'Invalid email format' };
      }
      
      if (!this.isValidPassword(data.password)) {
        return { 
          success: false, 
          message: 'Password must be at least 8 characters with uppercase, lowercase, and numbers' 
        };
      }
      
      if (!this.isValidUsername(data.username)) {
        return { 
          success: false, 
          message: 'Username must be 3-20 characters, alphanumeric with underscores only' 
        };
      }
      
      // Check if user exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [data.email, data.username]
      );
      
      if (existingUser.rows.length > 0) {
        return { success: false, message: 'User already exists' };
      }
      
      // Hash password
      const passwordHash = await bcrypt.hash(data.password, this.SALT_ROUNDS);
      
      // Create user
      const result = await pool.query(
        `INSERT INTO users (email, username, password_hash, full_name, is_active, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, username, full_name as "fullName", is_active as "isActive", is_verified as "isVerified"`,
        [data.email, data.username, passwordHash, data.fullName, true, false]
      );
      
      const user = result.rows[0];
      
      // Grant default permissions
      await this.grantDefaultPermissions(user.id);
      
      // Generate verification token
      await this.createVerificationToken(user.id, data.email);
      
      return {
        success: true,
        user,
        message: 'Registration successful. Please verify your email.'
      };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, message: 'Registration failed' };
    }
  }
  
  /**
   * Authenticate user with email/username and password
   */
  async login(identifier: string, password: string, ipAddress?: string, userAgent?: string): Promise<LoginResult> {
    const pool = await this.getPool();
    
    try {
      // Find user by email or username
      const result = await pool.query(
        `SELECT id, email, username, password_hash, full_name as "fullName",
                is_active as "isActive", is_verified as "isVerified",
                failed_login_attempts, locked_until
         FROM users
         WHERE email = $1 OR username = $1`,
        [identifier]
      );
      
      if (result.rows.length === 0) {
        // Don't reveal if user exists
        return { success: false, message: 'Invalid credentials' };
      }
      
      const user = result.rows[0];
      
      // Check if account is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const minutesLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
        return { 
          success: false, 
          message: `Account locked. Try again in ${minutesLeft} minutes.` 
        };
      }
      
      // Check if account is active
      if (!user.isActive) {
        return { success: false, message: 'Account is disabled' };
      }
      
      // Verify password
      const validPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!validPassword) {
        // Increment failed attempts
        await this.incrementFailedAttempts(user.id);
        return { success: false, message: 'Invalid credentials' };
      }
      
      // Check if email is verified (warning only, still allow login)
      if (!user.isVerified) {
        console.warn(`Unverified user login: ${user.email}`);
      }
      
      // Reset failed attempts and update last login
      await pool.query(
        `UPDATE users 
         SET failed_login_attempts = 0, 
             locked_until = NULL,
             last_login_at = NOW()
         WHERE id = $1`,
        [user.id]
      );
      
      // Get user roles and permissions
      const roles = await this.getUserRoles(user.id);
      const permissions = await this.getUserPermissions(user.id);
      
      // Create session
      const sessionToken = await this.createSession(user.id, ipAddress, userAgent);
      
      // Generate JWT
      const token = AuthMiddleware.generateToken(
        user.id,
        user.email,
        permissions
      );
      
      // Audit log successful login
      await this.auditLog({
        userId: user.id,
        action: 'user.login',
        ipAddress,
        userAgent,
        severity: 'info',
        metadata: { email: user.email }
      });
      
      return {
        success: true,
        user: {
          ...user,
          roles,
          permissions
        },
        token
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Login failed' };
    }
  }
  
  /**
   * Verify user session
   */
  async verifySession(tokenHash: string): Promise<User | null> {
    const pool = await this.getPool();
    
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.username, u.full_name as "fullName",
                u.is_active as "isActive", u.is_verified as "isVerified"
         FROM users u
         JOIN user_sessions s ON s.user_id = u.id
         WHERE s.token_hash = $1
           AND s.expires_at > NOW()
           AND s.revoked_at IS NULL
           AND u.is_active = true`,
        [tokenHash]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const user = result.rows[0];
      user.roles = await this.getUserRoles(user.id);
      user.permissions = await this.getUserPermissions(user.id);
      
      return user;
    } catch (error) {
      console.error('Session verification error:', error);
      return null;
    }
  }
  
  /**
   * Logout user (revoke session)
   */
  async logout(userId: string, tokenHash?: string): Promise<boolean> {
    const pool = await this.getPool();
    
    try {
      if (tokenHash) {
        // Revoke specific session
        await pool.query(
          'UPDATE user_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND user_id = $2',
          [tokenHash, userId]
        );
      } else {
        // Revoke all sessions
        await pool.query(
          'UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
          [userId]
        );
      }
      
      await this.auditLog({
        userId,
        action: 'user.logout',
        severity: 'info'
      });
      
      return true;
    } catch (error) {
      console.error('Logout error:', error);
      return false;
    }
  }
  
  /**
   * Change user password
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    const pool = await this.getPool();
    
    try {
      // Verify old password
      const result = await pool.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        return false;
      }
      
      const validPassword = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
      if (!validPassword) {
        await this.auditLog({
          userId,
          action: 'user.change_password.failed',
          severity: 'warning',
          metadata: { reason: 'invalid_old_password' }
        });
        return false;
      }
      
      // Validate new password
      if (!this.isValidPassword(newPassword)) {
        return false;
      }
      
      // Hash and update
      const newHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, userId]
      );
      
      // Revoke all sessions
      await this.logout(userId);
      
      await this.auditLog({
        userId,
        action: 'user.change_password',
        severity: 'info'
      });
      
      return true;
    } catch (error) {
      console.error('Password change error:', error);
      return false;
    }
  }
  
  /**
   * Create password reset token
   */
  async createPasswordResetToken(email: string): Promise<string | null> {
    const pool = await this.getPool();
    
    try {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      
      if (userResult.rows.length === 0) {
        // Don't reveal if user exists
        return null;
      }
      
      const userId = userResult.rows[0].id;
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt]
      );
      
      await this.auditLog({
        userId,
        action: 'user.password_reset.requested',
        severity: 'info',
        metadata: { email }
      });
      
      return token;
    } catch (error) {
      console.error('Password reset token error:', error);
      return null;
    }
  }
  
  // Helper methods
  
  private async incrementFailedAttempts(userId: string): Promise<void> {
    const pool = await this.getPool();
    
    await pool.query(
      `UPDATE users 
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE 
             WHEN failed_login_attempts >= $1 
             THEN NOW() + INTERVAL '${this.LOCKOUT_DURATION / 1000} seconds'
             ELSE locked_until
           END
       WHERE id = $2`,
      [this.MAX_LOGIN_ATTEMPTS - 1, userId]
    );
    
    await this.auditLog({
      userId,
      action: 'user.login.failed',
      severity: 'warning'
    });
  }
  
  private async createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const pool = await this.getPool();
    
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION);
    
    await pool.query(
      `INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, tokenHash, ipAddress, userAgent, expiresAt]
    );
    
    return token;
  }
  
  private async createVerificationToken(userId: string, email: string): Promise<void> {
    // In production, send verification email
    // For now, just log
    const token = crypto.randomBytes(32).toString('hex');
    console.log(`Verification token for ${email}: ${token}`);
  }
  
  private async getUserRoles(userId: string): Promise<string[]> {
    const pool = await this.getPool();
    
    const result = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [userId]
    );
    
    return result.rows.map(row => row.role);
  }
  
  private async getUserPermissions(userId: string): Promise<string[]> {
    const pool = await this.getPool();
    
    const result = await pool.query(
      `SELECT scope FROM user_permissions 
       WHERE user_id = $1 
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );
    
    const permissions = result.rows.map(row => row.scope);
    
    // Add role-based permissions
    const roles = await this.getUserRoles(userId);
    if (roles.includes('admin')) {
      permissions.push('admin', 'drive.admin', 'gmail.admin');
    }
    
    return [...new Set(permissions)]; // Remove duplicates
  }
  
  private async grantDefaultPermissions(userId: string): Promise<void> {
    const pool = await this.getPool();
    
    const defaultScopes = ['read', 'write', 'drive.read', 'gmail.read'];
    
    for (const scope of defaultScopes) {
      await pool.query(
        'INSERT INTO user_permissions (user_id, scope) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, scope]
      );
    }
  }
  
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  private isValidPassword(password: string): boolean {
    // At least 8 chars, one uppercase, one lowercase, one number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return passwordRegex.test(password);
  }
  
  private isValidUsername(username: string): boolean {
    // 3-20 chars, alphanumeric and underscores only
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    return usernameRegex.test(username);
  }
  
  /**
   * Audit log helper
   */
  private async auditLog(data: {
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    requestMethod?: string;
    requestPath?: string;
    requestBody?: any;
    responseStatus?: number;
    errorMessage?: string;
    metadata?: any;
    severity?: 'info' | 'warning' | 'error' | 'critical';
  }): Promise<void> {
    const pool = await this.getPool();
    
    try {
      await pool.query(
        `INSERT INTO audit_logs (
          user_id, action, resource_type, resource_id, 
          ip_address, user_agent, request_method, request_path,
          request_body, response_status, error_message, metadata, severity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          data.userId || null,
          data.action,
          data.resourceType || null,
          data.resourceId || null,
          data.ipAddress || null,
          data.userAgent || null,
          data.requestMethod || null,
          data.requestPath || null,
          data.requestBody ? JSON.stringify(data.requestBody) : null,
          data.responseStatus || null,
          data.errorMessage || null,
          data.metadata ? JSON.stringify(data.metadata) : null,
          data.severity || 'info'
        ]
      );
    } catch (error) {
      console.error('Audit log error:', error);
    }
  }
}