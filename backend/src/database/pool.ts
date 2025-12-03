import { Pool } from 'pg';
import pgvector from 'pgvector/pg';

class DatabasePool {
  private static instance: Pool | null = null;
  private static initialized: boolean = false;
  
  static async getInstance(): Promise<Pool> {
    if (!DatabasePool.instance) {
      DatabasePool.instance = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'kelly_assistant',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: parseInt(process.env.DB_POOL_MAX || '10'),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
      });
      
      // Handle pool errors
      DatabasePool.instance.on('error', (err) => {
        console.error('Unexpected database pool error:', err);
      });
      
      // Log pool creation (useful for Lambda cold starts)
      console.log('Database pool created');
      
      // Initialize pgvector with proper type registration
      if (!DatabasePool.initialized) {
        try {
          // Register pgvector types with the pool's client
          const client = await DatabasePool.instance.connect();
          await pgvector.registerTypes(client);
          client.release();
          DatabasePool.initialized = true;
          console.log('pgvector types registered');
        } catch (error) {
          console.error('Failed to register pgvector types:', error);
          // Continue anyway - the database will still work for non-vector operations
        }
      }
    }
    
    return DatabasePool.instance;
  }
  
  static async close(): Promise<void> {
    if (DatabasePool.instance) {
      await DatabasePool.instance.end();
      DatabasePool.instance = null;
      console.log('Database pool closed');
    }
  }
}

export default DatabasePool;

// Lambda cleanup hook
export const cleanupPool = async (): Promise<void> => {
  await DatabasePool.close();
};