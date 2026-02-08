-- Timpi Drip Database Schema

-- Drip history
CREATE TABLE IF NOT EXISTS drips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  amount TEXT NOT NULL,
  tx_hash TEXT,
  tier TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_agent BOOLEAN DEFAULT FALSE,
  attestation_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drips_address ON drips(address);
CREATE INDEX IF NOT EXISTS idx_drips_ip ON drips(ip_address);
CREATE INDEX IF NOT EXISTS idx_drips_created ON drips(created_at);

-- Rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  key_type TEXT NOT NULL,  -- 'ip' or 'address'
  count INTEGER DEFAULT 1,
  first_request DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_request DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);

-- Trust cache (avoid re-querying chain for known addresses)
CREATE TABLE IF NOT EXISTS trust_cache (
  address TEXT PRIMARY KEY,
  is_trusted BOOLEAN DEFAULT FALSE,
  trust_reason TEXT,
  first_seen DATETIME,
  tx_count INTEGER DEFAULT 0,
  social_verified BOOLEAN DEFAULT FALSE,
  social_provider TEXT,
  last_checked DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  actor TEXT,
  ip_address TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Configuration (admin-adjustable settings)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Staking configuration
CREATE TABLE IF NOT EXISTS staking_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  auto_restake_enabled BOOLEAN DEFAULT FALSE,
  auto_restake_threshold TEXT DEFAULT '7500',
  liquid_buffer_target TEXT DEFAULT '5000',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Validator configuration
CREATE TABLE IF NOT EXISTS validators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_address TEXT NOT NULL UNIQUE,
  moniker TEXT,
  weight INTEGER DEFAULT 100,
  active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Stats (aggregated for performance)
CREATE TABLE IF NOT EXISTS stats (
  date TEXT PRIMARY KEY,
  total_drips INTEGER DEFAULT 0,
  total_amount TEXT DEFAULT '0',
  unique_addresses INTEGER DEFAULT 0,
  agent_drips INTEGER DEFAULT 0,
  human_drips INTEGER DEFAULT 0
);

-- Initialize default staking config
INSERT OR IGNORE INTO staking_config (id, auto_restake_enabled, auto_restake_threshold, liquid_buffer_target)
VALUES (1, FALSE, '7500', '5000');
