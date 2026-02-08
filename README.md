# Timpi Drip

🚰 Community faucet for NTMPI tokens on the Neutaro chain.

**drip.clawpurse.ai** • By [Mhue.ai](https://mhue.ai)

## Features

- 💧 **Tiered Drips** — 0.5 NTMPI for new wallets, 1.0 NTMPI for trusted
- 🤖 **AI-Friendly** — Priority lane for OpenClaw agents
- ⛏️ **PoW Spam Protection** — Client-side proof-of-work instead of CAPTCHA
- 📊 **Live Stats** — Real-time drip feed and pool balance
- 🔐 **Secure Admin** — IP-restricted dashboard with kill switch
- 🥩 **Staking Integration** — Auto-restake from yield (via ClawPurse)

## Quick Start

### Local Development

```bash
# Clone
git clone https://github.com/mhue-ai/timpi-faucet.git
cd timpi-faucet

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your wallet password and admin password

# Run
npm run dev
```

### Docker Deployment

```bash
# Copy env
cp .env.example .env
# Edit .env with production values

# Create keystore directory
mkdir -p keystore
cp ~/.clawpurse/keystore.enc keystore/

# Run
docker-compose up -d

# View logs
docker-compose logs -f
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FAUCET_WALLET_PASSWORD` | ✅ | — | ClawPurse wallet decryption password |
| `ADMIN_PASSWORD` | ✅ | — | Admin dashboard password |
| `KEYSTORE_PATH` | — | `~/.clawpurse/keystore.enc` | Path to encrypted wallet |
| `DRIP_AMOUNT_NEW` | — | `0.5` | NTMPI per drip (new wallets) |
| `DRIP_AMOUNT_TRUSTED` | — | `1.0` | NTMPI per drip (trusted wallets) |
| `COOLDOWN_NEW` | — | `48` | Hours between drips (new) |
| `COOLDOWN_TRUSTED` | — | `24` | Hours between drips (trusted) |
| `POW_DIFFICULTY` | — | `4` | Leading zeros required (4 ≈ 65k attempts) |
| `ADMIN_IP_ALLOWLIST` | — | `127.0.0.1,::1` | IPs allowed to access admin |
| `DISCORD_WEBHOOK` | — | — | Webhook for alerts |

## API

### Get Tokens

```bash
# 1. Get challenge
curl https://drip.clawpurse.ai/api/challenge/neutaro1...

# 2. Solve PoW (client-side) and submit
curl -X POST https://drip.clawpurse.ai/api/drip \
  -H "Content-Type: application/json" \
  -d '{
    "address": "neutaro1...",
    "pow": { "nonce": "12345", "timestamp": 1707400000 }
  }'
```

### OpenClaw Agents

Agents with valid attestation skip PoW and get priority:

```bash
curl -X POST https://drip.clawpurse.ai/api/drip \
  -H "Content-Type: application/json" \
  -d '{
    "address": "neutaro1...",
    "attestation": "<openclaw-signature>",
    "isAgent": true
  }'
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Pool balance, stats, config |
| GET | `/api/check/:address` | Check eligibility & tier |
| GET | `/api/challenge/:address` | Get PoW challenge |
| POST | `/api/drip` | Request tokens |
| GET | `/api/drips/recent` | Recent drip feed |
| GET | `/api/info` | Plain text API info |
| GET | `/health` | Health check |

## Trust Tiers

| Tier | Drip | Cooldown | Criteria |
|------|------|----------|----------|
| New | 0.5 NTMPI | 48h | Default for new wallets |
| Trusted | 1.0 NTMPI | 24h | Wallet age >7 days OR 3+ transactions OR OpenClaw attestation |

## Security

- **PoW Protection** — Prevents spam without third-party dependencies
- **Rate Limiting** — Per-IP and per-address limits
- **IP Allowlist** — Admin routes restricted by IP
- **Kill Switch** — Instantly disable drips if abused
- **Security Headers** — CSP, HSTS, X-Frame-Options
- **Non-root Container** — Runs as unprivileged user
- **Read-only FS** — Container filesystem is read-only

## Admin Dashboard

Access at `/admin.html` (IP-restricted):

- 📊 Real-time stats and pool balance
- ⚙️ Adjust drip amounts and cooldowns
- 🥩 Staking configuration
- 📋 Audit logs
- 🛑 Kill switch

## Economics

With 95k NTMPI staked at 17% APY:
- Monthly yield: ~1,345 NTMPI
- Break-even: ~60 drips/day
- Liquid buffer: 5k NTMPI for immediate drips

## License

ISC © [Mhue.ai](https://mhue.ai)
