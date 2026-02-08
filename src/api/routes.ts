// API routes for Timpi Drip
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CONFIG } from '../config.js';
import { processDrip, getFaucetStatus, canDrip, determineTrustTier, getDripAmount, getCooldownHours } from '../drip/index.js';
import { generateChallenge, getClientSolverCode } from '../pow/index.js';
import { getRecentDrips, getTodayStats } from '../db/index.js';

interface DripBody {
  address: string;
  pow?: {
    nonce: string;
    timestamp: number;
  };
  attestation?: string;
  isAgent?: boolean;
}

interface CheckParams {
  address: string;
}

function getClientIp(request: FastifyRequest): string {
  // Handle proxies
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  return request.ip;
}

export async function registerRoutes(app: FastifyInstance) {
  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
  
  // Faucet status
  app.get('/api/status', async (request, reply) => {
    const status = await getFaucetStatus();
    const stats = getTodayStats();
    
    return {
      ...status,
      stats: {
        dripsToday: stats.total_drips,
        agentDrips: stats.agent_drips,
        humanDrips: stats.human_drips,
        agentRatio: stats.total_drips > 0 ? stats.agent_drips / stats.total_drips : 0,
      },
    };
  });
  
  // Check if address can drip
  app.get<{ Params: CheckParams }>('/api/check/:address', async (request, reply) => {
    const { address } = request.params;
    
    if (!address.startsWith('neutaro1')) {
      return reply.code(400).send({ error: 'Invalid address format' });
    }
    
    const { tier } = await determineTrustTier(address);
    const { allowed, nextDripAt } = canDrip(address, tier);
    const dripAmount = getDripAmount(tier);
    const cooldownHours = getCooldownHours(tier);
    
    return {
      address,
      canDrip: allowed,
      tier,
      dripAmount,
      cooldownHours,
      nextDripAt: nextDripAt?.toISOString(),
    };
  });
  
  // Get PoW challenge
  app.get<{ Params: CheckParams }>('/api/challenge/:address', async (request, reply) => {
    const { address } = request.params;
    
    if (!address.startsWith('neutaro1')) {
      return reply.code(400).send({ error: 'Invalid address format' });
    }
    
    const challenge = generateChallenge(address);
    
    return {
      challenge,
      solverCode: getClientSolverCode(),
    };
  });
  
  // Request drip
  app.post<{ Body: DripBody }>('/api/drip', async (request, reply) => {
    const { address, pow, attestation, isAgent } = request.body;
    
    if (!address) {
      return reply.code(400).send({ success: false, error: 'Address required' });
    }
    
    const ip = getClientIp(request);
    const userAgent = request.headers['user-agent'];
    
    // Determine attestation type
    let attestationType: 'openclaw' | 'social' | undefined;
    if (attestation && CONFIG.openclawEnabled) {
      // TODO: Verify OpenClaw attestation signature
      attestationType = 'openclaw';
    }
    
    const result = await processDrip({
      address,
      pow,
      attestation,
      attestationType,
      isAgent,
      ip,
      userAgent,
    });
    
    if (!result.success) {
      const statusCode = result.errorCode === 'COOLDOWN' ? 429 : 
                         result.errorCode === 'IP_RATE_LIMITED' ? 429 :
                         result.errorCode === 'POW_INVALID' ? 400 :
                         result.errorCode === 'INVALID_ADDRESS' ? 400 : 500;
      return reply.code(statusCode).send(result);
    }
    
    return result;
  });
  
  // Get recent drips (for live feed)
  app.get('/api/drips/recent', async (request, reply) => {
    const drips = getRecentDrips(20);
    
    return drips.map(d => ({
      address: d.address.slice(0, 12) + '...' + d.address.slice(-4),
      amount: d.amount,
      isAgent: d.is_agent,
      tier: d.tier,
      txHash: d.tx_hash,
      timestamp: d.created_at,
    }));
  });
  
  // Text mode (for AI agents)
  app.get('/', async (request, reply) => {
    const accept = request.headers.accept || '';
    const format = (request.query as any).format;
    
    if (accept.includes('text/plain') || format === 'text') {
      const status = await getFaucetStatus();
      const stats = getTodayStats();
      
      reply.type('text/plain');
      return `TIMPI DRIP - Community Faucet
============================

Pool Balance: ${status.pool.liquid.toFixed(2)} NTMPI (liquid)
Drip Amount:  ${status.config.dripNew} NTMPI (new) / ${status.config.dripTrusted} NTMPI (trusted)
Cooldown:     ${status.config.cooldownNew}h (new) / ${status.config.cooldownTrusted}h (trusted)

Today: ${stats.total_drips} drips (${stats.agent_drips} agents, ${stats.human_drips} humans)

To request tokens:

  curl -X POST ${request.protocol}://${request.hostname}/api/drip \\
    -H "Content-Type: application/json" \\
    -d '{"address":"neutaro1...","pow":{"nonce":"<solved>","timestamp":<ts>}}'

With OpenClaw attestation:

  curl -X POST ${request.protocol}://${request.hostname}/api/drip \\
    -H "Content-Type: application/json" \\
    -d '{"address":"neutaro1...","attestation":"<sig>","isAgent":true}'

Check eligibility:
  GET /api/check/<address>

Get PoW challenge:
  GET /api/challenge/<address>

Status:
  GET /api/status

Docs: ${request.protocol}://${request.hostname}/docs
`;
    }
    
    // Return HTML for browsers (will be replaced with full UI)
    reply.type('text/html');
    return `<!DOCTYPE html>
<html>
<head>
  <title>Timpi Drip</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <h1>🚰 Timpi Drip</h1>
  <p>Community faucet by Mhue.ai</p>
  <p>Full UI coming soon. Use <code>?format=text</code> for API info.</p>
</body>
</html>`;
  });
}
