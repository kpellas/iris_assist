-- Create diary entries table for structured daily logs
CREATE TABLE IF NOT EXISTS diary_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    raw_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    embedding vector(1536),
    
    -- Extracted structured data
    wake_time TIME,
    sleep_time TIME,
    mood_rating INTEGER CHECK (mood_rating >= 1 AND mood_rating <= 10),
    energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10),
    
    -- Summary fields
    day_summary TEXT,
    key_events TEXT[],
    
    -- Make sure one entry per day per user
    UNIQUE(user_id, entry_date)
);

-- Create table for extracted metrics from diary entries
CREATE TABLE IF NOT EXISTS diary_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diary_entry_id UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL, -- health, fitness, nutrition, product, sleep, work, etc
    metric_type VARCHAR(100) NOT NULL, -- weight, calories, duration, rating, etc
    metric_value DECIMAL,
    metric_unit VARCHAR(50), -- kg, lbs, minutes, calories, etc
    metric_text TEXT, -- for non-numeric values
    timestamp TIME,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for products mentioned in diary
CREATE TABLE IF NOT EXISTS diary_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diary_entry_id UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    product_category VARCHAR(100), -- beauty, health, tech, food, etc
    usage_duration INTEGER, -- in minutes
    rating INTEGER CHECK (rating >= 1 AND rating <= 10),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for activities/exercises
CREATE TABLE IF NOT EXISTS diary_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diary_entry_id UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    activity_type VARCHAR(100) NOT NULL, -- exercise, work, hobby, etc
    activity_name VARCHAR(255) NOT NULL,
    duration_minutes INTEGER,
    intensity VARCHAR(50), -- easy, moderate, hard
    calories_burned INTEGER,
    distance DECIMAL,
    distance_unit VARCHAR(20), -- km, miles, etc
    sets INTEGER,
    reps INTEGER,
    notes TEXT,
    timestamp TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for health/wellness tracking
CREATE TABLE IF NOT EXISTS diary_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diary_entry_id UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    metric_type VARCHAR(100) NOT NULL, -- weight, blood_pressure, heart_rate, etc
    value_primary DECIMAL,
    value_secondary DECIMAL, -- for things like blood pressure (120/80)
    unit VARCHAR(50),
    source VARCHAR(100), -- whoop, apple_watch, fitbit, manual, etc
    timestamp TIME,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for habits and goals tracking
CREATE TABLE IF NOT EXISTS diary_habits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diary_entry_id UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    habit_name VARCHAR(255) NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    streak_days INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for nutrition/food entries
CREATE TABLE IF NOT EXISTS diary_nutrition (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diary_entry_id UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    meal_type VARCHAR(50), -- breakfast, lunch, dinner, snack
    food_items TEXT[],
    calories INTEGER,
    protein_g DECIMAL,
    carbs_g DECIMAL,
    fat_g DECIMAL,
    notes TEXT,
    timestamp TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_diary_entries_user_date ON diary_entries(user_id, entry_date DESC);
CREATE INDEX idx_diary_entries_created ON diary_entries(created_at DESC);
CREATE INDEX idx_diary_metrics_category ON diary_metrics(category, metric_type);
CREATE INDEX idx_diary_metrics_entry ON diary_metrics(diary_entry_id);
CREATE INDEX idx_diary_products_entry ON diary_products(diary_entry_id);
CREATE INDEX idx_diary_activities_entry ON diary_activities(diary_entry_id);
CREATE INDEX idx_diary_activities_type ON diary_activities(activity_type);
CREATE INDEX idx_diary_health_entry ON diary_health(diary_entry_id);
CREATE INDEX idx_diary_health_type ON diary_health(metric_type);
CREATE INDEX idx_diary_habits_entry ON diary_habits(diary_entry_id);
CREATE INDEX idx_diary_nutrition_entry ON diary_nutrition(diary_entry_id);

-- Create view for daily summary
CREATE OR REPLACE VIEW diary_daily_summary AS
SELECT 
    de.id,
    de.user_id,
    de.entry_date,
    de.wake_time,
    de.sleep_time,
    de.mood_rating,
    de.energy_level,
    de.day_summary,
    COUNT(DISTINCT dm.id) as metrics_count,
    COUNT(DISTINCT dp.id) as products_used,
    COUNT(DISTINCT da.id) as activities_count,
    COUNT(DISTINCT dh.id) as health_metrics_count,
    COUNT(DISTINCT dn.id) as meals_logged,
    SUM(da.calories_burned) as total_calories_burned,
    SUM(da.duration_minutes) as total_activity_minutes
FROM diary_entries de
LEFT JOIN diary_metrics dm ON de.id = dm.diary_entry_id
LEFT JOIN diary_products dp ON de.id = dp.diary_entry_id
LEFT JOIN diary_activities da ON de.id = da.diary_entry_id
LEFT JOIN diary_health dh ON de.id = dh.diary_entry_id
LEFT JOIN diary_nutrition dn ON de.id = dn.diary_entry_id
GROUP BY de.id;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_diary_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER diary_entries_updated_at
    BEFORE UPDATE ON diary_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_diary_updated_at();