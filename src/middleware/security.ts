// Security middleware for Timpi Drip
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CONFIG } from '../config.js';
import { getConfigValue } from '../db/index.js';

/**
 * Register security headers and middleware
 */
export async function registerSecurityMiddleware(app: FastifyInstance) {
  // Security headers
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Content Security Policy
    reply.header('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://clawpurse.ai", // Inline scripts + shared nav
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '));
    
    return payload;
  });
  
  // Kill switch check for drip endpoints
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only check for drip endpoint
    if (request.url === '/api/drip' && request.method === 'POST') {
      const faucetEnabled = getConfigValue('faucet_enabled');
      if (faucetEnabled === 'false') {
        reply.code(503).send({ 
          success: false, 
          error: 'Faucet temporarily disabled. Please try again later.',
          errorCode: 'FAUCET_DISABLED'
        });
        return;
      }
    }
  });
  
  // Rate limiting logging
  app.addHook('onRequest', async (request) => {
    // Log suspicious patterns (optional, can be enhanced)
    const ua = request.headers['user-agent'] || '';
    if (request.url.startsWith('/api/drip') && 
        (ua.includes('curl') || ua.includes('wget') || ua.includes('python'))) {
      // These are likely scripts/bots - not blocking, just logging
      app.log.info({ 
        url: request.url, 
        ip: request.ip, 
        ua: ua.slice(0, 100) 
      }, 'API request from script');
    }
  });
}
