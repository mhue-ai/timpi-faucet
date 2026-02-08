# Faucet Research & Security Best Practices

Research compiled from analysis of production faucet implementations across Cosmos, Ethereum, Polkadot, and other ecosystems.

## Notable Faucet Implementations Reviewed

| Project | Ecosystem | Language | Key Features |
|---------|-----------|----------|--------------|
| [okp4/cosmos-faucet](https://github.com/okp4/cosmos-faucet) | Cosmos | Go | ReCaptcha, GraphQL API, batch windowing, metrics |
| [paritytech/polkadot-testnet-faucet](https://github.com/paritytech/polkadot-testnet-faucet) | Polkadot | TypeScript | ReCaptcha, Prometheus metrics, health checks, Helm chart |
| [chainflag/eth-faucet](https://github.com/chainflag/eth-faucet) | Ethereum | Go | hCaptcha, IP+address rate limiting, proxy-aware, Docker |
| [gyrostable/social-faucet](https://github.com/gyrostable/social-faucet) | Ethereum | Python | Twitter/Discord identity verification, local DB rate limiting |
| [ReviewNetwork/nano-faucet](https://github.com/ReviewNetwork/nano-faucet) | Ethereum | Node.js | Minimal API-only design, single-drip-until-depleted |

---

## Security Best Practices

### 1. Anti-Sybil / Anti-Abuse Measures

**Captcha Verification** (Recommended)
- Google ReCaptcha v3 (score-based, invisible)
- hCaptcha (privacy-focused alternative)
- Set minimum score threshold (typically 0.5-0.7)

```yaml
# okp4 example config
captcha: true
captcha-min-score: 0.5
captcha-secret: $CAPTCHA_SECRET
```

**Social Identity Verification** (Stronger but more friction)
- Require Twitter/Discord OAuth
- One drip per verified social account
- Prevents bulk wallet farming

**Proof of Humanity / Proof of Personhood**
- Integration with services like Worldcoin, BrightID, or Gitcoin Passport
- Higher barrier but near-elimination of bots

### 2. Rate Limiting

**Multi-dimensional rate limits are essential:**

| Dimension | Typical Limit | Rationale |
|-----------|---------------|-----------|
| Per wallet address | 1 per 24h | Prevents same-address farming |
| Per IP address | 3-5 per 24h | Prevents single-machine farming |
| Per social identity | 1 per 24h | If using OAuth verification |
| Global throughput | X per minute | Prevents depletion attacks |

**Implementation patterns:**
- In-memory with TTL (Redis, node-cache)
- Persistent database for longer windows
- Sliding window vs fixed window algorithms

```go
// chainflag pattern: IP + Address combo
-faucet.minutes 1440  // 24 hour cooldown
```

### 3. Proxy-Aware IP Detection

**Critical for accurate IP rate limiting:**

```go
// chainflag approach
-proxycount 1  // Number of reverse proxies in front
```

- Don't trust `X-Forwarded-For` blindly
- Specify exact proxy count to prevent spoofing
- Use rightmost N IPs from XFF header where N = proxycount

**Without this:** Attackers can spoof IPs by adding fake XFF headers.

### 4. Wallet/Key Security

**Private Key Protection:**
- Never commit keys to repo
- Use environment variables or secrets manager
- Consider keystore files with password (chainflag pattern)
- Hardware wallet / HSM for high-value faucets

```bash
# Environment variable pattern
export PRIVATE_KEY=hex_private_key

# Keystore pattern (more secure)
export KEYSTORE=keystore_path
echo "password" > password.txt  # Separate file
```

**Operational Security:**
- Dedicated faucet wallet (not main treasury)
- Automated low-balance alerts
- Fund only what you're willing to lose

### 5. Transaction Security

**Batch Windowing** (okp4 pattern):
```yaml
batch-window: 8s  # Minimum time between transactions
```
- Prevents transaction spam
- Reduces gas costs via batching
- Protects against nonce race conditions

**Gas/Fee Management:**
- Set explicit gas limits
- Monitor for gas price spikes
- Consider dynamic fee adjustment

### 6. API Security

**Input Validation:**
- Validate address format strictly (e.g., `neutaro1...` prefix)
- Sanitize all inputs
- Reject malformed requests early

**Rate Limiting at API Level:**
- Return 429 Too Many Requests
- Include `Retry-After` header
- Don't reveal internal state in errors

**CORS Configuration:**
- Restrict origins if using web UI
- API-only mode if possible

### 7. Monitoring & Observability

**Essential Metrics:**
- Requests per minute (total, successful, rejected)
- Rejection reasons breakdown
- Wallet balance
- Transaction success/failure rate
- Response latency

**Health Endpoints:**
- `/health` - Basic liveness
- `/ready` - Readiness (wallet funded, chain connected)
- `/metrics` - Prometheus-compatible

```yaml
# okp4 pattern
--health    # Enable health endpoint
--metrics   # Enable Prometheus metrics
```

### 8. Denial of Service Protection

**Layer 7 Protection:**
- Cloudflare or similar CDN
- Rate limiting at edge
- Bot detection

**Application Level:**
- Request queuing with max depth
- Timeout on chain operations
- Circuit breaker for RPC failures

### 9. Audit Trail & Logging

**Log Every Request:**
```json
{
  "timestamp": "2026-02-08T12:00:00Z",
  "event": "drip_request",
  "address": "neutaro1...",
  "ip": "x.x.x.x",
  "captcha_score": 0.9,
  "result": "success|rate_limited|captcha_failed",
  "tx_hash": "ABC123..."
}
```

**Retain logs** for abuse investigation and compliance.

---

## Architecture Recommendations for Timpi Faucet

### Tier 1: Minimum Viable Faucet
- hCaptcha or ReCaptcha v3
- Address + IP rate limiting (24h cooldown)
- Environment variable for private key
- Single drip amount (e.g., 1 NTMPI)
- Health endpoint
- Structured logging

### Tier 2: Production Faucet
- All Tier 1 features
- Redis for distributed rate limiting
- Prometheus metrics
- Wallet balance monitoring with alerts
- Configurable drip amounts
- Admin dashboard (protected)
- Batch windowing for transactions

### Tier 3: High-Security Faucet
- All Tier 2 features
- Social identity verification (Twitter/Discord)
- Keystore with password file (not raw key)
- Geofencing (optional)
- Wallet allowlist for large drips
- Anomaly detection on request patterns
- Multi-sig for refilling faucet

---

## Recommended Tech Stack

| Component | Recommendation | Rationale |
|-----------|----------------|-----------|
| Language | TypeScript (Node.js) or Go | ClawPurse is TS; Go has best faucet examples |
| Framework | Fastify or Express (TS) / Gin (Go) | Lightweight, good middleware |
| Rate Limiting | Redis + rate-limiter-flexible | Distributed, battle-tested |
| Captcha | hCaptcha | Privacy-focused, free tier |
| Chain Interaction | @cosmjs/stargate | Already used in ClawPurse |
| Logging | Pino (TS) / Zap (Go) | Structured JSON logging |
| Metrics | prom-client (TS) | Prometheus compatible |
| Deployment | Docker + systemd | Simple, reproducible |

---

## Attack Vectors to Mitigate

| Attack | Mitigation |
|--------|------------|
| Wallet farming (many addresses) | Captcha + IP rate limit |
| IP spoofing | Proxy-aware detection |
| Captcha solving services | Higher score threshold + social verification |
| Transaction spam | Batch windowing + global rate limit |
| Key extraction | Keystore encryption + env vars |
| Wallet draining | Low balance + monitoring alerts |
| DDoS | CDN + edge rate limiting |
| Nonce race conditions | Transaction queuing |

---

## References

- okp4/cosmos-faucet: https://github.com/okp4/cosmos-faucet
- chainflag/eth-faucet: https://github.com/chainflag/eth-faucet
- paritytech/polkadot-testnet-faucet: https://github.com/paritytech/polkadot-testnet-faucet
- gyrostable/social-faucet: https://github.com/gyrostable/social-faucet
- hCaptcha docs: https://docs.hcaptcha.com/
- ReCaptcha v3: https://developers.google.com/recaptcha/docs/v3
