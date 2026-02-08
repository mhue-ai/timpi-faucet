// IP address utilities for Timpi Drip
import { timingSafeEqual } from 'crypto';

/**
 * Parse CIDR notation to get network and mask
 */
function parseCidr(cidr: string): { network: number[]; maskBits: number } | null {
  const parts = cidr.split('/');
  if (parts.length !== 2) return null;
  
  const ip = parts[0];
  const maskBits = parseInt(parts[1], 10);
  
  if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) return null;
  
  const octets = ip.split('.').map(n => parseInt(n, 10));
  if (octets.length !== 4 || octets.some(n => isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  
  return { network: octets, maskBits };
}

/**
 * Convert IP string to numeric array
 */
function ipToOctets(ip: string): number[] | null {
  // Handle IPv6 localhost
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    return [127, 0, 0, 1];
  }
  
  // Handle IPv4-mapped IPv6
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  
  const octets = ip.split('.').map(n => parseInt(n, 10));
  if (octets.length !== 4 || octets.some(n => isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  
  return octets;
}

/**
 * Check if IP matches a CIDR range
 */
function ipMatchesCidr(ip: number[], network: number[], maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  
  const ipNum = (ip[0] << 24) + (ip[1] << 16) + (ip[2] << 8) + ip[3];
  const netNum = (network[0] << 24) + (network[1] << 16) + (network[2] << 8) + network[3];
  
  return (ipNum & mask) === (netNum & mask);
}

/**
 * Check if an IP address is in the allowlist
 * Supports exact match and CIDR notation
 */
export function isIpAllowed(ip: string, allowlist: string[]): boolean {
  const ipOctets = ipToOctets(ip);
  
  for (const entry of allowlist) {
    // Exact match (including localhost variants)
    if (entry === ip) return true;
    if (entry === '127.0.0.1' && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
      return true;
    }
    if (entry === '::1' && (ip === '::1' || ip === '127.0.0.1')) {
      return true;
    }
    
    // CIDR match
    if (entry.includes('/') && ipOctets) {
      const cidr = parseCidr(entry);
      if (cidr && ipMatchesCidr(ipOctets, cidr.network, cidr.maskBits)) {
        return true;
      }
    }
    
    // Simple prefix match for IPv4 (e.g., "192.168.")
    if (!entry.includes('/') && entry.endsWith('.') && ip.startsWith(entry)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Timing-safe string comparison for passwords
 */
export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  
  if (bufA.length !== bufB.length) {
    // Still do a comparison to prevent timing attacks on length
    timingSafeEqual(bufA, bufA);
    return false;
  }
  
  return timingSafeEqual(bufA, bufB);
}
