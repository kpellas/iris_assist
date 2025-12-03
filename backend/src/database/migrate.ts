import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

interface Migration {
  id: number;
  name: string;
  applied_at?: Date;
}

class MigrationRunner {
  private pool: Pool;
  
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'kelly_assistant',
      user: process.env.DB_USER || 'kellypellas',
      password: process.env.DB_PASSWORD || '',
    });
  }
  
  async run() {
    try {
      console.log('🚀 Starting database migrations...');
      
      // Create migrations table if it doesn't exist
      await this.createMigrationsTable();
      
      // Get list of migration files
      const migrationsDir = path.join(__dirname, '../../database');
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
      
      // Get applied migrations
      const applied = await this.getAppliedMigrations();
      const appliedNames = new Set(applied.map(m => m.name));
      
      // Run pending migrations
      for (const file of files) {
        if (!appliedNames.has(file)) {
          await this.runMigration(file, path.join(migrationsDir, file));
        }
      }
      
      console.log('✅ All migrations completed successfully');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    } finally {
      await this.pool.end();
    }
  }
  
  private async createMigrationsTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    await this.pool.query(query);
    console.log('✓ Migrations table ready');
  }
  
  private async getAppliedMigrations(): Promise<Migration[]> {
    const result = await this.pool.query('SELECT * FROM migrations ORDER BY id');
    return result.rows;
  }
  
  private async runMigration(name: string, filepath: string) {
    const client = await this.pool.connect();
    
    try {
      console.log(`  Running migration: ${name}`);
      
      await client.query('BEGIN');
      
      // Special handling for IVFFLAT indexes
      if (name.includes('pgvector') || name.includes('ivfflat')) {
        // Optimize for index creation
        await client.query('SET max_parallel_maintenance_workers = 7');
        await client.query('SET maintenance_work_mem = \'512MB\'');
        console.log('  ↳ Optimized settings for vector index creation');
      }
      
      // Read and execute migration
      const sql = fs.readFileSync(filepath, 'utf8');
      
      // Split by statements if needed (handle DO blocks correctly)
      const statements = this.splitSqlStatements(sql);
      
      for (const statement of statements) {
        if (statement.trim()) {
          await client.query(statement);
        }
      }
      
      // Record migration
      await client.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        [name]
      );
      
      await client.query('COMMIT');
      console.log(`  ✓ ${name} applied successfully`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  private splitSqlStatements(sql: string): string[] {
    // Handle DO blocks and other complex statements
    const statements: string[] = [];
    let current = '';
    let inDoBlock = false;
    let dollarQuote = '';
    
    const lines = sql.split('\n');
    
    for (const line of lines) {
      // Check for DO block start
      if (line.trim().toUpperCase().startsWith('DO')) {
        inDoBlock = true;
      }
      
      // Check for dollar quotes
      const dollarMatch = line.match(/\$([^$]*)\$/);
      if (dollarMatch) {
        if (!dollarQuote) {
          dollarQuote = dollarMatch[0];
        } else if (dollarQuote === dollarMatch[0]) {
          dollarQuote = '';
        }
      }
      
      current += line + '\n';
      
      // Check for statement end
      if (!inDoBlock && !dollarQuote && line.trim().endsWith(';')) {
        statements.push(current.trim());
        current = '';
      }
      
      // Check for DO block end
      if (inDoBlock && line.trim().endsWith('$$;')) {
        inDoBlock = false;
        statements.push(current.trim());
        current = '';
      }
    }
    
    if (current.trim()) {
      statements.push(current.trim());
    }
    
    return statements;
  }
}

// Run migrations if called directly
if (require.main === module) {
  const runner = new MigrationRunner();
  runner.run();
}

export default MigrationRunner;