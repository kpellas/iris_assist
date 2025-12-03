import { Pool } from 'pg';
import DatabasePool from '../database/pool';
import { DiaryParser } from './DiaryParser';
import { LLMService } from './LLMService';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

export class DiaryService {
  private pool: Pool | null = null;
  private parser: DiaryParser;
  private llm: LLMService;

  constructor() {
    this.parser = new DiaryParser();
    this.llm = new LLMService();
  }

  private async getPool(): Promise<Pool> {
    if (!this.pool) {
      this.pool = await DatabasePool.getInstance();
    }
    return this.pool;
  }

  async createEntry(userId: string, date: Date, rawText: string) {
    const pool = await this.getPool();
    
    // Parse the raw text to extract structured data
    const extracted = this.parser.parse(rawText);
    
    // Generate embedding for semantic search
    let embedding: number[] | undefined;
    if (process.env.OPENAI_API_KEY?.startsWith('sk-')) {
      embedding = await this.llm.generateEmbedding(rawText);
    }

    // Generate a summary
    const daySummary = this.parser.generateSummary(extracted);

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert main diary entry
      const entryResult = await client.query(
        `INSERT INTO diary_entries 
         (user_id, entry_date, raw_text, wake_time, sleep_time, mood_rating, 
          energy_level, day_summary, key_events, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, entry_date) 
         DO UPDATE SET 
           raw_text = EXCLUDED.raw_text,
           wake_time = EXCLUDED.wake_time,
           sleep_time = EXCLUDED.sleep_time,
           mood_rating = EXCLUDED.mood_rating,
           energy_level = EXCLUDED.energy_level,
           day_summary = EXCLUDED.day_summary,
           key_events = EXCLUDED.key_events,
           embedding = EXCLUDED.embedding,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [
          userId,
          format(date, 'yyyy-MM-dd'),
          rawText,
          extracted.wakeTime,
          extracted.sleepTime,
          extracted.mood,
          extracted.energy,
          daySummary,
          extracted.keyEvents,
          embedding ? `[${embedding.join(',')}]` : null
        ]
      );

      const entryId = entryResult.rows[0].id;

      // Insert activities
      for (const activity of extracted.activities) {
        await client.query(
          `INSERT INTO diary_activities 
           (diary_entry_id, activity_type, activity_name, duration_minutes, 
            intensity, calories_burned, sets, reps, notes, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            entryId,
            activity.type,
            activity.name,
            activity.duration,
            activity.intensity,
            activity.calories,
            activity.sets,
            activity.reps,
            activity.notes,
            activity.timestamp
          ]
        );
      }

      // Insert products
      for (const product of extracted.products) {
        await client.query(
          `INSERT INTO diary_products 
           (diary_entry_id, product_name, product_category, usage_duration, rating, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            entryId,
            product.name,
            product.category,
            product.duration,
            product.rating,
            product.notes
          ]
        );
      }

      // Insert health metrics
      for (const health of extracted.health) {
        await client.query(
          `INSERT INTO diary_health 
           (diary_entry_id, metric_type, value_primary, value_secondary, unit, source, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            entryId,
            health.type,
            health.value,
            health.secondaryValue,
            health.unit,
            health.source,
            health.timestamp
          ]
        );
      }

      // Insert nutrition
      for (const nutrition of extracted.nutrition) {
        await client.query(
          `INSERT INTO diary_nutrition 
           (diary_entry_id, meal_type, food_items, calories, protein_g, carbs_g, fat_g, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            entryId,
            nutrition.mealType,
            nutrition.items,
            nutrition.calories,
            nutrition.protein,
            nutrition.carbs,
            nutrition.fat,
            nutrition.timestamp
          ]
        );
      }

      // Insert general metrics
      for (const metric of extracted.metrics) {
        await client.query(
          `INSERT INTO diary_metrics 
           (diary_entry_id, category, metric_type, metric_value, metric_unit, metric_text, timestamp, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            entryId,
            metric.category,
            metric.type,
            metric.value,
            metric.unit,
            metric.text,
            metric.timestamp,
            metric.notes
          ]
        );
      }

      await client.query('COMMIT');
      
      return {
        id: entryId,
        date: format(date, 'yyyy-MM-dd'),
        summary: daySummary,
        extracted
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getEntry(userId: string, date: Date) {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT de.*, 
        array_agg(DISTINCT jsonb_build_object(
          'type', da.activity_type,
          'name', da.activity_name,
          'duration', da.duration_minutes,
          'calories', da.calories_burned
        )) FILTER (WHERE da.id IS NOT NULL) as activities,
        array_agg(DISTINCT jsonb_build_object(
          'name', dp.product_name,
          'category', dp.product_category,
          'rating', dp.rating
        )) FILTER (WHERE dp.id IS NOT NULL) as products,
        array_agg(DISTINCT jsonb_build_object(
          'type', dh.metric_type,
          'value', dh.value_primary,
          'unit', dh.unit
        )) FILTER (WHERE dh.id IS NOT NULL) as health_metrics,
        array_agg(DISTINCT jsonb_build_object(
          'meal', dn.meal_type,
          'items', dn.food_items,
          'calories', dn.calories
        )) FILTER (WHERE dn.id IS NOT NULL) as nutrition
      FROM diary_entries de
      LEFT JOIN diary_activities da ON de.id = da.diary_entry_id
      LEFT JOIN diary_products dp ON de.id = dp.diary_entry_id
      LEFT JOIN diary_health dh ON de.id = dh.diary_entry_id
      LEFT JOIN diary_nutrition dn ON de.id = dn.diary_entry_id
      WHERE de.user_id = $1 AND de.entry_date = $2
      GROUP BY de.id`,
      [userId, format(date, 'yyyy-MM-dd')]
    );

    return result.rows[0] || null;
  }

  async getEntries(userId: string, startDate: Date, endDate: Date) {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT * FROM diary_daily_summary
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date DESC`,
      [userId, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')]
    );

    return result.rows;
  }

  async searchEntries(userId: string, query: string, limit: number = 10) {
    const pool = await this.getPool();
    // Generate embedding for semantic search
    let embedding: number[] | undefined;
    if (process.env.OPENAI_API_KEY?.startsWith('sk-')) {
      embedding = await this.llm.generateEmbedding(query);
    }

    let searchQuery: string;
    let params: any[];

    if (embedding) {
      // Semantic search with embeddings
      searchQuery = `
        SELECT *, 
          1 - (embedding <=> $2::vector) as similarity
        FROM diary_entries
        WHERE user_id = $1
          AND (raw_text ILIKE $3 OR day_summary ILIKE $3)
        ORDER BY similarity DESC, entry_date DESC
        LIMIT $4
      `;
      params = [userId, `[${embedding.join(',')}]`, `%${query}%`, limit];
    } else {
      // Text search fallback
      searchQuery = `
        SELECT *
        FROM diary_entries
        WHERE user_id = $1
          AND (raw_text ILIKE $2 OR day_summary ILIKE $2)
        ORDER BY entry_date DESC
        LIMIT $3
      `;
      params = [userId, `%${query}%`, limit];
    }

    const result = await pool.query(searchQuery, params);
    return result.rows;
  }

  async getProductUsage(userId: string, productName?: string) {
    const pool = await this.getPool();
    let query: string;
    let params: any[];

    if (productName) {
      query = `
        SELECT dp.*, de.entry_date
        FROM diary_products dp
        JOIN diary_entries de ON dp.diary_entry_id = de.id
        WHERE de.user_id = $1 AND dp.product_name ILIKE $2
        ORDER BY de.entry_date DESC
      `;
      params = [userId, `%${productName}%`];
    } else {
      query = `
        SELECT 
          product_name,
          product_category,
          COUNT(*) as usage_count,
          AVG(rating) as avg_rating,
          SUM(usage_duration) as total_minutes,
          MAX(de.entry_date) as last_used
        FROM diary_products dp
        JOIN diary_entries de ON dp.diary_entry_id = de.id
        WHERE de.user_id = $1
        GROUP BY product_name, product_category
        ORDER BY usage_count DESC
      `;
      params = [userId];
    }

    const result = await pool.query(query, params);
    return result.rows;
  }

  async getActivityStats(userId: string, startDate?: Date, endDate?: Date) {
    const pool = await this.getPool();
    const dateFilter = startDate && endDate 
      ? `AND de.entry_date BETWEEN $2 AND $3`
      : '';
    
    const params = [userId];
    if (startDate && endDate) {
      params.push(format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'));
    }

    const query = `
      SELECT 
        activity_type,
        activity_name,
        COUNT(*) as session_count,
        SUM(duration_minutes) as total_minutes,
        AVG(duration_minutes) as avg_minutes,
        SUM(calories_burned) as total_calories,
        AVG(calories_burned) as avg_calories
      FROM diary_activities da
      JOIN diary_entries de ON da.diary_entry_id = de.id
      WHERE de.user_id = $1 ${dateFilter}
      GROUP BY activity_type, activity_name
      ORDER BY total_minutes DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }

  async getHealthTrends(userId: string, metricType: string, days: number = 30) {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT 
        de.entry_date,
        dh.value_primary,
        dh.value_secondary,
        dh.unit
      FROM diary_health dh
      JOIN diary_entries de ON dh.diary_entry_id = de.id
      WHERE de.user_id = $1 
        AND dh.metric_type = $2
        AND de.entry_date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY de.entry_date`,
      [userId, metricType]
    );

    return result.rows;
  }

  async generateWeeklySummary(userId: string, date: Date = new Date()) {
    const weekStart = startOfWeek(date);
    const weekEnd = endOfWeek(date);
    
    const entries = await this.getEntries(userId, weekStart, weekEnd);
    
    if (entries.length === 0) {
      return { message: 'No entries for this week' };
    }

    // Calculate aggregates
    const totalActivities = entries.reduce((sum, e) => sum + (e.activities_count || 0), 0);
    const totalCalories = entries.reduce((sum, e) => sum + (e.total_calories_burned || 0), 0);
    const totalMinutes = entries.reduce((sum, e) => sum + (e.total_activity_minutes || 0), 0);
    const avgMood = entries.reduce((sum, e) => sum + (e.mood_rating || 0), 0) / entries.length;
    const avgEnergy = entries.reduce((sum, e) => sum + (e.energy_level || 0), 0) / entries.length;

    return {
      weekOf: format(weekStart, 'yyyy-MM-dd'),
      daysLogged: entries.length,
      totalActivities,
      totalCalories,
      totalMinutes,
      avgMood: avgMood.toFixed(1),
      avgEnergy: avgEnergy.toFixed(1),
      entries: entries.map(e => ({
        date: e.entry_date,
        summary: e.day_summary,
        mood: e.mood_rating,
        energy: e.energy_level,
        activities: e.activities_count,
        calories: e.total_calories_burned
      }))
    };
  }

  async analyzeTrends(userId: string, days: number = 30) {
    // Get entries for the period
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const entries = await this.getEntries(userId, startDate, endDate);
    
    if (entries.length === 0) {
      return { message: 'No entries found for analysis' };
    }

    // Activity trends
    const activityStats = await this.getActivityStats(userId, startDate, endDate);
    
    // Product usage
    const productUsage = await this.getProductUsage(userId);
    
    // Health metrics trends
    const healthTypes = ['weight', 'heart_rate', 'blood_pressure'];
    const healthTrends: any = {};
    
    for (const type of healthTypes) {
      const trend = await this.getHealthTrends(userId, type, days);
      if (trend.length > 0) {
        healthTrends[type] = trend;
      }
    }

    // Calculate insights
    const insights: string[] = [];
    
    // Activity insights
    if (activityStats.length > 0) {
      const mostFrequent = activityStats[0];
      insights.push(`Most frequent activity: ${mostFrequent.activity_name} (${mostFrequent.session_count} sessions)`);
      
      const totalCalories = activityStats.reduce((sum, a) => sum + (a.total_calories || 0), 0);
      insights.push(`Total calories burned: ${totalCalories}`);
    }
    
    // Product insights
    if (productUsage.length > 0) {
      const topRated = productUsage
        .filter(p => p.avg_rating)
        .sort((a, b) => b.avg_rating - a.avg_rating)[0];
      
      if (topRated) {
        insights.push(`Highest rated product: ${topRated.product_name} (${topRated.avg_rating.toFixed(1)}/10)`);
      }
    }
    
    // Mood/Energy insights
    const avgMood = entries.reduce((sum, e) => sum + (e.mood_rating || 0), 0) / entries.length;
    const avgEnergy = entries.reduce((sum, e) => sum + (e.energy_level || 0), 0) / entries.length;
    
    insights.push(`Average mood: ${avgMood.toFixed(1)}/10`);
    insights.push(`Average energy: ${avgEnergy.toFixed(1)}/10`);

    return {
      period: `${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`,
      daysAnalyzed: entries.length,
      insights,
      activityStats: activityStats.slice(0, 5),
      topProducts: productUsage.slice(0, 5),
      healthTrends,
      moodTrend: entries.map(e => ({
        date: e.entry_date,
        mood: e.mood_rating,
        energy: e.energy_level
      }))
    };
  }
}