-- Add authentication columns to existing users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255);

-- Create index for email if not exists
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Insert default admin user (password: changeme123!)
-- In production, change this immediately
INSERT INTO users (username, email, password_hash, full_name, is_active, is_verified, email_verified_at)
VALUES (
    'admin',
    'admin@integralis.com.au',
    '$2b$12$Xv23Y1cS4N/HmNZzTK/Ff.rv78y0jztxBo6zsdnoy1U7LTeNQJsBm',
    'System Administrator',
    true,
    true,
    NOW()
) ON CONFLICT (username) DO UPDATE SET
    email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    full_name = EXCLUDED.full_name,
    is_active = EXCLUDED.is_active,
    is_verified = EXCLUDED.is_verified,
    email_verified_at = EXCLUDED.email_verified_at;

-- Grant admin role
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM users WHERE username = 'admin'
ON CONFLICT (user_id, role) DO NOTHING;

-- Grant default admin permissions
INSERT INTO user_permissions (user_id, scope)
SELECT id, unnest(ARRAY['admin', 'drive.admin', 'gmail.admin', 'read', 'write', 'drive.read', 'drive.write', 'gmail.read', 'gmail.send'])
FROM users WHERE username = 'admin'
ON CONFLICT (user_id, scope, resource_id) DO NOTHING;