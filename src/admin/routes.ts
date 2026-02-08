// Admin API routes for Timpi Drip
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CONFIG } from '../config.js';
import { 
  getDb, 
  getStakingConfig, 
  updateStakingConfig, 
  getActiveValidators,
  addValidator,
  removeValidator,
  logAudit,
  getTodayStats,
  getConfigValue,
  setConfigValue,
} from '../db/index.js';
import { getFaucetStatus } from '../drip/index.js';
import { loadKeystore, getBalance, getDelegations } from 'clawpurse';

// Simple session store (in production, use Redis or similar)
const sessions = new Map<string, { createdAt: number; ip: string }>();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function generateSessionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  return request.ip;
}

// Middleware: Check IP allowlist
function checkIpAllowlist(request: FastifyRequest, reply: FastifyReply): boolean {
  const ip = getClientIp(request);
  const allowed = CONFIG.adminIpAllowlist.some(allowedIp => {
    if (allowedIp === ip) return true;
    if (allowedIp === '127.0.0.1' && (ip === '127.0.0.1' || ip === '::1')) return true;
    return false;
  });
  
  if (!allowed) {
    logAudit('admin_ip_blocked', undefined, ip);
    reply.code(403).send({ error: 'Access denied' });
    return false;
  }
  return true;
}

// Middleware: Check session
function checkSession(request: FastifyRequest, reply: FastifyReply): boolean {
  const sessionId = (request.headers['x-admin-session'] as string) || 
                    (request.cookies as any)?.admin_session;
  
  if (!sessionId || !sessions.has(sessionId)) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
  
  const session = sessions.get(sessionId)!;
  if (Date.now() - session.createdAt > SESSION_DURATION) {
    sessions.delete(sessionId);
    reply.code(401).send({ error: 'Session expired' });
    return false;
  }
  
  return true;
}

export async function registerAdminRoutes(app: FastifyInstance) {
  // Auth: Login
  app.post<{ Body: { password: string } }>('/admin/login', async (request, reply) => {
    const ip = getClientIp(request);
    
    if (!checkIpAllowlist(request, reply)) return;
    
    const { password } = request.body;
    
    if (password !== CONFIG.adminPassword) {
      logAudit('admin_login_failed', undefined, ip);
      return reply.code(401).send({ error: 'Invalid password' });
    }
    
    const sessionId = generateSessionId();
    sessions.set(sessionId, { createdAt: Date.now(), ip });
    
    logAudit('admin_login_success', undefined, ip);
    
    reply.setCookie('admin_session', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: SESSION_DURATION / 1000,
    });
    
    return { success: true, sessionId };
  });
  
  // Auth: Logout
  app.post('/admin/logout', async (request, reply) => {
    const sessionId = (request.headers['x-admin-session'] as string) || 
                      (request.cookies as any)?.admin_session;
    
    if (sessionId) {
      sessions.delete(sessionId);
      logAudit('admin_logout', undefined, getClientIp(request));
    }
    
    reply.clearCookie('admin_session');
    return { success: true };
  });
  
  // Dashboard data
  app.get('/admin/dashboard', async (request, reply) => {
    if (!checkIpAllowlist(request, reply)) return;
    if (!checkSession(request, reply)) return;
    
    const status = await getFaucetStatus();
    const stats = getTodayStats();
    const stakingConfig = getStakingConfig();
    
    // Get wallet details
    let walletInfo = { address: '', liquid: 0, staked: 0, delegations: [] as any[] };
    try {
      const { address } = await loadKeystore(CONFIG.walletPassword, CONFIG.keystorePath);
      const balance = await getBalance(address);
      const delegationsResult = await getDelegations(address);
      
      walletInfo = {
        address,
        liquid: parseFloat(balance.primary.displayAmount),
        staked: parseFloat(delegationsResult.totalStakedDisplay),
        delegations: delegationsResult.delegations,
      };
    } catch (err) {
      console.error('Failed to load wallet info:', err);
    }
    
    // Get recent audit logs
    const auditLogs = getDb().prepare(`
      SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50
    `).all();
    
    // Get drip stats for last 7 days
    const weekStats = getDb().prepare(`
      SELECT date, total_drips, agent_drips, human_drips, total_amount
      FROM stats
      WHERE date >= date('now', '-7 days')
      ORDER BY date DESC
    `).all();
    
    // Check if faucet is enabled
    const faucetEnabled = getConfigValue('faucet_enabled') !== 'false';
    
    return {
      status,
      stats,
      weekStats,
      wallet: walletInfo,
      staking: stakingConfig,
      validators: getActiveValidators(),
      auditLogs,
      faucetEnabled,
      config: {
        dripAmountNew: CONFIG.dripAmountNew,
        dripAmountTrusted: CONFIG.dripAmountTrusted,
        cooldownNew: CONFIG.cooldownNew,
        cooldownTrusted: CONFIG.cooldownTrusted,
        maxDripsPerIp: CONFIG.maxDripsPerIp,
        powDifficulty: CONFIG.powDifficulty,
      },
    };
  });
  
  // Kill switch
  app.post<{ Body: { enabled: boolean } }>('/admin/faucet/toggle', async (request, reply) => {
    if (!checkIpAllowlist(request, reply)) return;
    if (!checkSession(request, reply)) return;
    
    const { enabled } = request.body;
    setConfigValue('faucet_enabled', enabled ? 'true' : 'false');
    
    logAudit('faucet_toggle', 'admin', getClientIp(request), { enabled });
    
    return { success: true, enabled };
  });
  
  // Update staking config
  app.post<{ Body: { 
    autoRestakeEnabled?: boolean;
    autoRestakeThreshold?: string;
    liquidBufferTarget?: string;
  } }>('/admin/staking/config', async (request, reply) => {
    if (!checkIpAllowlist(request, reply)) return;
    if (!checkSession(request, reply)) return;
    
    const { autoRestakeEnabled, autoRestakeThreshold, liquidBufferTarget } = request.body;
    
    updateStakingConfig({
      auto_restake_enabled: autoRestakeEnabled,
      auto_restake_threshold: autoRestakeThreshold,
      liquid_buffer_target: liquidBufferTarget,
    });
    
    logAudit('staking_config_updated', 'admin', getClientIp(request), request.body);
    
    return { success: true, config: getStakingConfig() };
  });
  
  // Add validator
  app.post<{ Body: { operatorAddress: string; moniker: string; weight?: number } }>(
    '/admin/validators/add', 
    async (request, reply) => {
      if (!checkIpAllowlist(request, reply)) return;
      if (!checkSession(request, reply)) return;
      
      const { operatorAddress, moniker, weight } = request.body;
      
      if (!operatorAddress.startsWith('neutarovaloper')) {
        return reply.code(400).send({ error: 'Invalid validator address' });
      }
      
      addValidator(operatorAddress, moniker, weight || 100);
      logAudit('validator_added', 'admin', getClientIp(request), { operatorAddress, moniker });
      
      return { success: true, validators: getActiveValidators() };
    }
  );
  
  // Remove validator
  app.post<{ Body: { operatorAddress: string } }>(
    '/admin/validators/remove',
    async (request, reply) => {
      if (!checkIpAllowlist(request, reply)) return;
      if (!checkSession(request, reply)) return;
      
      const { operatorAddress } = request.body;
      
      removeValidator(operatorAddress);
      logAudit('validator_removed', 'admin', getClientIp(request), { operatorAddress });
      
      return { success: true, validators: getActiveValidators() };
    }
  );
  
  // Get audit logs
  app.get<{ Querystring: { limit?: number; offset?: number } }>(
    '/admin/logs',
    async (request, reply) => {
      if (!checkIpAllowlist(request, reply)) return;
      if (!checkSession(request, reply)) return;
      
      const limit = request.query.limit || 100;
      const offset = request.query.offset || 0;
      
      const logs = getDb().prepare(`
        SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).all(limit, offset);
      
      const total = (getDb().prepare('SELECT COUNT(*) as count FROM audit_log').get() as any).count;
      
      return { logs, total, limit, offset };
    }
  );
  
  // Update drip config (runtime override)
  app.post<{ Body: {
    dripAmountNew?: number;
    dripAmountTrusted?: number;
    cooldownNew?: number;
    cooldownTrusted?: number;
    powDifficulty?: number;
  } }>('/admin/config/drip', async (request, reply) => {
    if (!checkIpAllowlist(request, reply)) return;
    if (!checkSession(request, reply)) return;
    
    const updates = request.body;
    
    // Store in database for runtime override
    if (updates.dripAmountNew !== undefined) {
      setConfigValue('drip_amount_new', updates.dripAmountNew.toString());
    }
    if (updates.dripAmountTrusted !== undefined) {
      setConfigValue('drip_amount_trusted', updates.dripAmountTrusted.toString());
    }
    if (updates.cooldownNew !== undefined) {
      setConfigValue('cooldown_new', updates.cooldownNew.toString());
    }
    if (updates.cooldownTrusted !== undefined) {
      setConfigValue('cooldown_trusted', updates.cooldownTrusted.toString());
    }
    if (updates.powDifficulty !== undefined) {
      setConfigValue('pow_difficulty', updates.powDifficulty.toString());
    }
    
    logAudit('drip_config_updated', 'admin', getClientIp(request), updates);
    
    return { success: true };
  });
}
