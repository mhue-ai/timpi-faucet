// Timpi Drip - Community faucet for NTMPI tokens
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import { CONFIG, validateConfig } from './config.js';
import { initDatabase } from './db/index.js';
import { registerRoutes } from './api/routes.js';
import { registerAdminRoutes } from './admin/routes.js';
import { mkdirSync, existsSync } from 'fs';
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

// Create Fastify instance
const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
  trustProxy: true,
});

// Register CORS
await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST'],
  credentials: true,
});

// Register cookies
await app.register(fastifyCookie, {
  secret: CONFIG.adminPassword, // Used for signing
});

// Serve static files
await app.register(fastifyStatic, {
  root: join(__dirname, '..', 'public'),
  prefix: '/',
});

// Register API routes
await registerRoutes(app);

// Register Admin routes
await registerAdminRoutes(app);

// Start server
const start = async () => {
  try {
    await app.listen({ port: CONFIG.port, host: CONFIG.host });
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      TIMPI DRIP                              ║
║                  Community Faucet by Mhue.ai                 ║
╠══════════════════════════════════════════════════════════════╣
║ Status: 🟢 RUNNING                                           ║
║ Port: ${CONFIG.port.toString().padEnd(55)}║
║ Admin Port: ${CONFIG.adminPort.toString().padEnd(49)}║
║ Database: ${CONFIG.dbPath.padEnd(51)}║
╠══════════════════════════════════════════════════════════════╣
║ Drip (new): ${CONFIG.dripAmountNew} NTMPI / ${CONFIG.cooldownNew}h cooldown                      ║
║ Drip (trusted): ${CONFIG.dripAmountTrusted} NTMPI / ${CONFIG.cooldownTrusted}h cooldown                   ║
║ PoW difficulty: ${CONFIG.powDifficulty} leading zeros                              ║
╚══════════════════════════════════════════════════════════════╝
`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await app.close();
  process.exit(0);
});
