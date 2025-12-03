import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import DatabasePool from '../database/pool';

export interface ProtocolStep {
  step: string;
  duration: number; // in minutes
  instructions?: string;
  timerType?: 'countdown' | 'stopwatch';
}

export interface Protocol {
  id?: string;
  userId: string;
  name: string;
  description?: string;
  steps: ProtocolStep[];
  totalDuration?: number;
  tags?: string[];
  isActive?: boolean;
  lastRun?: Date;
  runCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProtocolRun {
  id?: string;
  protocolId: string;
  userId: string;
  startedAt?: Date;
  completedAt?: Date;
  status?: 'in_progress' | 'completed' | 'cancelled';
  currentStep?: number;
  notes?: string;
  metadata?: any;
}

export class ProtocolService {
  private pool: Pool | null = null;
  
  async getPool(): Promise<Pool> {
    if (!this.pool) {
      this.pool = await DatabasePool.getInstance();
    }
    return this.pool;
  }
  
  async createProtocol(protocol: Protocol): Promise<string> {
    const id = uuidv4();
    const totalDuration = protocol.steps.reduce((sum, step) => sum + step.duration, 0);
    
    const query = `
      INSERT INTO protocols (
        id, user_id, name, description, steps, 
        total_duration, tags, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      )
      ON CONFLICT (user_id, name) 
      DO UPDATE SET 
        description = EXCLUDED.description,
        steps = EXCLUDED.steps,
        total_duration = EXCLUDED.total_duration,
        tags = EXCLUDED.tags,
        updated_at = NOW()
      RETURNING id;
    `;
    
    const values = [
      id,
      protocol.userId,
      protocol.name,
      protocol.description || null,
      JSON.stringify(protocol.steps),
      totalDuration,
      protocol.tags || [],
      protocol.isActive !== false
    ];
    
    try {
      const pool = await this.getPool();
      const result = await pool.query(query, values);
      return result.rows[0].id;
    } catch (error) {
      console.error('Error creating protocol:', error);
      throw error;
    }
  }
  
  async getProtocol(userId: string, name: string): Promise<Protocol | null> {
    const pool = await this.getPool();
    const query = `
      SELECT * FROM protocols 
      WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND is_active = true;
    `;
    
    try {
      const result = await pool.query(query, [userId, name]);
      if (result.rows.length === 0) return null;
      
      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        description: row.description,
        steps: row.steps,
        totalDuration: row.total_duration,
        tags: row.tags,
        isActive: row.is_active,
        lastRun: row.last_run,
        runCount: row.run_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Error getting protocol:', error);
      throw error;
    }
  }
  
  async listProtocols(userId: string): Promise<Protocol[]> {
    const pool = await this.getPool();
    const query = `
      SELECT * FROM protocols 
      WHERE user_id = $1 AND is_active = true
      ORDER BY run_count DESC, updated_at DESC;
    `;
    
    try {
      const result = await pool.query(query, [userId]);
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        description: row.description,
        steps: row.steps,
        totalDuration: row.total_duration,
        tags: row.tags,
        isActive: row.is_active,
        lastRun: row.last_run,
        runCount: row.run_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('Error listing protocols:', error);
      throw error;
    }
  }
  
  async startProtocolRun(protocolId: string, userId: string): Promise<string> {
    const pool = await this.getPool();
    const runId = uuidv4();
    
    const query = `
      INSERT INTO protocol_runs (
        id, protocol_id, user_id, status, current_step
      ) VALUES (
        $1, $2, $3, 'in_progress', 0
      ) RETURNING id;
    `;
    
    try {
      const result = await pool.query(query, [runId, protocolId, userId]);
      
      // Update protocol last_run and increment run_count
      await pool.query(
        `UPDATE protocols 
         SET last_run = NOW(), run_count = run_count + 1 
         WHERE id = $1`,
        [protocolId]
      );
      
      return result.rows[0].id;
    } catch (error) {
      console.error('Error starting protocol run:', error);
      throw error;
    }
  }
  
  async updateProtocolRunStep(runId: string, stepNumber: number): Promise<boolean> {
    const pool = await this.getPool();
    const query = `
      UPDATE protocol_runs 
      SET current_step = $2 
      WHERE id = $1
      RETURNING id;
    `;
    
    try {
      const result = await pool.query(query, [runId, stepNumber]);
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error updating protocol run step:', error);
      throw error;
    }
  }
  
  async completeProtocolRun(runId: string, notes?: string): Promise<boolean> {
    const pool = await this.getPool();
    const query = `
      UPDATE protocol_runs 
      SET status = 'completed', 
          completed_at = NOW(),
          notes = $2
      WHERE id = $1
      RETURNING id;
    `;
    
    try {
      const result = await pool.query(query, [runId, notes || null]);
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error completing protocol run:', error);
      throw error;
    }
  }
  
  async cancelProtocolRun(runId: string): Promise<boolean> {
    const pool = await this.getPool();
    const query = `
      UPDATE protocol_runs 
      SET status = 'cancelled', 
          completed_at = NOW()
      WHERE id = $1
      RETURNING id;
    `;
    
    try {
      const result = await pool.query(query, [runId]);
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error cancelling protocol run:', error);
      throw error;
    }
  }
  
  async getActiveRun(userId: string): Promise<ProtocolRun | null> {
    const pool = await this.getPool();
    const query = `
      SELECT pr.*, p.name as protocol_name, p.steps 
      FROM protocol_runs pr
      JOIN protocols p ON pr.protocol_id = p.id
      WHERE pr.user_id = $1 AND pr.status = 'in_progress'
      ORDER BY pr.started_at DESC
      LIMIT 1;
    `;
    
    try {
      const result = await pool.query(query, [userId]);
      if (result.rows.length === 0) return null;
      
      const row = result.rows[0];
      return {
        id: row.id,
        protocolId: row.protocol_id,
        userId: row.user_id,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        status: row.status,
        currentStep: row.current_step,
        notes: row.notes,
        metadata: {
          protocolName: row.protocol_name,
          steps: row.steps
        }
      };
    } catch (error) {
      console.error('Error getting active run:', error);
      throw error;
    }
  }
  
  async getProtocolHistory(
    userId: string, 
    protocolId?: string, 
    limit: number = 10
  ): Promise<ProtocolRun[]> {
    let query = `
      SELECT pr.*, p.name as protocol_name 
      FROM protocol_runs pr
      JOIN protocols p ON pr.protocol_id = p.id
      WHERE pr.user_id = $1
    `;
    
    const values: any[] = [userId];
    
    if (protocolId) {
      query += ` AND pr.protocol_id = $2`;
      values.push(protocolId);
      query += ` ORDER BY pr.started_at DESC LIMIT $3`;
      values.push(limit);
    } else {
      query += ` ORDER BY pr.started_at DESC LIMIT $2`;
      values.push(limit);
    }
    
    try {
      const pool = await this.getPool();
      const result = await pool.query(query, values);
      return result.rows.map(row => ({
        id: row.id,
        protocolId: row.protocol_id,
        userId: row.user_id,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        status: row.status,
        currentStep: row.current_step,
        notes: row.notes,
        metadata: {
          protocolName: row.protocol_name
        }
      }));
    } catch (error) {
      console.error('Error getting protocol history:', error);
      throw error;
    }
  }
  
  async deleteProtocol(id: string, userId: string): Promise<boolean> {
    const pool = await this.getPool();
    // Soft delete - just mark as inactive
    const query = `
      UPDATE protocols 
      SET is_active = false 
      WHERE id = $1 AND user_id = $2
      RETURNING id;
    `;
    
    try {
      const result = await pool.query(query, [id, userId]);
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting protocol:', error);
      throw error;
    }
  }
  
  // Note: Pool is managed globally by DatabasePool singleton
  // Do not close here as it would affect other services
}