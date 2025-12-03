import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import DatabasePool from '../database/pool';
import { toSql } from 'pgvector';

export interface Memory {
  id?: string;
  userId: string;
  content: string;
  category?: string;
  entities?: string[];
  tags?: string[];
  embedding?: number[];
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
}

export interface MemorySearchResult extends Memory {
  similarity?: number;
}

export class MemoryService {
  private pool: Pool | null = null;
  
  async getPool(): Promise<Pool> {
    if (!this.pool) {
      this.pool = await DatabasePool.getInstance();
    }
    return this.pool;
  }
  
  async storeMemory(memory: Memory): Promise<string> {
    const pool = await this.getPool();
    const id = uuidv4();
    const query = `
      INSERT INTO memories (
        id, user_id, content, category, entities, tags, embedding, version
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, 1
      )
      ON CONFLICT (user_id, content) 
      DO UPDATE SET 
        category = EXCLUDED.category,
        entities = EXCLUDED.entities,
        tags = EXCLUDED.tags,
        embedding = EXCLUDED.embedding,
        updated_at = NOW(),
        version = memories.version + 1
      RETURNING id;
    `;
    
    const values = [
      id,
      memory.userId,
      memory.content,
      memory.category,
      memory.entities || [],
      memory.tags || [],
      memory.embedding ? toSql(memory.embedding) : null
    ];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0].id;
    } catch (error) {
      console.error('Error storing memory:', error);
      throw error;
    }
  }
  
  async searchMemories(
    userId: string,
    query: string,
    embedding?: number[],
    limit: number = 10
  ): Promise<MemorySearchResult[]> {
    const pool = await this.getPool();
    let searchQuery: string;
    let values: any[];
    
    if (embedding) {
      // Semantic search using embeddings
      searchQuery = `
        SELECT 
          id, user_id, content, category, entities, tags,
          created_at, updated_at, version,
          1 - (embedding <=> $2) as similarity
        FROM memories
        WHERE user_id = $1
        ORDER BY embedding <=> $2
        LIMIT $3;
      `;
      values = [userId, toSql(embedding), limit];
    } else {
      // Text search
      searchQuery = `
        SELECT 
          id, user_id, content, category, entities, tags,
          created_at, updated_at, version
        FROM memories
        WHERE user_id = $1
          AND (
            content ILIKE $2
            OR category ILIKE $2
            OR array_to_string(tags, ' ') ILIKE $2
            OR array_to_string(entities, ' ') ILIKE $2
          )
        ORDER BY updated_at DESC
        LIMIT $3;
      `;
      values = [userId, `%${query}%`, limit];
    }
    
    try {
      const result = await pool.query(searchQuery, values);
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        content: row.content,
        category: row.category,
        entities: row.entities,
        tags: row.tags,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        version: row.version,
        similarity: row.similarity
      }));
    } catch (error) {
      console.error('Error searching memories:', error);
      throw error;
    }
  }
  
  async getMemoryById(id: string): Promise<Memory | null> {
    const pool = await this.getPool();
    const query = `
      SELECT * FROM memories WHERE id = $1;
    `;
    
    try {
      const result = await pool.query(query, [id]);
      if (result.rows.length === 0) return null;
      
      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        content: row.content,
        category: row.category,
        entities: row.entities,
        tags: row.tags,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        version: row.version
      };
    } catch (error) {
      console.error('Error getting memory:', error);
      throw error;
    }
  }
  
  async getMemoriesByCategory(userId: string, category: string): Promise<Memory[]> {
    const pool = await this.getPool();
    const query = `
      SELECT * FROM memories 
      WHERE user_id = $1 AND category = $2
      ORDER BY updated_at DESC;
    `;
    
    try {
      const result = await pool.query(query, [userId, category]);
      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        content: row.content,
        category: row.category,
        entities: row.entities,
        tags: row.tags,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        version: row.version
      }));
    } catch (error) {
      console.error('Error getting memories by category:', error);
      throw error;
    }
  }
  
  async deleteMemory(id: string, userId: string): Promise<boolean> {
    const pool = await this.getPool();
    const query = `
      DELETE FROM memories 
      WHERE id = $1 AND user_id = $2
      RETURNING id;
    `;
    
    try {
      const result = await pool.query(query, [id, userId]);
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting memory:', error);
      throw error;
    }
  }
  
  // Note: Pool is managed globally by DatabasePool singleton
  // Do not close here as it would affect other services
}