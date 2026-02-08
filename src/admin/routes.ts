// Admin API routes for Timpi Drip
// Full security logging for all authentication events
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
import { isIpAllowed, secureCompare } from '../utils/ip.js';

// Session management
const sessions = new Map<string, { createdAt: number; ip: string }>();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiting for login attempts
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

// Auth failure reasons (for clear logging)
enum AuthFailure {
  IP_NOT_ALLOWED = 'IP_NOT_ALLOWED',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_PASSWORD = 'INVALID_PASSWORD',
  NO_SESSION = 'NO_SESSION',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_IP_MISMATCH = 'SESSION_IP_MISMATCH',
}

function generateSessionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function getClientIp(request: FastifyRequest): string {
  // Check various headers for real IP (behind proxies)
  const cfConnectingIp = request.headers['cf-connecting-ip'];
  const xRealIp = request.headers['x-real-ip'];
  const forwarded = request.headers['x-forwarded-for'];
  
  if (cfConnectingIp) {
    return Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
  }
  if (xRealIp) {
    return Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
  }
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  return request.ip;
}

function getUserAgent(request: FastifyRequest): string {
  return (request.headers['user-agent'] || 'unknown').slice(0, 200);
}

// Enhanced logging for auth failures
function logAuthFailure(
  reason: AuthFailure,
  ip: string,
  request: FastifyRequest,
  extra?: Record<string, any>
): void {
  const details = {
    reason,
    ip,
    userAgent: getUserAgent(request),
    url: request.url,
    method: request.method,
    allowlist: CONFIG.adminIpAllowlist,
    ...extra,
  };
  
  logAudit(`auth_failure_${reason.toLowerCase()}`, undefined, ip, details);
  
  // Also log to console for immediate visibility
  request.log.warn({
    event: 'AUTH_FAILURE',
    reason,
    ip,
    url: request.url,
    allowlist: CONFIG.adminIpAllowlist.join(', '),
    ...extra,
  }, `Admin auth failed: ${reason}`);
}

// Check IP allowlist with detailed logging
function checkIpAllowlist(request: FastifyRequest, reply: FastifyReply): boolean {
  const ip = getClientIp(request);
  
  if (!isIpAllowed(ip, CONFIG.adminIpAllowlist)) {
    logAuthFailure(AuthFailure.IP_NOT_ALLOWED, ip, request, {
      message: `IP ${ip} not in allowlist [${CONFIG.adminIpAllowlist.join(', ')}]`,
    });
    
    reply.code(403).send({ 
      error: 'Access denied: IP not allowed',
      code: AuthFailure.IP_NOT_ALLOWED,
      yourIp: ip,
      hint: 'Add your IP to ADMIN_IP_ALLOWLIST in .env',
    });
    return false;
  }
  return true;
}

// Check login rate limiting
function checkLoginRateLimit(ip: string, request: FastifyRequest): { allowed: boolean; retryAfter?: number; attemptsUsed?: number } {
  const now = Date.now();
  const attempts = loginAttempts.get(ip);
  
  if (!attempts) {
    return { allowed: true, attemptsUsed: 0 };
  }
  
  // Reset if lockout period passed
  if (now - attempts.firstAttempt > LOGIN_LOCKOUT_MS) {
    loginAttempts.delete(ip);
    return { allowed: true, attemptsUsed: 0 };
  }
  
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    const retryAfter = Math.ceil((attempts.firstAttempt + LOGIN_LOCKOUT_MS - now) / 1000);
    
    logAuthFailure(AuthFailure.RATE_LIMITED, ip, request, {
      attempts: attempts.count,
      retryAfter,
      message: `Too many login attempts (${attempts.count}/${MAX_LOGIN_ATTEMPTS})`,
    });
    
    return { allowed: false, retryAfter, attemptsUsed: attempts.count };
  }
  
  return { allowed: true, attemptsUsed: attempts.count };
}

// Record failed login attempt
function recordLoginAttempt(ip: string): number {
  const now = Date.now();
  const attempts = loginAttempts.get(ip);
  
  if (!attempts || now - attempts.firstAttempt > LOGIN_LOCKOUT_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return 1;
  } else {
    attempts.count++;
    return attempts.count;
  }
}

// Clear login attempts on success
function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// Check session with detailed logging
function checkSession(request: FastifyRequest, reply: FastifyReply): boolean {
  const ip = getClientIp(request);
  const sessionId = (request.headers['x-admin-session'] as string) || 
                    (request.cookies as any)?.admin_session;
  
  if (!sessionId) {
    logAuthFailure(AuthFailure.NO_SESSION, ip, request, {
      message: 'No session token provided',
    });
    reply.code(401).send({ 
      error: 'Unauthorized: No session',
      code: AuthFailure.NO_SESSION,
    });
    return false;
  }
  
  if (!sessions.has(sessionId)) {
    logAuthFailure(AuthFailure.NO_SESSION, ip, request, {
      message: 'Session token not found (may have expired or been invalidated)',
      sessionIdPrefix: sessionId.slice(0, 8) + '...',
    });
    reply.code(401).send({ 
      error: 'Unauthorized: Invalid session',
      code: AuthFailure.NO_SESSION,
    });
    return false;
  }
  
  const session = sessions.get(sessionId)!;
  
  if (Date.now() - session.createdAt > SESSION_DURATION) {
    sessions.delete(sessionId);
    logAuthFailure(AuthFailure.SESSION_EXPIRED, ip, request, {
      message: 'Session expired',
      sessionAge: Math.round((Date.now() - session.createdAt) / 1000 / 60) + ' minutes',
    });
    reply.code(401).send({ 
      error: 'Session expired',
      code: AuthFailure.SESSION_EXPIRED,
    });
    return false;
  }
  
  // Optional: Check if request IP matches session IP
  if (session.ip !== ip) {
    request.log.info({
      event: 'SESSION_IP_CHANGE',
      sessionIp: session.ip,
      currentIp: ip,
    }, 'Session IP changed (allowed but logged)');
    // Not blocking, just logging - IPs can change legitimately
  }
  
  return true;
}

export async function registerAdminRoutes(app: FastifyInstance) {
  // Auth: Login
  app.post<{ Body: { password: string } }>('/admin/login', async (request, reply) => {
    const ip = getClientIp(request);
    
    // Step 1: Check IP allowlist
    if (!checkIpAllowlist(request, reply)) return;
    
    // Step 2: Check rate limit
    const rateLimit = checkLoginRateLimit(ip, request);
    if (!rateLimit.allowed) {
      reply.header('Retry-After', rateLimit.retryAfter!.toString());
      return reply.code(429).send({ 
        error: `Too many login attempts. Try again in ${rateLimit.retryAfter} seconds.`,
        code: AuthFailure.RATE_LIMITED,
        retryAfter: rateLimit.retryAfter,
      });
    }
    
    // Step 3: Validate password
    const { password } = request.body;
    
    if (!secureCompare(password || '', CONFIG.adminPassword)) {
      const attemptCount = recordLoginAttempt(ip);
      const remainingAttempts = MAX_LOGIN_ATTEMPTS - attemptCount;
      
      logAuthFailure(AuthFailure.INVALID_PASSWORD, ip, request, {
        message: 'Invalid password',
        attemptCount,
        remainingAttempts,
      });
      
      return reply.code(401).send({ 
        error: 'Invalid password',
        code: AuthFailure.INVALID_PASSWORD,
        remainingAttempts: remainingAttempts > 0 ? remainingAttempts : 0,
      });
    }
    
    // Success - create session
    clearLoginAttempts(ip);
    
    const sessionId = generateSessionId();
    sessions.set(sessionId, { createdAt: Date.now(), ip });
    
    logAudit('admin_login_success', undefined, ip, {
      userAgent: getUserAgent(request),
    });
    
    request.log.info({
      event: 'ADMIN_LOGIN_SUCCESS',
      ip,
    }, 'Admin login successful');
    
    reply.setCookie('admin_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_DURATION / 1000,
    });
    
    return { success: true, sessionId };
  });
  
  // Auth: Logout
  app.post('/admin/logout', async (request, reply) => {
    const sessionId = (request.headers['x-admin-session'] as string) || 
                      (request.cookies as any)?.admin_session;
    
    if (sessionId && sessions.has(sessionId)) {
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
