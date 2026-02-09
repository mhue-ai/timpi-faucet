// Timpi Drip Configuration
import 'dotenv/config';

export const CONFIG = {
  // Server
  port: parseInt(process.env.PORT || '443'),
  adminPort: parseInt(process.env.ADMIN_PORT || '3001'),
  host: process.env.HOST || '0.0.0.0',

  // TLS (required for web traffic)
  sslCertPath: process.env.SSL_CERT_PATH || '/app/certs/self.crt',
  sslKeyPath: process.env.SSL_KEY_PATH || '/app/certs/self.key',
  sslCertCn: process.env.SSL_CERT_CN || 'drip.clawpurse.ai',
  generateSelfSignedSsl: process.env.GENERATE_SELF_SIGNED_SSL !== 'false',
  
  // Wallet
  walletPassword: process.env.FAUCET_WALLET_PASSWORD || '',
  keystorePath: process.env.KEYSTORE_PATH || undefined,
  
  // Drip amounts (in NTMPI display units)
  dripAmountNew: parseFloat(process.env.DRIP_AMOUNT_NEW || '0.5'),
  dripAmountTrusted: parseFloat(process.env.DRIP_AMOUNT_TRUSTED || '1.0'),
  
  // Cooldowns (in hours)
  cooldownNew: parseInt(process.env.COOLDOWN_NEW || '48'),
  cooldownTrusted: parseInt(process.env.COOLDOWN_TRUSTED || '24'),
  
  // Trust criteria
  trustWalletAgeDays: parseInt(process.env.TRUST_WALLET_AGE_DAYS || '7'),
  trustMinTransactions: parseInt(process.env.TRUST_MIN_TXS || '3'),
  
  // Rate limiting
  maxDripsPerIp: parseInt(process.env.MAX_DRIPS_PER_IP || '5'),
  maxDripsPerHour: parseInt(process.env.MAX_DRIPS_PER_HOUR || '100'),
  ipRateLimitWindow: 24 * 60 * 60 * 1000, // 24 hours in ms
  
  // PoW
  powDifficulty: parseInt(process.env.POW_DIFFICULTY || '4'), // leading zeros
  powTimestampTolerance: 5 * 60 * 1000, // 5 minutes in ms
  
  // Admin
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminIpAllowlist: (process.env.ADMIN_IP_ALLOWLIST || '127.0.0.1,::1').split(','),
  
  // Alerts
  alertLowBalanceThreshold: parseFloat(process.env.ALERT_LOW_BALANCE || '2500'),
  alertCriticalBalanceThreshold: parseFloat(process.env.ALERT_CRITICAL_BALANCE || '1000'),
  discordWebhook: process.env.DISCORD_WEBHOOK || '',
  alertEmail: process.env.ALERT_EMAIL || '',
  
  // Database
  dbPath: process.env.DB_PATH || './data/faucet.db',
  
  // Explorer
  explorerBaseUrl: process.env.EXPLORER_URL || 'https://explorer.neutaro.io/Neutaro',
  
  // Tip address (for "buy me a coffee" - separate from faucet wallet)
  tipAddress: process.env.TIP_ADDRESS || 'neutaro1e8xal8tqdegu4w48z3fphemd3hc07gech3pfek',
  
  // OpenClaw attestation
  openclawEnabled: process.env.OPENCLAW_ENABLED !== 'false',
  openclawPublicKeys: (process.env.OPENCLAW_PUBLIC_KEYS || '').split(',').filter(Boolean),
} as const;

// Validate required config
export function validateConfig(): void {
  const errors: string[] = [];
  
  if (!CONFIG.walletPassword) {
    errors.push('FAUCET_WALLET_PASSWORD is required');
  }
  
  if (!CONFIG.adminPassword) {
    errors.push('ADMIN_PASSWORD is required');
  }

  if (!CONFIG.sslCertPath || !CONFIG.sslKeyPath) {
    errors.push('SSL_CERT_PATH and SSL_KEY_PATH are required for HTTPS');
  }
  
  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
}

export type Config = typeof CONFIG;
