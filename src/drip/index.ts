// Drip logic for Timpi Drip
import { 
  loadKeystore, 
  getBalance, 
  send, 
  keystoreExists,
  type SendResult 
} from 'clawpurse';
import { CONFIG } from '../config.js';
import { 
  recordDrip, 
  getLastDripForAddress, 
  checkRateLimit,
  getTrustCache,
  setTrustCache,
  updateDailyStats,
  logAudit,
  type DripRecord
} from '../db/index.js';
import { verifySolution, type PowSolution } from '../pow/index.js';

export interface DripRequest {
  address: string;
  pow?: PowSolution;
  attestation?: string;
  attestationType?: 'openclaw' | 'social';
  isAgent?: boolean;
  ip?: string;
  userAgent?: string;
}

export interface DripResult {
  success: boolean;
  txHash?: string;
  amount?: string;
  tier?: 'new' | 'trusted';
  explorerUrl?: string;
  nextDripAt?: Date;
  error?: string;
  errorCode?: string;
}

export type TrustTier = 'new' | 'trusted';

/**
 * Determine trust tier for an address
 */
export async function determineTrustTier(
  address: string, 
  attestationType?: string
): Promise<{ tier: TrustTier; reason: string }> {
  // OpenClaw attestation = auto trusted
  if (attestationType === 'openclaw') {
    return { tier: 'trusted', reason: 'openclaw_attestation' };
  }
  
  // Social verification = trusted
  if (attestationType === 'social') {
    return { tier: 'trusted', reason: 'social_verified' };
  }
  
  // Check cache first
  const cached = getTrustCache(address);
  if (cached && cached.is_trusted) {
    return { tier: 'trusted', reason: cached.trust_reason || 'cached' };
  }
  
  // Query chain for wallet history
  try {
    const response = await fetch(
      `https://api2.neutaro.io/cosmos/tx/v1beta1/txs?events=transfer.recipient='${address}'&pagination.limit=10`
    );
    const data = await response.json() as { tx_responses?: any[]; pagination?: { total: string } };
    
    const txCount = parseInt(data.pagination?.total || '0');
    
    // Check transaction count
    if (txCount >= CONFIG.trustMinTransactions) {
      setTrustCache({
        address,
        is_trusted: true,
        trust_reason: 'tx_history',
        tx_count: txCount,
        social_verified: false,
        last_checked: new Date().toISOString(),
      });
      return { tier: 'trusted', reason: 'tx_history' };
    }
    
    // Check wallet age (first tx timestamp)
    if (data.tx_responses && data.tx_responses.length > 0) {
      const firstTx = data.tx_responses[data.tx_responses.length - 1];
      const firstTxTime = new Date(firstTx.timestamp).getTime();
      const ageMs = Date.now() - firstTxTime;
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      
      if (ageDays >= CONFIG.trustWalletAgeDays) {
        setTrustCache({
          address,
          is_trusted: true,
          trust_reason: 'wallet_age',
          first_seen: firstTx.timestamp,
          tx_count: txCount,
          social_verified: false,
          last_checked: new Date().toISOString(),
        });
        return { tier: 'trusted', reason: 'wallet_age' };
      }
    }
    
    // Cache as not trusted
    setTrustCache({
      address,
      is_trusted: false,
      tx_count: txCount,
      social_verified: false,
      last_checked: new Date().toISOString(),
    });
    
  } catch (error) {
    // On error, default to new tier (fail safe)
    console.error('Error checking trust:', error);
  }
  
  return { tier: 'new', reason: 'no_history' };
}

/**
 * Check if address can drip (cooldown check)
 */
export function canDrip(address: string, tier: TrustTier): {
  allowed: boolean;
  nextDripAt?: Date;
  lastDrip?: DripRecord;
} {
  const lastDrip = getLastDripForAddress(address);
  
  if (!lastDrip) {
    return { allowed: true };
  }
  
  const cooldownHours = tier === 'trusted' ? CONFIG.cooldownTrusted : CONFIG.cooldownNew;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const lastDripTime = new Date(lastDrip.created_at!).getTime();
  const nextDripAt = new Date(lastDripTime + cooldownMs);
  
  if (Date.now() < nextDripAt.getTime()) {
    return { allowed: false, nextDripAt, lastDrip };
  }
  
  return { allowed: true, lastDrip };
}

/**
 * Get drip amount for tier
 */
export function getDripAmount(tier: TrustTier): number {
  return tier === 'trusted' ? CONFIG.dripAmountTrusted : CONFIG.dripAmountNew;
}

/**
 * Get cooldown for tier (in hours)
 */
export function getCooldownHours(tier: TrustTier): number {
  return tier === 'trusted' ? CONFIG.cooldownTrusted : CONFIG.cooldownNew;
}

/**
 * Process a drip request
 */
export async function processDrip(request: DripRequest): Promise<DripResult> {
  const { address, pow, attestation, attestationType, isAgent, ip, userAgent } = request;
  
  // Validate address format
  if (!address.startsWith('neutaro1') || address.length !== 46) {
    return { success: false, error: 'Invalid address format', errorCode: 'INVALID_ADDRESS' };
  }
  
  // Check IP rate limit
  if (ip) {
    const ipLimit = checkRateLimit(ip, 'ip', CONFIG.maxDripsPerIp, CONFIG.ipRateLimitWindow);
    if (!ipLimit.allowed) {
      logAudit('drip_ip_rate_limited', address, ip, { count: ipLimit.count });
      return { 
        success: false, 
        error: `IP rate limit exceeded. Try again after ${ipLimit.resetAt.toISOString()}`,
        errorCode: 'IP_RATE_LIMITED',
        nextDripAt: ipLimit.resetAt,
      };
    }
  }
  
  // Determine trust tier
  const { tier, reason } = await determineTrustTier(address, attestationType);
  
  // Check address cooldown
  const cooldownCheck = canDrip(address, tier);
  if (!cooldownCheck.allowed) {
    return {
      success: false,
      error: `Address on cooldown. Next drip available at ${cooldownCheck.nextDripAt!.toISOString()}`,
      errorCode: 'COOLDOWN',
      tier,
      nextDripAt: cooldownCheck.nextDripAt,
    };
  }
  
  // Verify PoW (unless OpenClaw attestation)
  if (attestationType !== 'openclaw') {
    if (!pow) {
      return { success: false, error: 'Proof of work required', errorCode: 'POW_REQUIRED' };
    }
    
    const powResult = verifySolution(address, pow);
    if (!powResult.valid) {
      logAudit('drip_pow_failed', address, ip, { reason: powResult.reason });
      return { success: false, error: powResult.reason, errorCode: 'POW_INVALID' };
    }
  }
  
  // Get drip amount
  const amount = getDripAmount(tier);
  
  // Load wallet and send
  try {
    if (!await keystoreExists(CONFIG.keystorePath)) {
      return { success: false, error: 'Faucet wallet not configured', errorCode: 'WALLET_ERROR' };
    }
    
    const { wallet, address: faucetAddress } = await loadKeystore(CONFIG.walletPassword, CONFIG.keystorePath);
    
    // Check balance first
    const balance = await getBalance(faucetAddress);
    const availableBalance = parseFloat(balance.primary.displayAmount);
    
    if (availableBalance < amount + 0.01) { // +0.01 for gas
      logAudit('drip_low_balance', 'system', undefined, { balance: availableBalance, requested: amount });
      return { success: false, error: 'Faucet temporarily empty. Please try again later.', errorCode: 'LOW_BALANCE' };
    }
    
    // Execute drip
    const result = await send(wallet, faucetAddress, address, amount.toString(), {
      memo: `Timpi Drip - ${tier} tier`,
      skipConfirmation: true,
      gasLimit: 100000, // Prevent out-of-gas errors
    });
    
    // Record drip
    const dripRecord: DripRecord = {
      address,
      amount: amount.toString(),
      tx_hash: result.txHash,
      tier,
      ip_address: ip,
      user_agent: userAgent,
      is_agent: isAgent || false,
      attestation_type: attestationType,
    };
    recordDrip(dripRecord);
    
    // Update stats
    updateDailyStats(isAgent || false, amount.toString());
    
    // Log success
    logAudit('drip_success', address, ip, { 
      amount, 
      tier, 
      txHash: result.txHash,
      trustReason: reason,
    });
    
    // Calculate next drip time
    const cooldownMs = getCooldownHours(tier) * 60 * 60 * 1000;
    const nextDripAt = new Date(Date.now() + cooldownMs);
    
    return {
      success: true,
      txHash: result.txHash,
      amount: amount.toString(),
      tier,
      explorerUrl: `${CONFIG.explorerBaseUrl}/tx/${result.txHash}`,
      nextDripAt,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logAudit('drip_error', address, ip, { error: errorMessage });
    return { success: false, error: `Transaction failed: ${errorMessage}`, errorCode: 'TX_ERROR' };
  }
}

/**
 * Get faucet status
 */
export async function getFaucetStatus(): Promise<{
  pool: { liquid: number; staked: number; total: number };
  wallet: { address: string };
  tipAddress: string;
  config: { dripNew: number; dripTrusted: number; cooldownNew: number; cooldownTrusted: number };
}> {
  try {
    const { address } = await loadKeystore(CONFIG.walletPassword, CONFIG.keystorePath);
    const balance = await getBalance(address);
    const liquid = parseFloat(balance.primary.displayAmount);
    
    // TODO: Get staked amount from ClawPurse getDelegations
    const staked = 0; // Placeholder
    
    return {
      pool: {
        liquid,
        staked,
        total: liquid + staked,
      },
      wallet: {
        address,
      },
      tipAddress: CONFIG.tipAddress,
      config: {
        dripNew: CONFIG.dripAmountNew,
        dripTrusted: CONFIG.dripAmountTrusted,
        cooldownNew: CONFIG.cooldownNew,
        cooldownTrusted: CONFIG.cooldownTrusted,
      },
    };
  } catch (error) {
    return {
      pool: { liquid: 0, staked: 0, total: 0 },
      wallet: { address: '' },
      tipAddress: CONFIG.tipAddress,
      config: {
        dripNew: CONFIG.dripAmountNew,
        dripTrusted: CONFIG.dripAmountTrusted,
        cooldownNew: CONFIG.cooldownNew,
        cooldownTrusted: CONFIG.cooldownTrusted,
      },
    };
  }
}
