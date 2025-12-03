import { Pool } from 'pg';
import DatabasePool from '../database/pool';
import { CloudWatchLogsClient, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import crypto from 'crypto';

export interface AuditLog {
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
}

export interface AuditServiceConfig {
  enableDatabase?: boolean;
  enableCloudWatch?: boolean;
  enableSIEM?: boolean;
  siemEndpoint?: string;
  siemApiKey?: string;
  cloudWatchLogGroup?: string;
  cloudWatchLogStream?: string;
}

export class AuditService {
  private static instance: AuditService;
  private pool: Pool | null = null;
  private cloudWatchClient?: CloudWatchLogsClient;
  private config: AuditServiceConfig;
  private logBuffer: AuditLog[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL = 10000; // 10 seconds
  
  constructor(config?: AuditServiceConfig) {
    this.config = {
      enableDatabase: true,
      enableCloudWatch: process.env.AWS_REGION ? true : false,
      enableSIEM: process.env.SIEM_ENDPOINT ? true : false,
      siemEndpoint: process.env.SIEM_ENDPOINT,
      siemApiKey: process.env.SIEM_API_KEY,
      cloudWatchLogGroup: process.env.CLOUDWATCH_LOG_GROUP || '/aws/lambda/kelly-assistant',
      cloudWatchLogStream: process.env.CLOUDWATCH_LOG_STREAM || 'audit-logs',
      ...config
    };
    
    if (this.config.enableCloudWatch && process.env.AWS_REGION) {
      this.cloudWatchClient = new CloudWatchLogsClient({
        region: process.env.AWS_REGION
      });
    }
    
    // Start buffer flush interval
    this.startFlushInterval();
  }
  
  static getInstance(config?: AuditServiceConfig): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService(config);
    }
    return AuditService.instance;
  }
  
  /**
   * Log an audit event
   */
  async log(data: AuditLog): Promise<void> {
    // Add timestamp
    const logEntry = {
      ...data,
      timestamp: new Date().toISOString(),
      eventId: crypto.randomUUID()
    };
    
    // Add to buffer for batch processing
    this.logBuffer.push(logEntry);
    
    // Check if buffer should be flushed
    if (this.logBuffer.length >= this.BUFFER_SIZE) {
      await this.flush();
    }
    
    // For critical events, flush immediately
    if (data.severity === 'critical' || data.severity === 'error') {
      await this.flush();
    }
  }
  
  /**
   * Flush buffered logs to all configured destinations
   */
  async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return;
    
    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];
    
    const promises: Promise<void>[] = [];
    
    // Database logging
    if (this.config.enableDatabase) {
      promises.push(this.logToDatabase(logsToFlush));
    }
    
    // CloudWatch logging
    if (this.config.enableCloudWatch && this.cloudWatchClient) {
      promises.push(this.logToCloudWatch(logsToFlush));
    }
    
    // SIEM logging
    if (this.config.enableSIEM) {
      promises.push(this.logToSIEM(logsToFlush));
    }
    
    // Console logging (always enabled in development)
    if (process.env.NODE_ENV !== 'production') {
      this.logToConsole(logsToFlush);
    }
    
    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('Error flushing audit logs:', error);
      // Re-add failed logs to buffer for retry
      this.logBuffer = [...logsToFlush, ...this.logBuffer];
    }
  }
  
  /**
   * Log to database
   */
  private async logToDatabase(logs: AuditLog[]): Promise<void> {
    if (!this.pool) {
      this.pool = await DatabasePool.getInstance();
    }
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const log of logs) {
        await client.query(
          `INSERT INTO audit_logs (
            user_id, action, resource_type, resource_id, 
            ip_address, user_agent, request_method, request_path,
            request_body, response_status, error_message, metadata, severity
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            log.userId || null,
            log.action,
            log.resourceType || null,
            log.resourceId || null,
            log.ipAddress || null,
            log.userAgent || null,
            log.requestMethod || null,
            log.requestPath || null,
            log.requestBody ? JSON.stringify(log.requestBody) : null,
            log.responseStatus || null,
            log.errorMessage || null,
            log.metadata ? JSON.stringify(log.metadata) : null,
            log.severity || 'info'
          ]
        );
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Log to AWS CloudWatch
   */
  private async logToCloudWatch(logs: AuditLog[]): Promise<void> {
    if (!this.cloudWatchClient) return;
    
    const logEvents = logs.map(log => ({
      timestamp: new Date(log.timestamp || Date.now()).getTime(),
      message: JSON.stringify(log)
    }));
    
    try {
      await this.cloudWatchClient.send(new PutLogEventsCommand({
        logGroupName: this.config.cloudWatchLogGroup,
        logStreamName: this.config.cloudWatchLogStream,
        logEvents
      }));
    } catch (error) {
      console.error('CloudWatch logging error:', error);
      throw error;
    }
  }
  
  /**
   * Log to SIEM (e.g., Splunk, Datadog, ELK)
   */
  private async logToSIEM(logs: AuditLog[]): Promise<void> {
    if (!this.config.siemEndpoint) return;
    
    try {
      const response = await fetch(this.config.siemEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.siemApiKey}`
        },
        body: JSON.stringify({
          source: 'kelly-assistant',
          environment: process.env.NODE_ENV || 'development',
          logs
        })
      });
      
      if (!response.ok) {
        throw new Error(`SIEM logging failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('SIEM logging error:', error);
      throw error;
    }
  }
  
  /**
   * Log to console (development)
   */
  private logToConsole(logs: AuditLog[]): void {
    for (const log of logs) {
      const level = this.getSeverityLevel(log.severity);
      const message = `[${log.severity?.toUpperCase() || 'INFO'}] ${log.action}`;
      const details = {
        userId: log.userId,
        resource: log.resourceType ? `${log.resourceType}:${log.resourceId}` : undefined,
        ip: log.ipAddress,
        ...log.metadata
      };
      
      console[level](message, JSON.stringify(details, null, 2));
    }
  }
  
  /**
   * Get console log level from severity
   */
  private getSeverityLevel(severity?: string): 'log' | 'warn' | 'error' {
    switch (severity) {
      case 'critical':
      case 'error':
        return 'error';
      case 'warning':
        return 'warn';
      default:
        return 'log';
    }
  }
  
  /**
   * Start automatic flush interval
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(async () => {
      await this.flush();
    }, this.FLUSH_INTERVAL);
  }
  
  /**
   * Stop the service and flush remaining logs
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    await this.flush();
  }
  
  /**
   * Query audit logs from database
   */
  async query(filters: {
    userId?: string;
    action?: string;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    if (!this.pool) {
      this.pool = await DatabasePool.getInstance();
    }
    
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;
    
    if (filters.userId) {
      query += ` AND user_id = $${paramCount++}`;
      params.push(filters.userId);
    }
    
    if (filters.action) {
      query += ` AND action LIKE $${paramCount++}`;
      params.push(`%${filters.action}%`);
    }
    
    if (filters.severity) {
      query += ` AND severity = $${paramCount++}`;
      params.push(filters.severity);
    }
    
    if (filters.startDate) {
      query += ` AND created_at >= $${paramCount++}`;
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ` AND created_at <= $${paramCount++}`;
      params.push(filters.endDate);
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (filters.limit) {
      query += ` LIMIT $${paramCount++}`;
      params.push(filters.limit);
    }
    
    if (filters.offset) {
      query += ` OFFSET $${paramCount++}`;
      params.push(filters.offset);
    }
    
    const result = await this.pool.query(query, params);
    
    return result.rows.map(row => ({
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      requestMethod: row.request_method,
      requestPath: row.request_path,
      requestBody: row.request_body,
      responseStatus: row.response_status,
      errorMessage: row.error_message,
      metadata: row.metadata,
      severity: row.severity,
      timestamp: row.created_at
    }));
  }
  
  /**
   * Get audit statistics
   */
  async getStatistics(userId?: string, days: number = 30): Promise<any> {
    if (!this.pool) {
      this.pool = await DatabasePool.getInstance();
    }
    
    const userFilter = userId ? 'AND user_id = $2' : '';
    const params = userId ? [days, userId] : [days];
    
    const result = await this.pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN severity = 'info' THEN 1 END) as info_count,
        COUNT(CASE WHEN severity = 'warning' THEN 1 END) as warning_count,
        COUNT(CASE WHEN severity = 'error' THEN 1 END) as error_count,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT action) as unique_actions,
        COUNT(DISTINCT ip_address) as unique_ips
      FROM audit_logs
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      ${userFilter}`,
      params
    );
    
    return result.rows[0];
  }
}