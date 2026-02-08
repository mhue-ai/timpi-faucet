// Proof of Work module for Timpi Drip
import { createHash } from 'crypto';
import { CONFIG } from '../config.js';

export interface PowChallenge {
  address: string;
  timestamp: number;
  difficulty: number;
}

export interface PowSolution {
  nonce: string;
  timestamp: number;
}

/**
 * Generate a challenge for a given address
 */
export function generateChallenge(address: string): PowChallenge {
  return {
    address,
    timestamp: Date.now(),
    difficulty: CONFIG.powDifficulty,
  };
}

/**
 * Compute hash for PoW verification
 */
export function computeHash(address: string, timestamp: number, nonce: string): string {
  const data = `${address}:${timestamp}:${nonce}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Check if a hash meets difficulty requirement
 */
export function meetsTarget(hash: string, difficulty: number): boolean {
  const target = '0'.repeat(difficulty);
  return hash.startsWith(target);
}

/**
 * Verify a PoW solution
 */
export function verifySolution(
  address: string, 
  solution: PowSolution,
  difficulty: number = CONFIG.powDifficulty
): { valid: boolean; reason?: string } {
  // Check timestamp is within tolerance
  const now = Date.now();
  const timeDiff = Math.abs(now - solution.timestamp);
  
  if (timeDiff > CONFIG.powTimestampTolerance) {
    return { 
      valid: false, 
      reason: `Timestamp too old. Must be within ${CONFIG.powTimestampTolerance / 60000} minutes.` 
    };
  }
  
  // Verify the hash
  const hash = computeHash(address, solution.timestamp, solution.nonce);
  
  if (!meetsTarget(hash, difficulty)) {
    return { 
      valid: false, 
      reason: `Hash does not meet difficulty requirement (${difficulty} leading zeros).` 
    };
  }
  
  return { valid: true };
}

/**
 * Solve PoW (for testing or server-side use)
 */
export function solve(address: string, timestamp: number, difficulty: number): string {
  let nonce = 0;
  while (true) {
    const hash = computeHash(address, timestamp, nonce.toString());
    if (meetsTarget(hash, difficulty)) {
      return nonce.toString();
    }
    nonce++;
  }
}

/**
 * Estimate average attempts needed for a given difficulty
 */
export function estimateAttempts(difficulty: number): number {
  return Math.pow(16, difficulty);
}

/**
 * Generate client-side PoW solver code (for embedding in HTML)
 */
export function getClientSolverCode(): string {
  return `
// Timpi Drip PoW Solver
async function solvePow(address, timestamp, difficulty) {
  return new Promise((resolve) => {
    let nonce = 0;
    const target = '0'.repeat(difficulty);
    
    function hashChunk() {
      const chunkSize = 10000;
      for (let i = 0; i < chunkSize; i++) {
        const data = address + ':' + timestamp + ':' + nonce;
        const hashBuffer = new TextEncoder().encode(data);
        crypto.subtle.digest('SHA-256', hashBuffer).then(hash => {
          const hashHex = Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          if (hashHex.startsWith(target)) {
            resolve({ nonce: nonce.toString(), timestamp, hash: hashHex });
          }
        });
        nonce++;
      }
      setTimeout(hashChunk, 0);
    }
    
    hashChunk();
  });
}

// Synchronous version using Web Crypto
async function solvePowSync(address, timestamp, difficulty) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  
  while (true) {
    const data = address + ':' + timestamp + ':' + nonce;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    if (hashHex.startsWith(target)) {
      return { nonce: nonce.toString(), timestamp, hash: hashHex };
    }
    
    nonce++;
    
    // Yield to UI every 1000 iterations
    if (nonce % 1000 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }
}
`;
}
