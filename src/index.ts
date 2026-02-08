// Timpi Drip - Community faucet for NTMPI tokens
import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import { CONFIG, validateConfig } from './config.js';
import { initDatabase } from './db/index.js';
import { registerRoutes } from './api/routes.js';
import { registerAdminRoutes } from './admin/routes.js';
import { registerSecurityMiddleware } from './middleware/security.js';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists
const dataDir = dirname(CONFIG.dbPath);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// Validate configuration
validateConfig();

// Initialize database
console.log('Initializing database...');
initDatabase();

const loggerOptions = {
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  },
};

async function registerPlugins(server: FastifyInstance) {
  await server.register(cors, {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true,
  });

  await server.register(fastifyCookie, {
    secret: CONFIG.adminPassword,
  });

  await server.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/',
  });

  await registerSecurityMiddleware(server);
  await registerRoutes(server);
  await registerAdminRoutes(server);
}

async function buildServer(options: FastifyServerOptions = {}) {
  const server = Fastify({
    logger: loggerOptions,
    trustProxy: true,
    ...options,
  });

  await registerPlugins(server);
  return server;
}

let httpsServer: FastifyInstance;

try {
  const tlsOptions = {
    https: {
      allowHTTP1: true,
      key: readFileSync(CONFIG.sslKeyPath, 'utf8'),
      cert: readFileSync(CONFIG.sslCertPath, 'utf8'),
    },
  } as unknown as FastifyServerOptions;

  httpsServer = await buildServer(tlsOptions);
} catch (error) {
  console.error('Failed to load TLS certificate or key:', error);
  process.exit(1);
}

const printBanner = (port: number, protocolLabel: string) => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      TIMPI DRIP                              ║
║                  Community Faucet by Mhue.ai                 ║
╠══════════════════════════════════════════════════════════════╣
║ Status: 🟢 RUNNING (${protocolLabel})                               ║
║ Port: ${port.toString().padEnd(55)}║
║ Admin Port: ${CONFIG.adminPort.toString().padEnd(49)}║
║ Database: ${CONFIG.dbPath.padEnd(51)}║
╠══════════════════════════════════════════════════════════════╣
║ Drip (new): ${CONFIG.dripAmountNew} NTMPI / ${CONFIG.cooldownNew}h cooldown                      ║
║ Drip (trusted): ${CONFIG.dripAmountTrusted} NTMPI / ${CONFIG.cooldownTrusted}h cooldown                   ║
║ PoW difficulty: ${CONFIG.powDifficulty} leading zeros                              ║
╚══════════════════════════════════════════════════════════════╝
`);
};

const start = async () => {
  try {
    await httpsServer.listen({ port: CONFIG.port, host: CONFIG.host });
    printBanner(CONFIG.port, 'HTTPS');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();

const shutdown = async () => {
  console.log('\nShutting down...');
  await httpsServer.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
