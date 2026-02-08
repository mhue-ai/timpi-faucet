# Timpi Drip — Product Specification
*Last updated: 2026-02-08*

---

## 1. Overview

| Item | Value |
|------|-------|
| **Name** | Timpi Drip |
| **Domain** | drip.clawpurse.ai |
| **Tagline** | "Community faucet by Mhue.ai" |
| **Purpose** | Distribute NTMPI tokens to humans, developers, and AI agents |
| **Branding** | Timpi ecosystem + ClawPurse |

---

## 2. Target Users

- New humans exploring Timpi for the first time
- Developers testing dApps and integrations
- AI agents (including OpenClaw) bootstrapping wallets
- Existing users needing gas top-ups
- Community members onboarding friends

---

## 3. Economics

### Pool Allocation
| Portion | Amount | Purpose |
|---------|--------|---------|
| Total | 100,000 NTMPI | Initial capital |
| Staked | 95,000 NTMPI | Earning 17% APY |
| Liquid | 5,000 NTMPI | Available for drips |

### Yield Model
| Metric | Value |
|--------|-------|
| Staking APY | 17% |
| Monthly yield | ~1,345 NTMPI |
| Unbonding period | 22 days |
| Break-even drips | ~60/day |

### Drip Tiers (Model B — Restrictive to New)
| Tier | Drip | Cooldown | Criteria |
|------|------|----------|----------|
| New | 0.5 NTMPI | 48h | Default (no history) |
| Trusted | 1.0 NTMPI | 24h | Age >7d OR 3+ txs OR social verified OR OpenClaw agent |

All amounts configurable via admin interface.

---

## 4. Trust Criteria

| Signal | Description |
|--------|-------------|
| Wallet age | First on-chain activity > 7 days ago |
| Transaction history | 3+ transactions sent or received |
| Social verified | Linked Twitter or Discord account |
| OpenClaw agent | Valid attestation signature |

No vouching system.

---

## 5. Anti-Abuse Measures

### Proof of Work
- Algorithm: SHA256
- Difficulty: 4 leading zeros (~65k attempts)
- Challenge: `SHA256(address + timestamp + nonce)`
- Timestamp must be within 5 minutes
- Admin-adjustable difficulty

### Rate Limiting
| Dimension | Limit | Window |
|-----------|-------|--------|
| Per IP | 5 drip requests | 24h |
| Per address | 1 drip | 24-48h (tier-based) |
| Global throughput | 100 drips | 1 hour |
| Failed attempts/IP | 10 | 1 hour (then block) |

### Additional
- Proxy-aware IP detection (configurable proxy count)
- OpenClaw agents get priority queue
- Social login optional trust boost

---

## 6. Technical Architecture

### Stack
| Component | Technology |
|-----------|------------|
| Backend | Node.js + Fastify |
| Frontend | Static HTML/CSS/JS |
| Database | SQLite |
| Wallet | ClawPurse |
| Deployment | Docker |
| SSL/CDN | Cloudflare |

### Container Design
```
┌─────────────────────────────────────────┐
│         timpi-drip:latest               │
├─────────────────────────────────────────┤
│  Fastify API (:3000)                    │
│  ├── /api/drip (POST)                   │
│  ├── /api/status (GET)                  │
│  ├── /api/check/:addr (GET)             │
│  └── /health, /metrics                  │
├─────────────────────────────────────────┤
│  Admin API (:3001, IP-restricted)       │
│  ├── /admin/dashboard                   │
│  ├── /admin/config                      │
│  ├── /admin/staking                     │
│  └── /admin/logs                        │
├─────────────────────────────────────────┤
│  ClawPurse (wallet operations)          │
├─────────────────────────────────────────┤
│  SQLite (rate limits, history, logs)    │
└─────────────────────────────────────────┘
```

---

## 7. User Interface

### Public UI Features
- Address input field
- Human/Agent toggle
- PoW progress indicator
- Live drip feed (real-time)
- Public stats (drips today, pool balance, agent vs human ratio)
- Block explorer link after drip
- Text/API mode for agents (`Accept: text/plain`)

### Admin UI Features
- Dashboard with key metrics
- Drip configuration (amounts, cooldowns)
- Staking management (validators, auto-restake)
- Rate limit configuration
- Audit logs
- Alert configuration
- Kill switch (disable all drips)

---

## 8. Staking Configuration (Admin)

| Setting | Type | Description |
|---------|------|-------------|
| `autoRestakeEnabled` | boolean | Toggle auto-restaking |
| `autoRestakeThreshold` | number | Restake when liquid exceeds this |
| `liquidBufferTarget` | number | Keep this much liquid after restake |
| `validators` | list | Admin-defined validators |
| `validatorWeights` | object | Split stake percentages |

---

## 9. Integrations

| System | Integration |
|--------|-------------|
| ClawPurse | Internal wallet operations |
| Block explorer | Link to explorer.neutaro.io after drip |
| OpenClaw | Priority lane with attestation |
| Twitter | Optional social verification |
| Discord | Optional social verification + alerts |
| Email | Alert notifications |

---

## 10. Operations

| Item | Decision |
|------|----------|
| Hosting | Self-hosted Docker |
| Alerts | Email + Discord |
| Refill | Manual (when alerted) |
| Uptime | Best effort |
| Admin auth | Password + optional wallet signature |
| Admin access | IP allowlist |

### Alert Triggers
| Event | Action |
|-------|--------|
| Liquid < 2,500 NTMPI | Email + Discord |
| Liquid < 1,000 NTMPI | Urgent alert |
| Drip rate > 80/day | Discord warning |
| Failed auths > 5/hour | Discord warning |
| Service down | Email + Discord |

---

## 11. Security

### Wallet Security
- AES-256-GCM encrypted keystore (ClawPurse)
- Password via environment variable
- File permissions: 0600
- Separate wallet (not main funds)
- Most funds staked (only 5k liquid)

### Application Security
- Cloudflare WAF + DDoS protection
- CSP, HSTS, X-Frame-Options headers
- Parameterized SQL queries
- Rate limiting at edge and application
- Admin IP allowlist
- Audit logging

### Incident Response
| Scenario | Response |
|----------|----------|
| Abuse spike | Increase PoW difficulty, reduce IP limits |
| Key compromise | Disable faucet, transfer to new wallet |
| DDoS | Cloudflare "Under Attack" mode |
| Pool low | Disable drips, alert to refill |

---

## 12. API Reference

### POST /api/drip
Request tokens.

**Request:**
```json
{
  "address": "neutaro1...",
  "pow": {
    "nonce": "12345",
    "timestamp": 1707400000
  },
  "attestation": "optional-openclaw-sig"
}
```

**Response:**
```json
{
  "success": true,
  "amount": "1.0",
  "txHash": "ABC123...",
  "explorerUrl": "https://explorer.neutaro.io/tx/ABC123...",
  "nextDripAt": "2026-02-09T08:30:00Z"
}
```

### GET /api/status
Faucet status.

**Response:**
```json
{
  "pool": {
    "liquid": 5847.5,
    "staked": 95000,
    "total": 100847.5
  },
  "stats": {
    "dripsToday": 42,
    "dripsThisHour": 3,
    "agentRatio": 0.31
  },
  "config": {
    "dripNew": 0.5,
    "dripTrusted": 1.0,
    "cooldownNew": 48,
    "cooldownTrusted": 24
  }
}
```

### GET /api/check/:address
Check if address can drip.

**Response:**
```json
{
  "canDrip": false,
  "reason": "cooldown",
  "nextDripAt": "2026-02-09T08:30:00Z",
  "tier": "trusted",
  "dripAmount": 1.0
}
```

---

## 13. ClawPurse Additions Required

| Function | Priority | Purpose |
|----------|----------|---------|
| `delegate(validator, amount)` | Required | Initial stake + restaking |
| `undelegate(validator, amount)` | Required | Emergency access |
| `getDelegations()` | Required | View staked amounts |
| `redelegate(from, to, amount)` | Nice-to-have | Switch validators |
| `getValidators()` | Nice-to-have | List available validators |

---

## 14. Success Criteria

- **Primary:** Secure existence (runs safely, not drained)
- **Metrics:** Displayed on public UI and admin dashboard
- **Profitability:** Break-even or profitable via staking yield

---

## 15. Deployment Checklist

### Pre-launch
- [ ] Domain configured (drip.clawpurse.ai)
- [ ] SSL certificate active
- [ ] Cloudflare enabled
- [ ] Keystore encrypted, password in env
- [ ] Admin IP allowlist set
- [ ] Rate limits tested
- [ ] PoW verified working
- [ ] Alert webhooks configured
- [ ] Mnemonic backed up offline
- [ ] Initial stake delegated

### Post-launch
- [ ] Monitor drip rate (first week)
- [ ] Check for abuse patterns
- [ ] Verify alerts working
- [ ] Review audit logs daily

---

*End of specification.*
