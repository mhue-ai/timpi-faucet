# Timpi Drip Deployment Guide

## Prerequisites

- Docker & Docker Compose
- ~100k NTMPI to fund the faucet
- Domain pointing to your server (optional but recommended)

## Quick Start

### 1. Clone & Configure

```bash
git clone https://github.com/mhue-ai/timpi-faucet.git
cd timpi-faucet

# Create environment file
cat > .env << 'EOF'
FAUCET_WALLET_PASSWORD=your-secure-password-here
ADMIN_PASSWORD=your-admin-password-here
ADMIN_IP_ALLOWLIST=127.0.0.1,::1,YOUR_IP_HERE
EOF
```

### 2. First Run (Wallet Initialization)

```bash
docker-compose up
```

On first run, the container will:
1. Generate a new wallet
2. Display the **mnemonic** (SAVE THIS!)
3. Display the **address** to fund
4. Wait for funds before starting

Example output:
```
═══════════════════════════════════════════════════════════════
  FAUCET WALLET CREATED
═══════════════════════════════════════════════════════════════

  Address: neutaro1abc123...

  ⚠️  SAVE YOUR MNEMONIC (shown once):

  word1 word2 word3 ... word24

═══════════════════════════════════════════════════════════════
```

### 3. Fund the Wallet

Send NTMPI to the displayed address. Recommended:
- **95,000 NTMPI** for staking (17% APY)
- **5,000 NTMPI** liquid buffer for drips

The container will auto-detect funds and start.

### 4. Verify

```bash
# Check health
curl http://localhost:3000/health

# Check status
curl http://localhost:3000/api/status

# View logs
docker-compose logs -f
```

### 5. Access Admin

Navigate to `http://YOUR_IP:3000/admin.html`
- Login with your `ADMIN_PASSWORD`
- Must be from an IP in `ADMIN_IP_ALLOWLIST`

## Production Setup

### Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name drip.clawpurse.ai;
    
    ssl_certificate /etc/letsencrypt/live/drip.clawpurse.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/drip.clawpurse.ai/privkey.pem;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Cloudflare (Recommended)

1. Add DNS record: `drip.clawpurse.ai` → your server IP
2. Enable proxy (orange cloud)
3. SSL/TLS: Full (strict)
4. Enable "Under Attack Mode" if needed

### Staking the Pool

After funding, stake most of the balance:

```bash
# Enter container
docker exec -it timpi-drip sh

# Check balance
node -e "const {loadKeystore,getBalance}=require('clawpurse');(async()=>{const{address}=await loadKeystore(process.env.FAUCET_WALLET_PASSWORD);const b=await getBalance(address);console.log(b.primary.displayAmount,'NTMPI')})();"

# Stake (from admin UI or via ClawPurse CLI)
```

Or use the Admin UI → Staking Configuration.

## Maintenance

### Backup

```bash
# Backup wallet and database
docker run --rm -v timpi-drip-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/drip-backup-$(date +%Y%m%d).tar.gz /data
```

### Restore

```bash
docker-compose down
docker run --rm -v timpi-drip-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/drip-backup-YYYYMMDD.tar.gz -C /
docker-compose up -d
```

### Update

```bash
git pull
docker-compose build --no-cache
docker-compose up -d
```

## Troubleshooting

### Container won't start
- Check `docker-compose logs`
- Verify `.env` has required passwords

### Admin login fails
- Check your IP is in `ADMIN_IP_ALLOWLIST`
- Behind proxy? Add proxy's IP range

### Low balance alerts
- Fund the wallet or unstake some NTMPI
- Check admin dashboard for current levels

### PoW too hard/easy
- Adjust `POW_DIFFICULTY` in `.env` (4 = ~65k attempts)
- Restart container after changes
