import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import DatabasePool from '../database/pool';

export interface Task {
  id?: string;
  userId: string;
  title: string;
  description?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: number;
  dueDate?: Date;
  reminderTime?: Date;
  completedAt?: Date;
  category?: string;
  tags?: string[];
  metadata?: any;
}

export class TaskService {
  private pool: Pool | null = null;
  
  async getPool(): Promise<Pool> {
    if (!this.pool) {
      this.pool = await DatabasePool.getInstance();
    }
    return this.pool;
  }
  
  async createTask(task: Task): Promise<string> {
    const pool = await this.getPool();
    const id = uuidv4();
    
    const query = `
      INSERT INTO tasks (
        id, user_id, title, description, status, priority,
        due_date, reminder_time, category, tags, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      ) RETURNING id;
    `;
    
    const values = [
      id,
      task.userId,
      task.title,
      task.description || null,
      task.status || 'pending',
      task.priority || 3,
      task.dueDate || null,
      task.reminderTime || null,
      task.category || 'personal',
      task.tags || [],
      task.metadata || {}
    ];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0].id;
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }
  
  async getTasks(userId: string, filter?: {
    status?: string;
    category?: string;
    dueToday?: boolean;
  }): Promise<Task[]> {
    const pool = await this.getPool();
    let query = `SELECT * FROM tasks WHERE user_id = $1`;
    const values: any[] = [userId];
    let paramCount = 1;
    
    if (filter?.status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      values.push(filter.status);
    }
    
    if (filter?.category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      values.push(filter.category);
    }
    
    if (filter?.dueToday) {
      query += ` AND DATE(due_date) = CURRENT_DATE`;
    }
    
    query += ` ORDER BY priority ASC, due_date ASC NULLS LAST, created_at DESC`;
    
    try {
      const result = await pool.query(query, values);
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        dueDate: row.due_date,
        reminderTime: row.reminder_time,
        completedAt: row.completed_at,
        category: row.category,
        tags: row.tags,
        metadata: row.metadata
      }));
    } catch (error) {
      console.error('Error getting tasks:', error);
      throw error;
    }
  }
  
  async updateTaskStatus(taskId: string, status: string): Promise<boolean> {
    const pool = await this.getPool();
    const query = `
      UPDATE tasks 
      SET status = $2,
          completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE NULL END
      WHERE id = $1
      RETURNING id;
    `;
    
    try {
      const result = await pool.query(query, [taskId, status]);
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error updating task status:', error);
      throw error;
    }
  }
  
  async deleteTask(taskId: string, userId: string): Promise<boolean> {
    const pool = await this.getPool();
    const query = `DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id;`;
    
    try {
      const result = await pool.query(query, [taskId, userId]);
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  }
  
  async getTasksDueSoon(userId: string, hours: number = 24): Promise<Task[]> {
    const pool = await this.getPool();
    const query = `
      SELECT * FROM tasks 
      WHERE user_id = $1 
        AND status = 'pending'
        AND due_date <= NOW() + INTERVAL '${hours} hours'
        AND due_date >= NOW()
      ORDER BY due_date ASC;
    `;
    
    try {
      const result = await pool.query(query, [userId]);
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        dueDate: row.due_date,
        reminderTime: row.reminder_time,
        category: row.category,
        tags: row.tags
      }));
    } catch (error) {
      console.error('Error getting tasks due soon:', error);
      throw error;
    }
  }
}