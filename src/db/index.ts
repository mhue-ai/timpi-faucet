// Database module for Timpi Drip
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CONFIG } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database;

export function initDatabase(): Database.Database {
  db = new Database(CONFIG.dbPath);
  db.pragma('journal_mode = WAL');
  
  // Run schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  
  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Drip operations
export interface DripRecord {
  id?: number;
  address: string;
  amount: string;
  tx_hash?: string;
  tier: 'new' | 'trusted';
  ip_address?: string;
  user_agent?: string;
  is_agent: boolean;
  attestation_type?: string;
  created_at?: string;
}

export function recordDrip(drip: DripRecord): number {
  const stmt = getDb().prepare(`
    INSERT INTO drips (address, amount, tx_hash, tier, ip_address, user_agent, is_agent, attestation_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    drip.address,
    drip.amount,
    drip.tx_hash,
    drip.tier,
    drip.ip_address,
    drip.user_agent,
    drip.is_agent ? 1 : 0,
    drip.attestation_type
  );
  return result.lastInsertRowid as number;
}

export function getLastDripForAddress(address: string): DripRecord | undefined {
  const stmt = getDb().prepare(`
    SELECT * FROM drips WHERE address = ? ORDER BY created_at DESC LIMIT 1
  `);
  return stmt.get(address) as DripRecord | undefined;
}

export function getDripsForIp(ip: string, sinceMs: number): number {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const stmt = getDb().prepare(`
    SELECT COUNT(*) as count FROM drips WHERE ip_address = ? AND created_at > ?
  `);
  const result = stmt.get(ip, since) as { count: number };
  return result.count;
}

export function getRecentDrips(limit: number = 20): DripRecord[] {
  const stmt = getDb().prepare(`
    SELECT * FROM drips ORDER BY created_at DESC LIMIT ?
  `);
  return stmt.all(limit) as DripRecord[];
}

// Rate limiting
export function checkRateLimit(key: string, keyType: 'ip' | 'address', maxCount: number, windowMs: number): {
  allowed: boolean;
  count: number;
  resetAt: Date;
} {
  const now = Date.now();
  const windowStart = new Date(now - windowMs).toISOString();
  
  const stmt = getDb().prepare(`
    SELECT * FROM rate_limits WHERE key = ? AND key_type = ?
  `);
  const existing = stmt.get(key, keyType) as { count: number; first_request: string } | undefined;
  
  if (!existing) {
    // First request
    const insert = getDb().prepare(`
      INSERT INTO rate_limits (key, key_type, count, first_request, last_request)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    insert.run(key, keyType);
    return { allowed: true, count: 1, resetAt: new Date(now + windowMs) };
  }
  
  const firstRequest = new Date(existing.first_request).getTime();
  
  if (firstRequest < Date.now() - windowMs) {
    // Window expired, reset
    const reset = getDb().prepare(`
      UPDATE rate_limits SET count = 1, first_request = CURRENT_TIMESTAMP, last_request = CURRENT_TIMESTAMP
      WHERE key = ? AND key_type = ?
    `);
    reset.run(key, keyType);
    return { allowed: true, count: 1, resetAt: new Date(now + windowMs) };
  }
  
  if (existing.count >= maxCount) {
    return { 
      allowed: false, 
      count: existing.count, 
      resetAt: new Date(firstRequest + windowMs) 
    };
  }
  
  // Increment
  const increment = getDb().prepare(`
    UPDATE rate_limits SET count = count + 1, last_request = CURRENT_TIMESTAMP
    WHERE key = ? AND key_type = ?
  `);
  increment.run(key, keyType);
  
  return { 
    allowed: true, 
    count: existing.count + 1, 
    resetAt: new Date(firstRequest + windowMs) 
  };
}

// Trust cache
export interface TrustRecord {
  address: string;
  is_trusted: boolean;
  trust_reason?: string;
  first_seen?: string;
  tx_count: number;
  social_verified: boolean;
  social_provider?: string;
  last_checked: string;
}

export function getTrustCache(address: string): TrustRecord | undefined {
  const stmt = getDb().prepare(`SELECT * FROM trust_cache WHERE address = ?`);
  return stmt.get(address) as TrustRecord | undefined;
}

export function setTrustCache(record: TrustRecord): void {
  const stmt = getDb().prepare(`
    INSERT OR REPLACE INTO trust_cache 
    (address, is_trusted, trust_reason, first_seen, tx_count, social_verified, social_provider, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(
    record.address,
    record.is_trusted ? 1 : 0,
    record.trust_reason,
    record.first_seen,
    record.tx_count,
    record.social_verified ? 1 : 0,
    record.social_provider
  );
}

// Audit log
export function logAudit(eventType: string, actor?: string, ip?: string, details?: object): void {
  const stmt = getDb().prepare(`
    INSERT INTO audit_log (event_type, actor, ip_address, details)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(eventType, actor, ip, details ? JSON.stringify(details) : null);
}

// Stats
export function updateDailyStats(isAgent: boolean, amount: string): void {
  const today = new Date().toISOString().split('T')[0];
  
  const stmt = getDb().prepare(`
    INSERT INTO stats (date, total_drips, total_amount, unique_addresses, agent_drips, human_drips)
    VALUES (?, 1, ?, 1, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      total_drips = total_drips + 1,
      total_amount = CAST((CAST(total_amount AS REAL) + CAST(? AS REAL)) AS TEXT),
      agent_drips = agent_drips + ?,
      human_drips = human_drips + ?
  `);
  stmt.run(
    today, 
    amount, 
    isAgent ? 1 : 0, 
    isAgent ? 0 : 1,
    amount,
    isAgent ? 1 : 0,
    isAgent ? 0 : 1
  );
}

export function getTodayStats(): { total_drips: number; agent_drips: number; human_drips: number } {
  const today = new Date().toISOString().split('T')[0];
  const stmt = getDb().prepare(`SELECT * FROM stats WHERE date = ?`);
  const result = stmt.get(today) as any;
  return result || { total_drips: 0, agent_drips: 0, human_drips: 0 };
}

// Config storage
export function getConfigValue(key: string): string | undefined {
  const stmt = getDb().prepare(`SELECT value FROM config WHERE key = ?`);
  const result = stmt.get(key) as { value: string } | undefined;
  return result?.value;
}

export function setConfigValue(key: string, value: string): void {
  const stmt = getDb().prepare(`
    INSERT OR REPLACE INTO config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(key, value);
}

// Staking config
export function getStakingConfig(): {
  auto_restake_enabled: boolean;
  auto_restake_threshold: string;
  liquid_buffer_target: string;
} {
  const stmt = getDb().prepare(`SELECT * FROM staking_config WHERE id = 1`);
  const result = stmt.get() as any;
  return {
    auto_restake_enabled: Boolean(result?.auto_restake_enabled),
    auto_restake_threshold: result?.auto_restake_threshold || '7500',
    liquid_buffer_target: result?.liquid_buffer_target || '5000',
  };
}

export function updateStakingConfig(config: {
  auto_restake_enabled?: boolean;
  auto_restake_threshold?: string;
  liquid_buffer_target?: string;
}): void {
  const current = getStakingConfig();
  const stmt = getDb().prepare(`
    UPDATE staking_config SET
      auto_restake_enabled = ?,
      auto_restake_threshold = ?,
      liquid_buffer_target = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `);
  stmt.run(
    config.auto_restake_enabled ?? current.auto_restake_enabled ? 1 : 0,
    config.auto_restake_threshold ?? current.auto_restake_threshold,
    config.liquid_buffer_target ?? current.liquid_buffer_target
  );
}

// Validators
export function getActiveValidators(): Array<{ operator_address: string; moniker: string; weight: number }> {
  const stmt = getDb().prepare(`SELECT * FROM validators WHERE active = 1`);
  return stmt.all() as any[];
}

export function addValidator(operatorAddress: string, moniker: string, weight: number = 100): void {
  const stmt = getDb().prepare(`
    INSERT OR REPLACE INTO validators (operator_address, moniker, weight, active)
    VALUES (?, ?, ?, 1)
  `);
  stmt.run(operatorAddress, moniker, weight);
}

export function removeValidator(operatorAddress: string): void {
  const stmt = getDb().prepare(`UPDATE validators SET active = 0 WHERE operator_address = ?`);
  stmt.run(operatorAddress);
}
